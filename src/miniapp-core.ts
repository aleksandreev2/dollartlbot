import {
  FREE_MONTHLY_REQUEST_LIMIT,
  REGULAR_MAX_CHAPTERS,
  SUBSCRIBER_MONTHLY_REQUEST_LIMIT,
} from './domain';
import { getSubmission, monthlySubmissionCount } from './db';
import { SUPPORTED_LANGUAGES } from './i18n/index';
import {
  authenticateMiniAppRequest,
  miniAppApiHeaders,
  miniAppJson,
  miniAppJsonError,
  type MiniAppAuthContext,
} from './miniapp-auth';
import { getSubscriptionState } from './subscription';
import { TelegramClient } from './telegram';

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

/**
 * Canonical owner of the small set of foundational Mini App routes.
 *
 * Submission intake and admin state transitions intentionally live in their
 * dedicated reliability modules. This router only owns bootstrap/read routes,
 * language updates and the legacy-compatible admin list endpoint.
 */
export async function handleMiniAppCoreRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/')) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: miniAppApiHeaders() });
  }

  if (!ownsRoute(request.method, url.pathname)) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);

  try {
    if (request.method === 'GET' && url.pathname === '/api/app/bootstrap') {
      return miniAppJson(await buildBootstrap(auth, env, telegram));
    }

    if (request.method === 'GET' && url.pathname === '/api/app/queue') {
      return miniAppJson(await getQueuePayload(env));
    }

    if (request.method === 'GET' && url.pathname === '/api/app/requests') {
      return miniAppJson({ requests: await getMyRequests(env, auth.telegramUser.id, 100) });
    }

    const novelMatch = /^\/api\/app\/novel\/(\d+)$/.exec(url.pathname);
    if (request.method === 'GET' && novelMatch) {
      const id = Number(novelMatch[1]);
      const submission = await getSubmission(env, id);
      if (!submission) return miniAppJsonError('not_found', 'Novel request not found.', 404);
      const canRead = submission.status === 'accepted'
        || submission.user_id === auth.telegramUser.id
        || auth.admin;
      if (!canRead) return miniAppJsonError('forbidden', 'You cannot view this request.', 403);
      const requester = await env.DB.prepare(`
        SELECT COALESCE(NULLIF(u.username,''), NULLIF(s.username_snapshot,'')) AS requester_username
        FROM submissions s
        LEFT JOIN users u ON u.telegram_id = s.user_id
        WHERE s.id = ?
      `).bind(id).first<{ requester_username: string | null }>();
      return miniAppJson({
        novel: {
          ...submission,
          requester_username: cleanPublicUsername(requester?.requester_username ?? null) || null,
        },
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/app/language') {
      return updateLanguage(request, auth, env);
    }

    if (request.method === 'GET' && url.pathname === '/api/app/admin/list') {
      if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);
      return miniAppJson(await getAdminList(env, url));
    }

    return null;
  } catch (error) {
    console.error(JSON.stringify({
      event: 'miniapp_core_failed',
      path: url.pathname,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }));
    return miniAppJsonError('temporary_error', 'Something went wrong. Please try again.', 500);
  }
}

function ownsRoute(method: string, pathname: string): boolean {
  if (method === 'GET' && [
    '/api/app/bootstrap',
    '/api/app/queue',
    '/api/app/requests',
    '/api/app/admin/list',
  ].includes(pathname)) return true;
  if (method === 'GET' && /^\/api\/app\/novel\/\d+$/.test(pathname)) return true;
  return method === 'POST' && pathname === '/api/app/language';
}

async function buildBootstrap(auth: MiniAppAuthContext, env: Env, telegram: TelegramClient) {
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
  const progress = current > 0 && total > 0
    ? Math.max(0, Math.min(100, Math.round((current / total) * 100)))
    : null;
  return { ...row, progress_percent: progress };
}

function requestState(row: { status: string; slot_returned: number; queue_status: string | null }): string {
  if (row.status === 'pending') return 'pending';
  if (row.status === 'rejected') return row.slot_returned ? 'rejected_returned' : 'rejected';
  if (row.queue_status === 'completed') return 'completed';
  if (row.queue_status === 'in_progress') return 'in_progress';
  return 'queued';
}

async function updateLanguage(
  request: Request,
  auth: MiniAppAuthContext,
  env: Env,
): Promise<Response> {
  const body = await readJson<{ locale?: string }>(request);
  const allowed = new Set(SUPPORTED_LANGUAGES.map((item) => item.code));
  if (!body.locale || !allowed.has(body.locale as never)) {
    return miniAppJsonError('invalid_locale', 'Unsupported interface language.', 400);
  }
  await env.DB.prepare(
    'UPDATE users SET language = ?, language_selected = 1, updated_at = ? WHERE telegram_id = ?',
  ).bind(body.locale, new Date().toISOString(), auth.telegramUser.id).run();
  return miniAppJson({ ok: true, locale: body.locale });
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

async function getAdminList(env: Env, url: URL) {
  const kind = (url.searchParams.get('kind') ?? 'pending').trim();
  if (!['pending', 'active', 'completed', 'rejected', 'all', 'queue'].includes(kind)) {
    throw new Error('invalid_admin_list_filter');
  }

  const counts = await getAdminCounts(env);
  if (kind === 'queue') {
    const limit = 500;
    const [rows, count] = await Promise.all([
      env.DB.prepare(`
        SELECT s.id, s.user_id, s.title, s.original_language, s.chapter_count,
               s.publication_status, s.source_url, s.genres_tags, s.sexual_content,
               s.sensitive_content, s.notes, s.plan, s.status, s.slot_returned,
               s.queue_status, s.queue_position, s.current_chapter, s.progress_updated_at,
               s.created_at, s.updated_at, u.username, u.first_name
        FROM submissions s
        LEFT JOIN users u ON u.telegram_id = s.user_id
        WHERE s.status = 'accepted' AND s.queue_status IN ('queued', 'in_progress')
        ORDER BY CASE WHEN s.queue_status = 'in_progress' THEN 0 ELSE 1 END,
                 COALESCE(s.queue_position, 2147483647), s.id
        LIMIT ?
      `).bind(limit).all<Record<string, unknown>>(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM submissions WHERE status='accepted' AND queue_status IN ('queued','in_progress')")
        .first<{ n: number }>(),
    ]);
    const total = Number(count?.n ?? 0);
    return {
      counts,
      requests: rows.results,
      page: { total, limit, next_cursor: null, has_more: total > rows.results.length, truncated: total > rows.results.length },
    };
  }

  const limit = boundedInt(url.searchParams.get('limit'), 30, 1, 50);
  const cursor = positiveInt(url.searchParams.get('cursor'));
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 120).toLowerCase();
  const where = kind === 'pending'
    ? "s.status='pending'"
    : kind === 'active'
      ? "s.status='accepted' AND s.queue_status IN ('queued','in_progress')"
      : kind === 'completed'
        ? "s.status='accepted' AND s.queue_status='completed'"
        : kind === 'rejected'
          ? "s.status='rejected'"
          : '1=1';
  const search = q ? ` AND (
    CAST(s.id AS TEXT) LIKE ? ESCAPE '!'
    OR CAST(s.user_id AS TEXT) LIKE ? ESCAPE '!'
    OR LOWER(s.title) LIKE ? ESCAPE '!'
    OR LOWER(COALESCE(u.username,'')) LIKE ? ESCAPE '!'
    OR LOWER(COALESCE(u.first_name,'')) LIKE ? ESCAPE '!'
    OR LOWER(s.original_language) LIKE ? ESCAPE '!'
  )` : '';
  const cursorClause = cursor ? ' AND s.id < ?' : '';
  const needle = q ? `%${escapeLike(q)}%` : '';
  const commonBinds = q ? [needle, needle, needle, needle, needle, needle] : [];
  const rowBinds = cursor ? [...commonBinds, cursor, limit + 1] : [...commonBinds, limit + 1];

  const [rows, count] = await Promise.all([
    env.DB.prepare(`
      SELECT s.id, s.user_id, s.title, s.original_language, s.chapter_count,
             s.publication_status, s.source_url, s.genres_tags, s.sexual_content,
             s.sensitive_content, s.notes, s.plan, s.status, s.slot_returned,
             s.queue_status, s.queue_position, s.current_chapter, s.progress_updated_at,
             s.created_at, s.updated_at, u.username, u.first_name
      FROM submissions s
      LEFT JOIN users u ON u.telegram_id = s.user_id
      WHERE ${where}${search}${cursorClause}
      ORDER BY s.id DESC
      LIMIT ?
    `).bind(...rowBinds).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS n
      FROM submissions s
      LEFT JOIN users u ON u.telegram_id = s.user_id
      WHERE ${where}${search}
    `).bind(...commonBinds).first<{ n: number }>(),
  ]);

  const hasMore = rows.results.length > limit;
  const visible = hasMore ? rows.results.slice(0, limit) : rows.results;
  const nextCursor = hasMore && visible.length ? Number(visible[visible.length - 1]?.id ?? 0) : null;
  return {
    counts,
    requests: visible,
    page: { total: Number(count?.n ?? 0), limit, next_cursor: nextCursor || null, has_more: hasMore, query: q, kind },
  };
}

function boundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  return raw && Number.isInteger(value) ? Math.max(min, Math.min(max, value)) : fallback;
}
function positiveInt(raw: string | null): number | null {
  const value = Number(raw);
  return raw && Number.isSafeInteger(value) && value > 0 ? value : null;
}
function escapeLike(value: string): string {
  return value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}
function cleanPublicUsername(value: string | null): string {
  const raw = String(value || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(raw) ? raw : '';
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}
