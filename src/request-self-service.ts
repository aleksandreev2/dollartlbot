import {
  MAX_LONG,
  MAX_REASONABLE_CHAPTERS,
  MAX_SHORT,
  MAX_SOURCE,
  MAX_TITLE,
  MINI_APP_ALLOWED_FILE_EXTENSIONS,
  MINI_APP_MAX_UPLOAD_BYTES,
} from './domain';
import { maybeExtractEpubCover, storeSubmissionCover } from './covers';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { sendUserNotification } from './notifications';
import { escapeHtml, type TelegramClient } from './telegram';

const MAX_THREAD_MESSAGE = 3000;
const UPLOAD_HTTP_LIMIT_BYTES = MINI_APP_MAX_UPLOAD_BYTES + 2 * 1024 * 1024;

type ReviewState = 'ready' | 'needs_info' | 'user_replied';

type ManageRow = {
  id: number;
  user_id: number;
  language: string;
  title: string;
  original_language: string;
  chapter_count: number;
  publication_status: string;
  source_url: string | null;
  raw_file_id: string;
  raw_file_name: string | null;
  raw_file_mime: string | null;
  genres_tags: string;
  sexual_content: string;
  sensitive_content: string;
  notes: string | null;
  status: string;
  slot_returned: number;
  queue_status: string | null;
  queue_position: number | null;
  review_state: ReviewState;
  review_requested_at: string | null;
  review_requested_by: number | null;
  review_resolved_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
  updated_at: string;
};

type ConversationRow = {
  id: number;
  submission_id: number;
  author_role: 'admin' | 'user' | 'system';
  author_user_id: number | null;
  kind: string;
  text: string;
  created_at: string;
};

type SourceIdentityRow = {
  identity_value: string;
  source_provider: string | null;
};

type IdentityOwnerRow = {
  submission_id: number | null;
  claim_user_id: number | null;
  claim_expires_at: string | null;
};

type EditableValues = {
  title: string;
  original_language: string;
  chapter_count: number;
  publication_status: 'ongoing' | 'completed';
  source_url: string | null;
  genres_tags: string;
  sexual_content: string;
  sensitive_content: string;
  notes: string | null;
};

type NeedsInfoCopy = { title: string; prefix: string };
const NEEDS_INFO_COPY: Record<string, NeedsInfoCopy> = {
  en: { title: 'More information needed', prefix: 'Dollar TL needs more information for this request.' },
  ru: { title: 'Нужна дополнительная информация', prefix: 'Dollar TL нужны дополнительные данные по этой заявке.' },
  es: { title: 'Se necesita más información', prefix: 'Dollar TL necesita más información para esta solicitud.' },
  fil: { title: 'Kailangan ng karagdagang impormasyon', prefix: 'Kailangan ng Dollar TL ng karagdagang detalye para sa request na ito.' },
  hi: { title: 'और जानकारी चाहिए', prefix: 'इस अनुरोध के लिए Dollar TL को और जानकारी चाहिए।' },
  pt: { title: 'Mais informações necessárias', prefix: 'A Dollar TL precisa de mais informações sobre este pedido.' },
  id: { title: 'Perlu informasi tambahan', prefix: 'Dollar TL memerlukan informasi tambahan untuk permintaan ini.' },
  vi: { title: 'Cần thêm thông tin', prefix: 'Dollar TL cần thêm thông tin cho yêu cầu này.' },
  fr: { title: 'Informations supplémentaires requises', prefix: 'Dollar TL a besoin de précisions pour cette demande.' },
  de: { title: 'Weitere Informationen erforderlich', prefix: 'Dollar TL benötigt weitere Angaben zu dieser Anfrage.' },
};

export async function handleRequestSelfService(
  request: Request,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const userMatch = /^\/api\/app\/requests\/(\d+)\/(manage|edit|raw|message|withdraw)$/.exec(url.pathname);
  const adminMatch = /^\/api\/app\/admin\/requests\/(\d+)\/(review|needs-info|resolve-info)$/.exec(url.pathname);
  if (!userMatch && !adminMatch) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  try {
    if (userMatch) {
      const id = positiveId(userMatch[1]);
      if (!id) return miniAppJsonError('invalid_request', 'Invalid request ID.', 400);
      const action = userMatch[2];
      if (request.method === 'GET' && action === 'manage') {
        return ownerManagePayload(env, id, auth.telegramUser.id);
      }
      if (request.method !== 'POST') return miniAppJsonError('method_not_allowed', 'Method not allowed.', 405);
      if (action === 'edit') return editOwnRequest(request, env, id, auth.telegramUser.id, telegram, ctx);
      if (action === 'raw') return replaceOwnRaw(request, env, id, auth.telegramUser.id, telegram, ctx);
      if (action === 'message') return messageOnOwnRequest(request, env, id, auth.telegramUser.id, telegram, ctx);
      if (action === 'withdraw') return withdrawOwnRequest(env, id, auth.telegramUser.id, telegram, ctx);
    }

    if (adminMatch) {
      if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);
      const id = positiveId(adminMatch[1]);
      if (!id) return miniAppJsonError('invalid_request', 'Invalid request ID.', 400);
      const action = adminMatch[2];
      if (request.method === 'GET' && action === 'review') return adminReviewPayload(env, id);
      if (request.method !== 'POST') return miniAppJsonError('method_not_allowed', 'Method not allowed.', 405);
      if (action === 'needs-info') {
        return requestMoreInfo(request, env, id, auth.telegramUser.id, telegram);
      }
      if (action === 'resolve-info') {
        return resolveInfo(env, id, auth.telegramUser.id);
      }
    }

    return miniAppJsonError('not_found', 'Request self-service route not found.', 404);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'request_self_service_failed',
      path: url.pathname,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }));
    return miniAppJsonError('temporary_error', 'Could not update this request. Please try again.', 500);
  }
}

async function ownerManagePayload(env: Env, id: number, userId: number): Promise<Response> {
  const row = await manageRow(env, id);
  if (!row || row.user_id !== userId) return miniAppJsonError('not_found', 'Request not found.', 404);
  return miniAppJson(await managePayload(env, row));
}

async function adminReviewPayload(env: Env, id: number): Promise<Response> {
  const row = await manageRow(env, id);
  if (!row) return miniAppJsonError('not_found', 'Request not found.', 404);
  return miniAppJson(await managePayload(env, row));
}

async function managePayload(env: Env, row: ManageRow) {
  const conversation = await env.DB.prepare(`
    SELECT id,submission_id,author_role,author_user_id,kind,text,created_at
    FROM submission_conversation
    WHERE submission_id=?
    ORDER BY id ASC
    LIMIT 100
  `).bind(row.id).all<ConversationRow>();
  const canManage = row.status === 'pending' && !row.withdrawn_at;
  return {
    request: row,
    conversation: conversation.results,
    permissions: {
      edit: canManage,
      replace_raw: canManage,
      message: canManage,
      withdraw: canManage,
    },
  };
}

async function editOwnRequest(
  request: Request,
  env: Env,
  id: number,
  userId: number,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<Response> {
  const before = await editableOwnerRow(env, id, userId);
  if (before instanceof Response) return before;
  const body = await readJson<Record<string, unknown>>(request);
  const next = editableValues(body, before);
  if (next instanceof Response) return next;

  const sourceValidation = await validateSourceIdentityChange(env, before, next.source_url);
  if (sourceValidation instanceof Response) return sourceValidation;

  const now = new Date().toISOString();
  const changed = await env.DB.prepare(`
    UPDATE submissions
    SET title=?, original_language=?, chapter_count=?, publication_status=?, source_url=?,
        genres_tags=?, sexual_content=?, sensitive_content=?, notes=?,
        review_state=CASE WHEN review_state='needs_info' THEN 'user_replied' ELSE review_state END,
        updated_at=?
    WHERE id=? AND user_id=? AND status='pending' AND withdrawn_at IS NULL
  `).bind(
    next.title,
    next.original_language,
    next.chapter_count,
    next.publication_status,
    next.source_url,
    next.genres_tags,
    next.sexual_content,
    next.sensitive_content,
    next.notes,
    now,
    id,
    userId,
  ).run();
  if (Number(changed.meta.changes ?? 0) !== 1) {
    return miniAppJsonError('stale_request', 'This request changed. Reopen it and try again.', 409);
  }

  const identitySync = await syncSourceIdentityAfterEdit(env, before, next.source_url, now);
  if (identitySync instanceof Response) {
    await env.DB.prepare('UPDATE submissions SET source_url=?,updated_at=? WHERE id=? AND user_id=? AND status=\'pending\'')
      .bind(before.source_url, new Date().toISOString(), id, userId).run();
    return identitySync;
  }

  await addConversation(env, id, 'system', userId, 'edit', 'Request details were updated.', now);
  if (before.review_state === 'needs_info') {
    ctx.waitUntil(notifyAdminUserReplied(telegram, env, id, next.title, 'The requester updated the request details.'));
  }
  return ownerManagePayload(env, id, userId);
}

async function replaceOwnRaw(
  request: Request,
  env: Env,
  id: number,
  userId: number,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<Response> {
  const before = await editableOwnerRow(env, id, userId);
  if (before instanceof Response) return before;

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > UPLOAD_HTTP_LIMIT_BYTES) {
    return miniAppJsonError('file_too_large', 'TXT/EPUB files must be 45 MB or smaller.', 413);
  }
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size <= 0) {
    return miniAppJsonError('file_required', 'Choose a TXT or EPUB file.', 400);
  }
  if (file.size > MINI_APP_MAX_UPLOAD_BYTES) {
    return miniAppJsonError('file_too_large', 'TXT/EPUB files must be 45 MB or smaller.', 413);
  }
  const extension = fileExtension(file.name);
  if (!MINI_APP_ALLOWED_FILE_EXTENSIONS.includes(extension as (typeof MINI_APP_ALLOWED_FILE_EXTENSIONS)[number])) {
    return miniAppJsonError('unsupported_file', 'Only TXT and EPUB files are supported.', 400);
  }

  let uploaded;
  try {
    uploaded = await telegram.sendDocumentUpload(
      env.ADMIN_TELEGRAM_ID,
      file,
      `📎 Replacement RAW for Dollar TL request #${id} — ${before.title}`,
    );
  } catch (error) {
    console.warn(JSON.stringify({ event: 'request_raw_replacement_upload_failed', submission_id: id, user_id: userId, error: String(error) }));
    return miniAppJsonError('telegram_upload_failed', 'Could not transfer the replacement file. Please try again.', 502);
  }
  const fileId = uploaded.document?.file_id;
  if (!fileId) return miniAppJsonError('telegram_upload_failed', 'Telegram did not return a reusable file ID.', 502);

  const now = new Date().toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE submissions
      SET raw_file_id=?, raw_file_name=?, raw_file_mime=?, admin_file_sent=1,
          review_state=CASE WHEN review_state='needs_info' THEN 'user_replied' ELSE review_state END,
          updated_at=?
      WHERE id=? AND user_id=? AND status='pending' AND withdrawn_at IS NULL
    `).bind(fileId, file.name || null, file.type || null, now, id, userId),
    env.DB.prepare(`
      INSERT INTO submission_raw_history (
        submission_id,old_file_id,old_file_name,old_file_mime,
        new_file_id,new_file_name,new_file_mime,replaced_by_user_id,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      id,
      before.raw_file_id,
      before.raw_file_name,
      before.raw_file_mime,
      fileId,
      file.name || null,
      file.type || null,
      userId,
      now,
    ),
  ]);
  if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
    return miniAppJsonError('stale_request', 'The request changed while the replacement was uploading. Contact support before retrying.', 409);
  }
  await addConversation(env, id, 'system', userId, 'raw_replaced', `RAW file replaced with ${file.name || 'new file'}.`, now);

  if (extension === 'epub') {
    ctx.waitUntil((async () => {
      try {
        const cover = await maybeExtractEpubCover(file);
        if (cover) await storeSubmissionCover(env, id, cover, 'epub');
      } catch (error) {
        console.warn(JSON.stringify({ event: 'replacement_epub_cover_failed', submission_id: id, error: String(error) }));
      }
    })());
  }
  ctx.waitUntil(notifyAdminUserReplied(telegram, env, id, before.title, 'The requester replaced the RAW file.'));
  return ownerManagePayload(env, id, userId);
}

async function messageOnOwnRequest(
  request: Request,
  env: Env,
  id: number,
  userId: number,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<Response> {
  const before = await editableOwnerRow(env, id, userId);
  if (before instanceof Response) return before;
  const body = await readJson<{ text?: string }>(request);
  const text = cleanMessage(body.text);
  if (!text) return miniAppJsonError('invalid_message', `Message must contain 1-${MAX_THREAD_MESSAGE} characters.`, 400);

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO submission_conversation (submission_id,author_role,author_user_id,kind,text,created_at)
      VALUES (?,'user',?,'user_reply',?,?)
    `).bind(id, userId, text, now),
    env.DB.prepare(`
      UPDATE submissions
      SET review_state=CASE WHEN review_state='needs_info' THEN 'user_replied' ELSE review_state END,
          updated_at=?
      WHERE id=? AND user_id=? AND status='pending' AND withdrawn_at IS NULL
    `).bind(now, id, userId),
  ]);
  ctx.waitUntil(notifyAdminUserReplied(telegram, env, id, before.title, text));
  return ownerManagePayload(env, id, userId);
}

async function withdrawOwnRequest(
  env: Env,
  id: number,
  userId: number,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<Response> {
  const before = await editableOwnerRow(env, id, userId);
  if (before instanceof Response) return before;
  const now = new Date().toISOString();
  const changed = await env.DB.prepare(`
    UPDATE submissions
    SET status='rejected', slot_returned=1, queue_status=NULL, queue_position=NULL,
        queued_at=NULL, started_at=NULL, completed_at=NULL, current_chapter=NULL,
        progress_updated_at=NULL, review_state='ready', review_resolved_at=?, withdrawn_at=?, updated_at=?
    WHERE id=? AND user_id=? AND status='pending' AND withdrawn_at IS NULL
  `).bind(now, now, now, id, userId).run();
  if (Number(changed.meta.changes ?? 0) !== 1) {
    return miniAppJsonError('stale_request', 'This request can no longer be withdrawn.', 409);
  }
  await Promise.all([
    env.DB.prepare(`
      UPDATE title_identities
      SET submission_id=NULL,claim_user_id=NULL,claim_request_id=NULL,claim_expires_at=NULL,updated_at=?
      WHERE submission_id=?
    `).bind(now, id).run(),
    env.DB.prepare('UPDATE discovery_catalog SET linked_submission_id=NULL,updated_at=? WHERE linked_submission_id=?')
      .bind(now, id).run(),
    addConversation(env, id, 'system', userId, 'withdrawn', 'Request withdrawn by the requester. The quota slot was returned.', now),
  ]);
  ctx.waitUntil(
    telegram.sendMessage(
      env.ADMIN_TELEGRAM_ID,
      `<b>Request #${id} withdrawn</b>\n\n${escapeHtml(before.title)}\nThe requester withdrew the request and the quota slot was returned.`,
    ).then(() => undefined).catch(() => undefined),
  );
  const row = await manageRow(env, id);
  return miniAppJson(await managePayload(env, row!));
}

async function requestMoreInfo(
  request: Request,
  env: Env,
  id: number,
  adminId: number,
  telegram: TelegramClient,
): Promise<Response> {
  const row = await manageRow(env, id);
  if (!row) return miniAppJsonError('not_found', 'Request not found.', 404);
  if (row.status !== 'pending' || row.withdrawn_at) {
    return miniAppJsonError('invalid_state', 'Needs info is only available for a pending request.', 409);
  }
  const body = await readJson<{ text?: string }>(request);
  const text = cleanMessage(body.text);
  if (!text) return miniAppJsonError('invalid_message', `Message must contain 1-${MAX_THREAD_MESSAGE} characters.`, 400);

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE submissions
      SET review_state='needs_info',review_requested_at=?,review_requested_by=?,review_resolved_at=NULL,updated_at=?
      WHERE id=? AND status='pending' AND withdrawn_at IS NULL
    `).bind(now, adminId, now, id),
    env.DB.prepare(`
      INSERT INTO submission_conversation (submission_id,author_role,author_user_id,kind,text,created_at)
      VALUES (?,'admin',?,'needs_info',?,?)
    `).bind(id, adminId, text, now),
    auditStatement(env, adminId, 'submission_needs_info', id, { message_length: text.length }, now),
  ]);

  const copy = NEEDS_INFO_COPY[row.language] || NEEDS_INFO_COPY.en;
  await sendUserNotification(
    env,
    telegram,
    row.user_id,
    row.language,
    'notify_request_updates',
    'request_needs_info',
    copy.title,
    `${row.title}\n${copy.prefix}\n\n${text}`,
    `/app/?view=requests&request=${id}`,
    `submission:${id}:needs_info:${now}`,
  ).catch((error) => console.warn(JSON.stringify({ event: 'needs_info_notification_delivery_failed', submission_id: id, error: String(error) })));

  return adminReviewPayload(env, id);
}

async function resolveInfo(env: Env, id: number, adminId: number): Promise<Response> {
  const row = await manageRow(env, id);
  if (!row) return miniAppJsonError('not_found', 'Request not found.', 404);
  if (row.status !== 'pending' || row.withdrawn_at) return miniAppJsonError('invalid_state', 'Only pending requests can be resolved.', 409);
  if (row.review_state === 'ready') return adminReviewPayload(env, id);

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE submissions
      SET review_state='ready',review_resolved_at=?,updated_at=?
      WHERE id=? AND status='pending' AND withdrawn_at IS NULL
    `).bind(now, now, id),
    env.DB.prepare(`
      INSERT INTO submission_conversation (submission_id,author_role,author_user_id,kind,text,created_at)
      VALUES (?,'system',?,'resolved','Information reviewed. Request is ready for a decision.',?)
    `).bind(id, adminId, now),
    auditStatement(env, adminId, 'submission_info_resolved', id, { previous_review_state: row.review_state }, now),
  ]);
  return adminReviewPayload(env, id);
}

async function editableOwnerRow(env: Env, id: number, userId: number): Promise<ManageRow | Response> {
  const row = await manageRow(env, id);
  if (!row || row.user_id !== userId) return miniAppJsonError('not_found', 'Request not found.', 404);
  if (row.status !== 'pending' || row.withdrawn_at) {
    return miniAppJsonError('request_locked', 'Only a pending request can be changed.', 409);
  }
  return row;
}

async function manageRow(env: Env, id: number): Promise<ManageRow | null> {
  return env.DB.prepare(`
    SELECT id,user_id,language,title,original_language,chapter_count,publication_status,source_url,
           raw_file_id,raw_file_name,raw_file_mime,genres_tags,sexual_content,sensitive_content,notes,
           status,slot_returned,queue_status,queue_position,
           COALESCE(review_state,'ready') AS review_state,review_requested_at,review_requested_by,
           review_resolved_at,withdrawn_at,created_at,updated_at
    FROM submissions WHERE id=?
  `).bind(id).first<ManageRow>();
}

function editableValues(body: Record<string, unknown>, before: ManageRow): EditableValues | Response {
  const title = cleanRequired(body.title ?? before.title, MAX_TITLE);
  if (!title) return miniAppJsonError('invalid_title', `Novel title must be 1-${MAX_TITLE} characters.`, 400);
  const originalLanguage = cleanRequired(body.original_language ?? before.original_language, MAX_SHORT);
  if (!originalLanguage) return miniAppJsonError('invalid_language', 'Enter the original language.', 400);
  const chapterCount = Number(body.chapter_count ?? before.chapter_count);
  if (!Number.isInteger(chapterCount) || chapterCount <= 0 || chapterCount > MAX_REASONABLE_CHAPTERS) {
    return miniAppJsonError('invalid_chapters', 'Enter a valid chapter count.', 400);
  }
  const publicationStatus = String(body.publication_status ?? before.publication_status);
  if (publicationStatus !== 'ongoing' && publicationStatus !== 'completed') {
    return miniAppJsonError('invalid_status', 'Choose whether the novel is ongoing or completed.', 400);
  }
  const sourceUrl = cleanOptional(body.source_url ?? before.source_url, MAX_SOURCE);
  if (sourceUrl && !isHttpUrl(sourceUrl)) return miniAppJsonError('invalid_source', 'Enter a valid http(s) source URL.', 400);
  const genres = cleanRequired(body.genres_tags ?? before.genres_tags, MAX_LONG);
  if (!genres) return miniAppJsonError('invalid_tags', 'Add the main genres and tags.', 400);
  const sexual = cleanRequired(body.sexual_content ?? before.sexual_content, MAX_LONG);
  if (!sexual) return miniAppJsonError('invalid_content', 'Complete the sexual content disclosure.', 400);
  const sensitive = cleanRequired(body.sensitive_content ?? before.sensitive_content, MAX_LONG);
  if (!sensitive) return miniAppJsonError('invalid_sensitive', 'Complete the sensitive content disclosure.', 400);
  const notes = cleanOptional(body.notes ?? before.notes, MAX_LONG);
  return {
    title,
    original_language: originalLanguage,
    chapter_count: chapterCount,
    publication_status: publicationStatus,
    source_url: sourceUrl,
    genres_tags: genres,
    sexual_content: sexual,
    sensitive_content: sensitive,
    notes,
  };
}

async function validateSourceIdentityChange(env: Env, before: ManageRow, nextUrl: string | null): Promise<true | Response> {
  if ((before.source_url || null) === nextUrl) return true;
  const nextId = extractNovelpiaId(nextUrl);
  const [identity, providerSource] = await Promise.all([
    env.DB.prepare(`
      SELECT identity_value,source_provider FROM title_identities
      WHERE submission_id=? AND identity_type='novelpia'
      ORDER BY CASE WHEN source_provider='source_url' THEN 1 ELSE 0 END,identity_value
      LIMIT 1
    `).bind(before.id).first<SourceIdentityRow>(),
    env.DB.prepare(`
      SELECT external_id FROM submission_external_sources
      WHERE submission_id=? AND provider IN ('novelpia','raw_fucknovelpia') AND external_id IS NOT NULL
      ORDER BY CASE WHEN provider='novelpia' THEN 0 ELSE 1 END LIMIT 1
    `).bind(before.id).first<{ external_id: string }>(),
  ]);
  const lockedId = providerSource?.external_id || (identity && identity.source_provider !== 'source_url' ? identity.identity_value : null);
  if (lockedId && nextId && nextId !== lockedId) {
    return miniAppJsonError(
      'source_identity_locked',
      `This request is verified as NovelPia #${lockedId}. Ask the team to correct the source identity instead of changing it to #${nextId}.`,
      409,
    );
  }
  if (!nextId || nextId === identity?.identity_value) return true;

  const compatibilityDuplicate = await env.DB.prepare(`
    SELECT s.id,s.title
    FROM submission_external_sources es
    JOIN submissions s ON s.id=es.submission_id
    WHERE es.provider IN ('novelpia','raw_fucknovelpia') AND es.external_id=?
      AND s.id<>? AND s.status<>'rejected'
    LIMIT 1
  `).bind(nextId, before.id).first<{ id: number; title: string }>();
  if (compatibilityDuplicate) return sourceDuplicateResponse(nextId, compatibilityDuplicate);

  const owner = await env.DB.prepare(`
    SELECT submission_id,claim_user_id,claim_expires_at FROM title_identities
    WHERE identity_type='novelpia' AND identity_value=?
  `).bind(nextId).first<IdentityOwnerRow>();
  if (owner?.submission_id && owner.submission_id !== before.id) {
    const active = await env.DB.prepare('SELECT id,title,status FROM submissions WHERE id=?').bind(owner.submission_id)
      .first<{ id: number; title: string; status: string }>();
    if (active && active.status !== 'rejected') return sourceDuplicateResponse(nextId, active);
  }
  if (!owner?.submission_id && owner?.claim_user_id && (!owner.claim_expires_at || owner.claim_expires_at > new Date().toISOString())) {
    return miniAppJsonError('source_identity_busy', 'Another request for this exact NovelPia title is being submitted right now. Try again shortly.', 409);
  }
  return true;
}

async function syncSourceIdentityAfterEdit(env: Env, before: ManageRow, nextUrl: string | null, now: string): Promise<true | Response> {
  if ((before.source_url || null) === nextUrl) return true;
  const nextId = extractNovelpiaId(nextUrl);
  const sourceIdentity = await env.DB.prepare(`
    SELECT identity_value,source_provider FROM title_identities
    WHERE submission_id=? AND identity_type='novelpia' AND source_provider='source_url'
    LIMIT 1
  `).bind(before.id).first<SourceIdentityRow>();

  if (!nextId) {
    if (sourceIdentity) {
      await env.DB.prepare(`
        UPDATE title_identities SET submission_id=NULL,updated_at=?
        WHERE identity_type='novelpia' AND identity_value=? AND submission_id=? AND source_provider='source_url'
      `).bind(now, sourceIdentity.identity_value, before.id).run();
    }
    return true;
  }
  if (sourceIdentity?.identity_value === nextId) return true;

  const existing = await env.DB.prepare(`
    SELECT submission_id,claim_user_id,claim_expires_at FROM title_identities
    WHERE identity_type='novelpia' AND identity_value=?
  `).bind(nextId).first<IdentityOwnerRow>();
  if (existing?.submission_id && existing.submission_id !== before.id) {
    const active = await env.DB.prepare('SELECT id,title,status FROM submissions WHERE id=?').bind(existing.submission_id)
      .first<{ id: number; title: string; status: string }>();
    if (active && active.status !== 'rejected') return sourceDuplicateResponse(nextId, active);
    await env.DB.prepare(`UPDATE title_identities SET submission_id=NULL,claim_user_id=NULL,claim_request_id=NULL,claim_expires_at=NULL,updated_at=? WHERE identity_type='novelpia' AND identity_value=?`)
      .bind(now, nextId).run();
  }

  await env.DB.prepare(`
    INSERT OR IGNORE INTO title_identities (
      identity_type,identity_value,submission_id,claim_user_id,claim_request_id,claim_expires_at,
      source_provider,created_at,updated_at
    ) VALUES ('novelpia',?,?,NULL,NULL,NULL,'source_url',?,?)
  `).bind(nextId, before.id, now, now).run();
  await env.DB.prepare(`
    UPDATE title_identities
    SET submission_id=?,claim_user_id=NULL,claim_request_id=NULL,claim_expires_at=NULL,source_provider='source_url',updated_at=?
    WHERE identity_type='novelpia' AND identity_value=?
      AND (submission_id IS NULL OR submission_id=?)
      AND (claim_user_id IS NULL OR claim_expires_at IS NULL OR claim_expires_at<=?)
  `).bind(before.id, now, nextId, before.id, now).run();

  const owner = await env.DB.prepare(`SELECT submission_id FROM title_identities WHERE identity_type='novelpia' AND identity_value=?`)
    .bind(nextId).first<{ submission_id: number | null }>();
  if (Number(owner?.submission_id) !== before.id) {
    return miniAppJsonError('source_identity_conflict', 'The new NovelPia source was claimed by another request. Reopen this request and try again.', 409);
  }
  if (sourceIdentity && sourceIdentity.identity_value !== nextId) {
    await env.DB.prepare(`
      UPDATE title_identities SET submission_id=NULL,updated_at=?
      WHERE identity_type='novelpia' AND identity_value=? AND submission_id=? AND source_provider='source_url'
    `).bind(now, sourceIdentity.identity_value, before.id).run();
  }
  return true;
}

function sourceDuplicateResponse(novelpiaId: string, row: { id: number; title: string }): Response {
  return miniAppJsonError(
    'duplicate_title',
    `NovelPia #${novelpiaId} already belongs to Dollar TL request #${row.id}: ${row.title}.`,
    409,
    { canonical_submission_id: row.id, identity: `novelpia:${novelpiaId}`, quota_used: false },
  );
}

async function addConversation(
  env: Env,
  submissionId: number,
  role: 'admin' | 'user' | 'system',
  actorId: number | null,
  kind: string,
  text: string,
  now = new Date().toISOString(),
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO submission_conversation (submission_id,author_role,author_user_id,kind,text,created_at)
    VALUES (?,?,?,?,?,?)
  `).bind(submissionId, role, actorId, kind, text.slice(0, MAX_THREAD_MESSAGE), now).run();
}

function auditStatement(
  env: Env,
  adminId: number,
  action: string,
  submissionId: number,
  details: Record<string, unknown>,
  now: string,
) {
  return env.DB.prepare(`
    INSERT INTO admin_audit_log (admin_user_id,action,target_type,target_id,details,created_at)
    VALUES (?,?,'submission',?,?,?)
  `).bind(adminId, action, String(submissionId), JSON.stringify(details), now);
}

async function notifyAdminUserReplied(
  telegram: TelegramClient,
  env: Env,
  submissionId: number,
  title: string,
  text: string,
): Promise<void> {
  await telegram.sendMessage(
    env.ADMIN_TELEGRAM_ID,
    `<b>Request #${submissionId} updated by requester</b>\n\n<b>${escapeHtml(title)}</b>\n${escapeHtml(text.slice(0, 1200))}`,
  ).then(() => undefined).catch(() => undefined);
}

function extractNovelpiaId(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (host !== 'novelpia.com' && host !== 'raw-fucknovelpia.com') return null;
    const match = /^\/novel\/(\d{2,9})(?:\/|$)/.exec(url.pathname);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

function positiveId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
function cleanRequired(value: unknown, max: number): string {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text.length > max ? '' : text;
}
function cleanOptional(value: unknown, max: number): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.length <= max ? text : null;
}
function cleanMessage(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text && text.length <= MAX_THREAD_MESSAGE ? text : null;
}
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
function fileExtension(name: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(name || '');
  return match?.[1]?.toLowerCase() || '';
}
async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; } catch { return {} as T; }
}
