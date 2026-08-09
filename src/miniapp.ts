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
import {
  currentMonthKey,
  getSubmission,
  getUser,
  isAdmin,
  monthlySubmissionCount,
  upsertUser,
} from './db';
import { normalizeLocale, SUPPORTED_LANGUAGES, t } from './i18n/index';
import { getSubscriptionState } from './subscription';
import { deliverSubmissionToAdmin } from './submissions';
import { TelegramClient, type TelegramUser } from './telegram';

const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;
const UPLOAD_HTTP_LIMIT_BYTES = MINI_APP_MAX_UPLOAD_BYTES + 2 * 1024 * 1024;

type MiniAppQueueRow = {
  id: number;
  title: string;
  original_language: string;
  chapter_count: number;
  publication_status?: string;
  source_url?: string | null;
  queue_status: 'queued' | 'in_progress' | 'completed' | null;
  queue_position: number | null;
  current_chapter: number | null;
  progress_updated_at: string | null;
  updated_at: string;
};

type MiniAppRequestRow = MiniAppQueueRow & {
  status: string;
  slot_returned: number;
  created_at: string;
  plan: string;
};

type AuthContext = {
  telegramUser: TelegramUser;
  dbUser: Awaited<ReturnType<typeof getUser>>;
  locale: ReturnType<typeof normalizeLocale>;
  admin: boolean;
};

export async function handleMiniAppRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/')) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: apiHeaders() });
  }

  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);
  const auth = await authenticateMiniApp(request, env);
  if (auth instanceof Response) return auth;

  try {
    if (request.method === 'GET' && url.pathname === '/api/app/bootstrap') {
      return json(await buildBootstrap(auth, env, telegram));
    }

    if (request.method === 'GET' && url.pathname === '/api/app/queue') {
      return json(await getQueuePayload(env));
    }

    if (request.method === 'GET' && url.pathname === '/api/app/requests') {
      return json({ requests: await getMyRequests(env, auth.telegramUser.id, 100) });
    }

    const novelMatch = /^\/api\/app\/novel\/(\d+)$/.exec(url.pathname);
    if (request.method === 'GET' && novelMatch) {
      const id = Number(novelMatch[1]);
      const submission = await getSubmission(env, id);
      if (!submission) return jsonError('not_found', 'Novel request not found.', 404);
      const canRead =
        submission.status === 'accepted' || submission.user_id === auth.telegramUser.id || auth.admin;
      if (!canRead) return jsonError('forbidden', 'You cannot view this request.', 403);
      return json({ novel: submission });
    }

    if (request.method === 'POST' && url.pathname === '/api/app/language') {
      return updateLanguage(request, auth, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/app/submit') {
      return submitFromMiniApp(request, auth, env, telegram, ctx);
    }

    if (url.pathname === '/api/app/admin/list' && request.method === 'GET') {
      if (!auth.admin) return jsonError('forbidden', 'Admin access required.', 403);
      const kind = url.searchParams.get('kind') ?? 'pending';
      return json(await getAdminList(env, kind));
    }

    if (url.pathname === '/api/app/admin/action' && request.method === 'POST') {
      if (!auth.admin) return jsonError('forbidden', 'Admin access required.', 403);
      return runAdminAction(request, env, telegram);
    }

    return jsonError('not_found', 'API route not found.', 404);
  } catch (error) {
    console.error(JSON.stringify({ event: 'miniapp_api_failed', path: url.pathname, error: errorText(error) }));
    return jsonError('temporary_error', 'Something went wrong. Please try again.', 500);
  }
}

async function authenticateMiniApp(request: Request, env: Env): Promise<AuthContext | Response> {
  const initData = getInitDataHeader(request);
  if (!initData) return jsonError('unauthorized', 'Open this app from Telegram.', 401);

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDateRaw = params.get('auth_date');
  const userRaw = params.get('user');
  if (!hash || !authDateRaw || !userRaw) {
    return jsonError('unauthorized', 'Telegram authorization data is incomplete.', 401);
  }

  const authDate = Number(authDateRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate > now + 300 || now - authDate > INIT_DATA_MAX_AGE_SECONDS) {
    return jsonError('auth_expired', 'Telegram authorization has expired. Reopen the Mini App.', 401);
  }

  const entries = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n');

  const encoder = new TextEncoder();
  const webAppKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const secret = await crypto.subtle.sign('HMAC', webAppKey, encoder.encode(env.TELEGRAM_BOT_TOKEN));
  const verificationKey = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  let signature: Uint8Array;
  try {
    signature = hexToBytes(hash);
  } catch {
    return jsonError('unauthorized', 'Telegram authorization signature is invalid.', 401);
  }

  const valid = await crypto.subtle.verify(
    'HMAC',
    verificationKey,
    signature,
    encoder.encode(dataCheckString),
  );
  if (!valid) return jsonError('unauthorized', 'Telegram authorization signature is invalid.', 401);

  let telegramUser: TelegramUser;
  try {
    telegramUser = JSON.parse(userRaw) as TelegramUser;
  } catch {
    return jsonError('unauthorized', 'Telegram user data is invalid.', 401);
  }
  if (!Number.isSafeInteger(telegramUser.id) || telegramUser.id <= 0) {
    return jsonError('unauthorized', 'Telegram user data is invalid.', 401);
  }

  await upsertUser(env, telegramUser);
  const dbUser = await getUser(env, telegramUser.id);
  return {
    telegramUser,
    dbUser,
    locale: normalizeLocale(dbUser?.language),
    admin: isAdmin(telegramUser.id, env),
  };
}

function getInitDataHeader(request: Request): string {
  const direct = request.headers.get('x-telegram-init-data');
  if (direct) return direct;
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.toLowerCase().startsWith('tma ') ? authorization.slice(4) : '';
}

async function buildBootstrap(auth: AuthContext, env: Env, telegram: TelegramClient) {
  const [subscription, used, queue, requests] = await Promise.all([
    getSubscriptionState(auth.telegramUser.id, env, telegram),
    monthlySubmissionCount(env, auth.telegramUser.id),
    getQueuePayload(env),
    getMyRequests(env, auth.telegramUser.id, 4),
  ]);
  const limit = subscription.subscriber
    ? SUBSCRIBER_MONTHLY_REQUEST_LIMIT
    : FREE_MONTHLY_REQUEST_LIMIT;

  return {
    user: {
      id: auth.telegramUser.id,
      first_name: auth.telegramUser.first_name ?? auth.dbUser?.first_name ?? '',
      username: auth.telegramUser.username ?? auth.dbUser?.username ?? null,
      locale: auth.locale,
      is_admin: auth.admin,
    },
    account: {
      plan: subscription.subscriber ? 'subscriber' : 'regular',
      verification_error: subscription.verificationError,
      used,
      limit,
      remaining: Math.max(0, limit - used),
      regular_max_chapters: REGULAR_MAX_CHAPTERS,
      boosty_url: env.BOOSTY_SUBSCRIPTION_URL,
    },
    queue,
    my_requests: requests,
    admin: auth.admin ? await getAdminCounts(env) : null,
  };
}

async function getQueuePayload(env: Env) {
  const active = await env.DB.prepare(`
    SELECT id, title, original_language, chapter_count, publication_status, source_url,
           queue_status, queue_position, current_chapter, progress_updated_at, updated_at
    FROM submissions
    WHERE status = 'accepted' AND queue_status = 'in_progress'
    ORDER BY COALESCE(started_at, updated_at) ASC, id ASC
    LIMIT 5
  `).all<MiniAppQueueRow>();

  const upcoming = await env.DB.prepare(`
    SELECT id, title, original_language, chapter_count, publication_status, source_url,
           queue_status, queue_position, current_chapter, progress_updated_at, updated_at
    FROM submissions
    WHERE status = 'accepted' AND queue_status = 'queued'
    ORDER BY COALESCE(queue_position, 2147483647) ASC, id ASC
    LIMIT 100
  `).all<MiniAppQueueRow>();

  const completed = await env.DB.prepare(`
    SELECT id, title, original_language, chapter_count, publication_status, source_url,
           queue_status, queue_position, current_chapter, progress_updated_at, updated_at
    FROM submissions
    WHERE status = 'accepted' AND queue_status = 'completed'
    ORDER BY COALESCE(completed_at, updated_at) DESC, id DESC
    LIMIT 30
  `).all<MiniAppQueueRow>();

  return {
    active: active.results.map(withProgress),
    upcoming: upcoming.results.map(withProgress),
    completed: completed.results.map(withProgress),
  };
}

async function getMyRequests(env: Env, userId: number, limit: number) {
  const rows = await env.DB.prepare(`
    SELECT id, title, original_language, chapter_count, publication_status,
           status, slot_returned, queue_status, queue_position, plan,
           current_chapter, progress_updated_at, created_at, updated_at
    FROM submissions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).bind(userId, limit).all<MiniAppRequestRow>();
  return rows.results.map((row) => ({ ...row, ...withProgress(row), state: requestState(row) }));
}

function withProgress(row: MiniAppQueueRow) {
  const current = Number(row.current_chapter ?? 0);
  const total = Number(row.chapter_count ?? 0);
  const progress = current > 0 && total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : null;
  return { ...row, progress_percent: progress };
}

function requestState(row: { status: string; slot_returned: number; queue_status: string | null }): string {
  if (row.status === 'pending') return 'pending';
  if (row.status === 'rejected') return row.slot_returned ? 'rejected_returned' : 'rejected';
  if (row.queue_status === 'completed') return 'completed';
  if (row.queue_status === 'in_progress') return 'in_progress';
  return 'queued';
}

async function updateLanguage(request: Request, auth: AuthContext, env: Env): Promise<Response> {
  const body = await readJson<{ locale?: string }>(request);
  const allowed = new Set(SUPPORTED_LANGUAGES.map((item) => item.code));
  if (!body.locale || !allowed.has(body.locale as never)) {
    return jsonError('invalid_locale', 'Unsupported interface language.', 400);
  }
  await env.DB.prepare('UPDATE users SET language = ?, language_selected = 1, updated_at = ? WHERE telegram_id = ?')
    .bind(body.locale, new Date().toISOString(), auth.telegramUser.id)
    .run();
  return json({ ok: true, locale: body.locale });
}

async function submitFromMiniApp(
  request: Request,
  auth: AuthContext,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<Response> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > UPLOAD_HTTP_LIMIT_BYTES) {
    return jsonError('file_too_large', 'TXT/EPUB files must be 45 MB or smaller.', 413);
  }

  const form = await request.formData();
  const fileValue = form.get('file');
  if (!(fileValue instanceof File) || fileValue.size <= 0) {
    return jsonError('file_required', 'Choose a TXT or EPUB file.', 400);
  }
  if (fileValue.size > MINI_APP_MAX_UPLOAD_BYTES) {
    return jsonError('file_too_large', 'TXT/EPUB files must be 45 MB or smaller.', 413);
  }
  const extension = fileExtension(fileValue.name);
  if (!MINI_APP_ALLOWED_FILE_EXTENSIONS.includes(extension as (typeof MINI_APP_ALLOWED_FILE_EXTENSIONS)[number])) {
    return jsonError('unsupported_file', 'Only TXT and EPUB files are supported in the Mini App.', 400);
  }

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

  if (!rulesAccepted) return jsonError('rules_required', 'Please confirm the Dollar TL submission rules.', 400);
  if (!title || title.length > MAX_TITLE) return jsonError('invalid_title', `Novel title must be 1-${MAX_TITLE} characters.`, 400);
  if (!originalLanguage || originalLanguage.length > 120) return jsonError('invalid_language', 'Enter the original language.', 400);
  if (!Number.isInteger(chapterCount) || chapterCount <= 0 || chapterCount > MAX_REASONABLE_CHAPTERS) {
    return jsonError('invalid_chapters', 'Enter a valid chapter count.', 400);
  }
  if (publicationStatus !== 'ongoing' && publicationStatus !== 'completed') {
    return jsonError('invalid_status', 'Choose whether the novel is ongoing or completed.', 400);
  }
  if (sourceUrl && (sourceUrl.length > MAX_SOURCE || !isHttpUrl(sourceUrl))) {
    return jsonError('invalid_source', 'Enter a valid http(s) source URL.', 400);
  }
  if (!genresTags || genresTags.length > MAX_LONG) return jsonError('invalid_tags', 'Add the main genres and tags.', 400);
  if (!sexualContent || sexualContent.length > MAX_LONG) return jsonError('invalid_content', 'Complete the sexual content disclosure.', 400);
  if (!sensitiveContent || sensitiveContent.length > MAX_LONG) return jsonError('invalid_sensitive', 'Complete the sensitive content disclosure.', 400);
  if (notes.length > MAX_LONG) return jsonError('invalid_notes', 'Additional notes are too long.', 400);

  const usedBefore = await monthlySubmissionCount(env, auth.telegramUser.id);
  const subscription = await getSubscriptionState(auth.telegramUser.id, env, telegram);
  if (subscription.verificationError && (usedBefore >= FREE_MONTHLY_REQUEST_LIMIT || chapterCount > REGULAR_MAX_CHAPTERS)) {
    return jsonError('verification_unavailable', 'Boosty verification is temporarily unavailable. Please try again later.', 503);
  }
  if (!subscription.subscriber && chapterCount > REGULAR_MAX_CHAPTERS) {
    return jsonError('chapter_limit', `Regular users can suggest novels with up to ${REGULAR_MAX_CHAPTERS} chapters.`, 409);
  }

  const plan: 'free' | 'subscriber' = subscription.subscriber ? 'subscriber' : 'free';
  const limit = subscription.subscriber ? SUBSCRIBER_MONTHLY_REQUEST_LIMIT : FREE_MONTHLY_REQUEST_LIMIT;
  if (usedBefore >= limit) return jsonError('quota_reached', 'Your monthly request limit has been reached.', 409);

  const uploaded = await telegram.sendDocumentUpload(
    env.ADMIN_TELEGRAM_ID,
    fileValue,
    `📎 Mini App raw file from ${auth.telegramUser.username ? `@${auth.telegramUser.username}` : auth.telegramUser.first_name ?? auth.telegramUser.id}`,
  );
  const fileId = uploaded.document?.file_id;
  if (!fileId) return jsonError('telegram_upload_failed', 'Telegram did not return a reusable file ID.', 502);

  const now = new Date().toISOString();
  const monthKey = currentMonthKey();
  const insert = await env.DB.prepare(`
    INSERT INTO submissions (
      user_id, username_snapshot, language, month_key, title, original_language,
      chapter_count, publication_status, source_url, raw_file_id, raw_file_name,
      raw_file_mime, genres_tags, sexual_content, sensitive_content, notes,
      plan, status, slot_returned, admin_summary_sent, admin_file_sent, created_at, updated_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, 1, ?, ?
    WHERE (
      SELECT COUNT(*) FROM submissions
      WHERE user_id = ? AND month_key = ? AND slot_returned = 0
    ) < ?
  `).bind(
    auth.telegramUser.id,
    auth.telegramUser.username ?? null,
    auth.locale,
    monthKey,
    title,
    originalLanguage,
    chapterCount,
    publicationStatus,
    sourceUrl || null,
    fileId,
    fileValue.name || null,
    fileValue.type || null,
    genresTags,
    sexualContent,
    sensitiveContent,
    notes || null,
    plan,
    now,
    now,
    auth.telegramUser.id,
    monthKey,
    limit,
  ).run();

  if ((insert.meta.changes ?? 0) === 0) {
    return jsonError('quota_race', 'Your monthly request limit was reached before submission completed.', 409);
  }

  const submissionId = Number(insert.meta.last_row_id);
  ctx.waitUntil(deliverSubmissionToAdmin(submissionId, env, telegram));
  ctx.waitUntil(telegram.sendMessage(auth.telegramUser.id, t(auth.locale, 'submitted')).catch(() => undefined));

  return json({
    ok: true,
    submission_id: submissionId,
    used: usedBefore + 1,
    limit,
    remaining: Math.max(0, limit - usedBefore - 1),
  }, 201);
}

async function getAdminCounts(env: Env) {
  const row = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'accepted' AND queue_status = 'queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status = 'accepted' AND queue_status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status = 'accepted' AND queue_status = 'completed' THEN 1 ELSE 0 END) AS completed,
      COUNT(*) AS total
    FROM submissions
  `).first<{ pending: number; queued: number; in_progress: number; completed: number; total: number }>();
  return {
    pending: Number(row?.pending ?? 0),
    queued: Number(row?.queued ?? 0),
    in_progress: Number(row?.in_progress ?? 0),
    completed: Number(row?.completed ?? 0),
    total: Number(row?.total ?? 0),
  };
}

async function getAdminList(env: Env, kind: string) {
  const where = kind === 'queue'
    ? "s.status = 'accepted' AND s.queue_status IN ('queued', 'in_progress')"
    : kind === 'all'
      ? '1 = 1'
      : "s.status = 'pending'";
  const order = kind === 'queue'
    ? "CASE WHEN s.queue_status = 'in_progress' THEN 0 ELSE 1 END, COALESCE(s.queue_position, 2147483647), s.id"
    : 's.id DESC';
  const rows = await env.DB.prepare(`
    SELECT s.id, s.user_id, s.title, s.original_language, s.chapter_count,
           s.publication_status, s.source_url, s.genres_tags, s.sexual_content,
           s.sensitive_content, s.notes, s.plan, s.status, s.slot_returned,
           s.queue_status, s.queue_position, s.current_chapter, s.progress_updated_at,
           s.created_at, s.updated_at, u.username, u.first_name
    FROM submissions s
    LEFT JOIN users u ON u.telegram_id = s.user_id
    WHERE ${where}
    ORDER BY ${order}
    LIMIT 100
  `).all<Record<string, unknown>>();
  return { counts: await getAdminCounts(env), requests: rows.results };
}

async function runAdminAction(request: Request, env: Env, telegram: TelegramClient): Promise<Response> {
  const body = await readJson<{ id?: number; action?: string; current_chapter?: number }>(request);
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !body.action) return jsonError('invalid_action', 'Invalid admin action.', 400);
  const submission = await getSubmission(env, id);
  if (!submission) return jsonError('not_found', 'Request not found.', 404);
  const now = new Date().toISOString();

  switch (body.action) {
    case 'accept': {
      if (submission.status !== 'pending') return jsonError('invalid_state', 'Request is no longer pending.', 409);
      await env.DB.prepare(`
        UPDATE submissions
        SET status = 'accepted', queue_status = 'queued',
            queue_position = (SELECT COALESCE(MAX(queue_position), 0) + 1 FROM submissions WHERE status = 'accepted'),
            queued_at = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
      `).bind(now, now, id).run();
      await telegram.sendMessage(submission.user_id, t(normalizeLocale(submission.language), 'acceptedToQueue'));
      break;
    }
    case 'reject':
    case 'return': {
      if (submission.status !== 'pending') return jsonError('invalid_state', 'Request is no longer pending.', 409);
      const returned = body.action === 'return' ? 1 : 0;
      await env.DB.prepare("UPDATE submissions SET status = 'rejected', slot_returned = ?, updated_at = ? WHERE id = ? AND status = 'pending'")
        .bind(returned, now, id).run();
      await telegram.sendMessage(
        submission.user_id,
        t(normalizeLocale(submission.language), returned ? 'statusRejectedReturned' : 'statusRejected'),
      );
      break;
    }
    case 'start': {
      if (submission.status !== 'accepted') return jsonError('invalid_state', 'Only accepted requests can be started.', 409);
      await env.DB.prepare("UPDATE submissions SET queue_status = 'in_progress', started_at = COALESCE(started_at, ?), updated_at = ? WHERE id = ?")
        .bind(now, now, id).run();
      await telegram.sendMessage(submission.user_id, t(normalizeLocale(submission.language), 'translationStarted'));
      break;
    }
    case 'complete': {
      if (submission.status !== 'accepted') return jsonError('invalid_state', 'Only accepted requests can be completed.', 409);
      await env.DB.prepare(`
        UPDATE submissions
        SET queue_status = 'completed', completed_at = ?, current_chapter = chapter_count,
            progress_updated_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(now, now, now, id).run();
      await telegram.sendMessage(submission.user_id, t(normalizeLocale(submission.language), 'translationCompleted'));
      break;
    }
    case 'backqueue': {
      if (submission.status !== 'accepted') return jsonError('invalid_state', 'Only accepted requests can be returned to queue.', 409);
      await env.DB.prepare("UPDATE submissions SET queue_status = 'queued', started_at = NULL, updated_at = ? WHERE id = ?")
        .bind(now, id).run();
      break;
    }
    case 'up':
    case 'down': {
      if (submission.status !== 'accepted' || submission.queue_status !== 'queued') {
        return jsonError('invalid_state', 'Only queued requests can be reordered.', 409);
      }
      await moveQueueItem(id, body.action === 'up' ? -1 : 1, env);
      break;
    }
    case 'progress': {
      if (submission.status !== 'accepted' || submission.queue_status !== 'in_progress') {
        return jsonError('invalid_state', 'Start the translation before setting progress.', 409);
      }
      const chapter = Number(body.current_chapter);
      if (!Number.isInteger(chapter) || chapter < 0 || chapter > submission.chapter_count) {
        return jsonError('invalid_progress', `Current chapter must be between 0 and ${submission.chapter_count}.`, 400);
      }
      await env.DB.prepare('UPDATE submissions SET current_chapter = ?, progress_updated_at = ?, updated_at = ? WHERE id = ?')
        .bind(chapter, now, now, id).run();
      break;
    }
    default:
      return jsonError('invalid_action', 'Unsupported admin action.', 400);
  }

  return json({ ok: true, novel: await getSubmission(env, id), counts: await getAdminCounts(env) });
}

async function moveQueueItem(submissionId: number, direction: -1 | 1, env: Env): Promise<void> {
  const current = await env.DB.prepare("SELECT queue_position FROM submissions WHERE id = ? AND queue_status = 'queued'")
    .bind(submissionId).first<{ queue_position: number | null }>();
  if (!current?.queue_position) return;
  const operator = direction < 0 ? '<' : '>';
  const order = direction < 0 ? 'DESC' : 'ASC';
  const adjacent = await env.DB.prepare(`
    SELECT id, queue_position FROM submissions
    WHERE status = 'accepted' AND queue_status = 'queued' AND queue_position ${operator} ?
    ORDER BY queue_position ${order}, id ${order}
    LIMIT 1
  `).bind(current.queue_position).first<{ id: number; queue_position: number }>();
  if (!adjacent) return;
  const now = new Date().toISOString();
  const temp = -submissionId;
  await env.DB.batch([
    env.DB.prepare('UPDATE submissions SET queue_position = ?, updated_at = ? WHERE id = ?').bind(temp, now, submissionId),
    env.DB.prepare('UPDATE submissions SET queue_position = ?, updated_at = ? WHERE id = ?').bind(current.queue_position, now, adjacent.id),
    env.DB.prepare('UPDATE submissions SET queue_position = ?, updated_at = ? WHERE id = ?').bind(adjacent.queue_position, now, submissionId),
  ]);
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

async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    return {} as T;
  }
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error('invalid hex');
  const result = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) result[i / 2] = Number.parseInt(value.slice(i, i + 2), 16);
  return result;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...apiHeaders(), 'content-type': 'application/json; charset=utf-8' },
  });
}

function jsonError(code: string, message: string, status: number): Response {
  return json({ ok: false, error: { code, message } }, status);
}

function apiHeaders(): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
  };
}

function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
