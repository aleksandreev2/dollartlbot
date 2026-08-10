import { retryAdminEventDelivery } from './admin-events';
import { isAdminEventsSchemaMissing } from './db';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import type { TelegramClient } from './telegram';

const MAX_PAGE = 50;

type EventFilter = 'all' | 'unread' | 'problems';

export async function handleAdminEventsRequest(
  request: Request,
  env: Env,
  telegram: TelegramClient,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/admin/events')) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  try {
    if (request.method === 'GET' && url.pathname === '/api/app/admin/events') {
      return listEvents(url, env);
    }

    if (request.method === 'POST' && url.pathname === '/api/app/admin/events/read') {
      const body = await readJson<{ id?: number; all?: boolean }>(request);
      const now = new Date().toISOString();
      if (body.all === true) {
        await env.DB.prepare('UPDATE admin_events SET read_at=COALESCE(read_at,?) WHERE read_at IS NULL')
          .bind(now).run();
        return miniAppJson({ ok: true, read_all: true, summary: await eventSummary(env) });
      }
      const id = Number(body.id);
      if (!Number.isSafeInteger(id) || id <= 0) {
        return miniAppJsonError('invalid_event', 'Invalid admin event.', 400);
      }
      await env.DB.prepare('UPDATE admin_events SET read_at=COALESCE(read_at,?) WHERE id=?')
        .bind(now, id).run();
      return miniAppJson({ ok: true, id, summary: await eventSummary(env) });
    }

    const retryMatch = /^\/api\/app\/admin\/events\/(\d+)\/retry$/.exec(url.pathname);
    if (request.method === 'POST' && retryMatch) {
      const id = Number(retryMatch[1]);
      const exists = await env.DB.prepare('SELECT telegram_status FROM admin_events WHERE id=?')
        .bind(id).first<{ telegram_status: string }>();
      if (!exists) return miniAppJsonError('not_found', 'Admin event not found.', 404);
      if (exists.telegram_status !== 'failed') {
        return miniAppJsonError('invalid_state', 'Only a failed Telegram alert can be retried.', 409);
      }
      const retried = await retryAdminEventDelivery(env, telegram, id);
      return miniAppJson({ ok: retried, id, event: await eventById(env, id), summary: await eventSummary(env) });
    }

    return miniAppJsonError('not_found', 'Admin event route not found.', 404);
  } catch (error) {
    if (isAdminEventsSchemaMissing(error)) {
      return miniAppJsonError(
        'admin_events_schema_pending',
        'Admin Activity is waiting for D1 migration 0019. Public bot access remains available.',
        503,
      );
    }
    throw error;
  }
}

async function listEvents(url: URL, env: Env): Promise<Response> {
  if (url.searchParams.get('summary') === '1') {
    return miniAppJson({ summary: await eventSummary(env) });
  }

  const requestedFilter = String(url.searchParams.get('filter') || 'all');
  const filter: EventFilter = requestedFilter === 'unread' || requestedFilter === 'problems'
    ? requestedFilter
    : 'all';
  const type = String(url.searchParams.get('type') || '').trim().slice(0, 60);
  const before = Math.max(0, Number(url.searchParams.get('before') || 0) || 0);
  const limit = Math.max(1, Math.min(MAX_PAGE, Number(url.searchParams.get('limit') || 30) || 30));

  const where: string[] = ['1=1'];
  const binds: Array<string | number> = [];
  if (filter === 'unread') where.push('e.read_at IS NULL');
  if (filter === 'problems') where.push("e.severity IN ('warning','error')");
  if (type) {
    where.push('e.type=?');
    binds.push(type);
  }
  if (before > 0) {
    where.push('e.id < ?');
    binds.push(before);
  }

  const rows = await env.DB.prepare(`
    SELECT
      e.id,e.type,e.severity,e.user_id,e.submission_id,e.publication_id,
      e.title,e.body,e.action_url,e.details,e.read_at,
      e.telegram_status,e.telegram_attempts,e.telegram_sent_at,e.telegram_last_error,
      e.created_at,
      u.username AS current_username,u.first_name AS current_first_name,u.language AS current_language
    FROM admin_events e
    LEFT JOIN users u ON u.telegram_id=e.user_id
    WHERE ${where.join(' AND ')}
    ORDER BY e.id DESC
    LIMIT ?
  `).bind(...binds, limit).all<Record<string, unknown>>();

  const events = rows.results;
  const nextBefore = events.length === limit ? Number(events[events.length - 1]?.id || 0) : null;
  return miniAppJson({
    events,
    filter,
    next_before: nextBefore && nextBefore > 0 ? nextBefore : null,
    summary: await eventSummary(env),
  });
}

async function eventSummary(env: Env) {
  const row = await env.DB.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN read_at IS NULL THEN 1 ELSE 0 END) AS unread,
      SUM(CASE WHEN read_at IS NULL AND severity IN ('warning','error') THEN 1 ELSE 0 END) AS unread_problems,
      SUM(CASE WHEN telegram_status='failed' THEN 1 ELSE 0 END) AS failed_alerts
    FROM admin_events
  `).first<{ total: number | null; unread: number | null; unread_problems: number | null; failed_alerts: number | null }>();
  return {
    total: Number(row?.total ?? 0),
    unread: Number(row?.unread ?? 0),
    unread_problems: Number(row?.unread_problems ?? 0),
    failed_alerts: Number(row?.failed_alerts ?? 0),
  };
}

async function eventById(env: Env, id: number) {
  return env.DB.prepare(`
    SELECT id,type,severity,user_id,submission_id,publication_id,title,body,action_url,
           read_at,telegram_status,telegram_attempts,telegram_sent_at,telegram_last_error,created_at
    FROM admin_events WHERE id=?
  `).bind(id).first<Record<string, unknown>>();
}

async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; } catch { return {} as T; }
}
