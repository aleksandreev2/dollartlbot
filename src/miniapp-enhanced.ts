import {
  FREE_MONTHLY_REQUEST_LIMIT,
  MAX_LONG,
  MAX_REASONABLE_CHAPTERS,
  MAX_SOURCE,
  MAX_TITLE,
  MINI_APP_ALLOWED_FILE_EXTENSIONS,
  MINI_APP_MAX_UPLOAD_BYTES,
  REGULAR_MAX_CHAPTERS,
  SUBSCRIBER_MONTHLY_REQUEST_LIMIT,
} from './domain';
import { currentMonthKey, errorText } from './db';
import { maybeExtractEpubCover, storeSubmissionCover } from './covers';
import { normalizeLocale, t } from './i18n/index';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import {
  attachFileToSubmissionReservation,
  cleanupExpiredSubmissionReservations,
  commitSubmissionReservation,
  failSubmissionReservation,
  getQuotaState,
  reserveSubmissionQuota,
} from './quota';
import { applyLiveQueuePosition, getQueuePositionMap } from './queue';
import { getSubscriptionState } from './subscription';
import { deliverSubmissionToAdmin } from './submissions';
import { TelegramClient } from './telegram';

const UPLOAD_HTTP_LIMIT_BYTES = MINI_APP_MAX_UPLOAD_BYTES + 2 * 1024 * 1024;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{16,80}$/;

export async function handleEnhancedMiniAppRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/api/app/submit') return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.dbUser?.adult_confirmed_at || !auth.dbUser?.miniapp_onboarded_at) {
    return miniAppJsonError(
      'onboarding_required',
      'Complete the Mini App welcome guide and age confirmation before submitting a novel.',
      403,
    );
  }
  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > UPLOAD_HTTP_LIMIT_BYTES) {
    return miniAppJsonError('file_too_large', 'TXT/EPUB files must be 45 MB or smaller.', 413);
  }

  const form = await request.formData();
  const fileValue = form.get('file');
  if (!(fileValue instanceof File) || fileValue.size <= 0) {
    return miniAppJsonError('file_required', 'Choose a TXT or EPUB file.', 400);
  }
  if (fileValue.size > MINI_APP_MAX_UPLOAD_BYTES) {
    return miniAppJsonError('file_too_large', 'TXT/EPUB files must be 45 MB or smaller.', 413);
  }
  const extension = fileExtension(fileValue.name);
  if (!MINI_APP_ALLOWED_FILE_EXTENSIONS.includes(extension as (typeof MINI_APP_ALLOWED_FILE_EXTENSIONS)[number])) {
    return miniAppJsonError('unsupported_file', 'Only TXT and EPUB files are supported in the Mini App.', 400);
  }

  const suppliedRequestId = field(form, 'request_id');
  const title = field(form, 'title');
  const originalLanguage = field(form, 'original_language');
  const chapterCount = Number(field(form, 'chapter_count'));
  const publicationStatus = field(form, 'publication_status');
  const sourceUrl = field(form, 'source_url');
  const genresTags = field(form, 'genres_tags');
  const sexualContent = field(form, 'sexual_content');
  const sensitiveContent = field(form, 'sensitive_content');
  const notes = field(form, 'notes');
  const rulesAccepted = field(form, 'rules_accepted') === 'true';

  if (suppliedRequestId && !REQUEST_ID_RE.test(suppliedRequestId)) {
    return miniAppJsonError('invalid_request_id', 'Restart the submission form and try again.', 400);
  }
  if (!rulesAccepted) return miniAppJsonError('rules_required', 'Please confirm the Dollar TL submission rules.', 400);
  if (!title || title.length > MAX_TITLE) return miniAppJsonError('invalid_title', `Novel title must be 1-${MAX_TITLE} characters.`, 400);
  if (!originalLanguage || originalLanguage.length > 120) return miniAppJsonError('invalid_language', 'Enter the original language.', 400);
  if (!Number.isInteger(chapterCount) || chapterCount <= 0 || chapterCount > MAX_REASONABLE_CHAPTERS) {
    return miniAppJsonError('invalid_chapters', 'Enter a valid chapter count.', 400);
  }
  if (publicationStatus !== 'ongoing' && publicationStatus !== 'completed') {
    return miniAppJsonError('invalid_status', 'Choose whether the novel is ongoing or completed.', 400);
  }
  if (sourceUrl && (sourceUrl.length > MAX_SOURCE || !isHttpUrl(sourceUrl))) {
    return miniAppJsonError('invalid_source', 'Enter a valid http(s) source URL.', 400);
  }
  if (!genresTags || genresTags.length > MAX_LONG) return miniAppJsonError('invalid_tags', 'Add the main genres and tags.', 400);
  if (!sexualContent || sexualContent.length > MAX_LONG) return miniAppJsonError('invalid_content', 'Complete the sexual content disclosure.', 400);
  if (!sensitiveContent || sensitiveContent.length > MAX_LONG) return miniAppJsonError('invalid_sensitive', 'Complete the sensitive content disclosure.', 400);
  if (notes.length > MAX_LONG) return miniAppJsonError('invalid_notes', 'Additional notes are too long.', 400);

  const subscription = await getSubscriptionState(auth.telegramUser.id, env, telegram);
  const baseLimit = subscription.subscriber
    ? SUBSCRIBER_MONTHLY_REQUEST_LIMIT
    : FREE_MONTHLY_REQUEST_LIMIT;

  if (subscription.verificationError && chapterCount > REGULAR_MAX_CHAPTERS) {
    return miniAppJsonError('verification_unavailable', 'Boosty verification is temporarily unavailable. Please try again later.', 503);
  }
  if (!subscription.subscriber && chapterCount > REGULAR_MAX_CHAPTERS) {
    return miniAppJsonError('chapter_limit', `Regular users can suggest novels with up to ${REGULAR_MAX_CHAPTERS} chapters.`, 409);
  }

  const now = new Date().toISOString();
  const monthKey = currentMonthKey();
  const payloadFingerprint = await submissionFingerprint({
    title,
    originalLanguage,
    chapterCount,
    publicationStatus,
    sourceUrl,
    genresTags,
    sexualContent,
    sensitiveContent,
    notes,
    file: fileValue,
  });
  const requestId = suppliedRequestId || `auto_${monthKey.replace(/[^0-9]/g, '')}_${payloadFingerprint.slice(0, 48)}`;

  await cleanupExpiredSubmissionReservations(env, new Date(now));
  const reservationResult = await reserveSubmissionQuota(env, {
    userId: auth.telegramUser.id,
    requestId,
    payloadFingerprint,
    monthKey,
    baseLimit,
    now,
  });

  if (reservationResult?.status === 'committed') {
    return submissionResultResponse(
      env,
      auth.telegramUser.id,
      baseLimit,
      reservationResult.submissionId,
      false,
      200,
    );
  }
  if (reservationResult?.status === 'payload_mismatch') {
    return miniAppJsonError(
      'idempotency_conflict',
      'This submission retry no longer matches the original request. Restart the form and submit again.',
      409,
    );
  }
  if (reservationResult?.status === 'in_progress') {
    return miniAppJsonError(
      'submission_in_progress',
      'This submission is already being processed. Wait a moment and try again.',
      409,
    );
  }
  if (!reservationResult || reservationResult.status !== 'reserved') {
    if (subscription.verificationError) {
      return miniAppJsonError('verification_unavailable', 'Boosty verification is temporarily unavailable. Please try again later.', 503);
    }
    return miniAppJsonError('quota_reached', 'Your monthly request limit has been reached.', 409);
  }

  const reservation = reservationResult.reservation;
  let extractedCover = null;
  if (extension === 'epub') {
    try {
      extractedCover = await maybeExtractEpubCover(fileValue);
    } catch (error) {
      console.warn(JSON.stringify({ event: 'epub_cover_extract_failed', user_id: auth.telegramUser.id, error: String(error) }));
    }
  }

  if (!reservation.rawFileId) {
    let uploaded;
    try {
      uploaded = await telegram.sendDocumentUpload(
        env.ADMIN_TELEGRAM_ID,
        fileValue,
        `📎 Mini App raw file from ${auth.telegramUser.username ? `@${auth.telegramUser.username}` : auth.telegramUser.first_name ?? auth.telegramUser.id}`,
      );
    } catch (error) {
      await failSubmissionReservation(env, reservation.id, errorText(error));
      console.warn(JSON.stringify({
        event: 'miniapp_raw_upload_failed',
        user_id: auth.telegramUser.id,
        request_id: requestId,
        error: errorText(error),
      }));
      return miniAppJsonError('telegram_upload_failed', 'Could not transfer the file to Telegram. Please try again.', 502);
    }

    const fileId = uploaded.document?.file_id;
    if (!fileId) {
      await failSubmissionReservation(env, reservation.id, 'Telegram returned no document file_id.');
      return miniAppJsonError('telegram_upload_failed', 'Telegram did not return a reusable file ID.', 502);
    }

    const attached = await attachFileToSubmissionReservation(env, reservation.id, {
      id: fileId,
      name: fileValue.name || null,
      mime: fileValue.type || null,
    });
    if (!attached) {
      console.error(JSON.stringify({
        event: 'miniapp_raw_upload_untracked',
        user_id: auth.telegramUser.id,
        request_id: requestId,
        reservation_id: reservation.id,
      }));
      return miniAppJsonError(
        'submission_state_lost',
        'The file reached Telegram, but the submission state could not be saved. Please contact support before retrying.',
        503,
      );
    }
  }

  const plan: 'free' | 'subscriber' = subscription.subscriber ? 'subscriber' : 'free';
  let insert;
  try {
    insert = await commitSubmissionReservation(env, reservation.id, requestId, payloadFingerprint, {
      userId: auth.telegramUser.id,
      username: auth.telegramUser.username ?? null,
      locale: auth.locale,
      monthKey,
      title,
      originalLanguage,
      chapterCount,
      publicationStatus,
      sourceUrl: sourceUrl || null,
      genresTags,
      sexualContent,
      sensitiveContent,
      notes: notes || null,
      plan,
      adminSummarySent: 0,
      adminFileSent: 1,
      now,
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'miniapp_submission_commit_failed',
      user_id: auth.telegramUser.id,
      request_id: requestId,
      reservation_id: reservation.id,
      error: errorText(error),
    }));
    return miniAppJsonError(
      'submission_commit_failed',
      'Your file is safely stored, but the request could not be finalized. Retry this same submission to resume without uploading again.',
      503,
    );
  }

  if (extractedCover) {
    ctx.waitUntil(
      storeSubmissionCover(env, insert.submissionId, extractedCover, 'epub').catch((error) => {
        console.warn(JSON.stringify({ event: 'epub_cover_store_failed', submission_id: insert.submissionId, error: String(error) }));
      }),
    );
  }

  ctx.waitUntil(deliverSubmissionToAdmin(insert.submissionId, env, telegram));
  ctx.waitUntil(telegram.sendMessage(auth.telegramUser.id, t(normalizeLocale(auth.locale), 'submitted')).catch(() => undefined));

  return submissionResultResponse(
    env,
    auth.telegramUser.id,
    baseLimit,
    insert.submissionId,
    Boolean(extractedCover),
    201,
  );
}

export async function enhanceMiniAppResponse(
  request: Request,
  response: Response,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || !response.ok) return response;

  const positionAware = url.pathname === '/api/app/bootstrap'
    || url.pathname === '/api/app/queue'
    || url.pathname === '/api/app/requests'
    || /^\/api\/app\/novel\/\d+$/.test(url.pathname);
  if (!positionAware) return response;

  let data: any;
  try {
    data = await response.json();
  } catch {
    return response;
  }

  const positions = await getQueuePositionMap(env);
  const fix = (row: any) => row && typeof row === 'object' ? applyLiveQueuePosition(row, positions) : row;

  if (data?.queue) {
    data.queue = {
      ...data.queue,
      active: Array.isArray(data.queue.active) ? data.queue.active.map(fix) : data.queue.active,
      upcoming: Array.isArray(data.queue.upcoming) ? data.queue.upcoming.map(fix) : data.queue.upcoming,
      completed: Array.isArray(data.queue.completed) ? data.queue.completed.map(fix) : data.queue.completed,
    };
  }
  if (Array.isArray(data?.my_requests)) data.my_requests = data.my_requests.map(fix);
  if (Array.isArray(data?.requests)) data.requests = data.requests.map(fix);
  if (data?.novel) data.novel = fix(data.novel);

  if (url.pathname === '/api/app/bootstrap') {
    const userId = Number(data?.user?.id);
    const baseLimit = Number(data?.account?.limit);
    if (Number.isSafeInteger(userId) && Number.isFinite(baseLimit)) {
      const quota = await getQuotaState(env, userId, baseLimit);
      data.account = {
        ...data.account,
        used: quota.used,
        base_limit: quota.baseLimit,
        effective_base_limit: quota.effectiveBaseLimit,
        admin_adjustment: quota.adminAdjustment,
        unlimited: quota.unlimited,
        referral_bonus: quota.referralBonus,
        referral_available: quota.referralAvailable,
        referral_used: quota.referralUsed,
        referral_cap: 3,
        limit: quota.limit,
        remaining: quota.remaining,
      };
    }
  }

  return miniAppJson(data, response.status);
}

async function submissionResultResponse(
  env: Env,
  userId: number,
  baseLimit: number,
  submissionId: number,
  coverDetected: boolean,
  status: number,
): Promise<Response> {
  const [quotaAfter, row] = await Promise.all([
    getQuotaState(env, userId, baseLimit),
    env.DB.prepare(`
      SELECT quota_source
      FROM submissions
      WHERE id = ? AND user_id = ?
      LIMIT 1
    `).bind(submissionId, userId).first<{ quota_source: 'base' | 'referral' }>(),
  ]);
  return miniAppJson({
    ok: true,
    submission_id: submissionId,
    quota_source: row?.quota_source ?? 'base',
    used: quotaAfter.used,
    base_limit: quotaAfter.baseLimit,
    effective_base_limit: quotaAfter.effectiveBaseLimit,
    admin_adjustment: quotaAfter.adminAdjustment,
    unlimited: quotaAfter.unlimited,
    referral_bonus: quotaAfter.referralBonus,
    limit: quotaAfter.limit,
    remaining: quotaAfter.remaining,
    cover_detected: coverDetected,
    idempotent: status === 200,
  }, status);
}

async function submissionFingerprint(input: {
  title: string;
  originalLanguage: string;
  chapterCount: number;
  publicationStatus: string;
  sourceUrl: string;
  genresTags: string;
  sexualContent: string;
  sensitiveContent: string;
  notes: string;
  file: File;
}): Promise<string> {
  const stable = JSON.stringify({
    title: input.title,
    original_language: input.originalLanguage,
    chapter_count: input.chapterCount,
    publication_status: input.publicationStatus,
    source_url: input.sourceUrl,
    genres_tags: input.genresTags,
    sexual_content: input.sexualContent,
    sensitive_content: input.sensitiveContent,
    notes: input.notes,
    file: {
      name: input.file.name,
      size: input.file.size,
      type: input.file.type,
      last_modified: input.file.lastModified,
    },
  });
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stable));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function fileExtension(name: string): string {
  const part = name.toLowerCase().split('.').pop();
  return part ?? '';
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
