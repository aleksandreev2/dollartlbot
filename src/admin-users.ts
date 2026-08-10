import { FREE_MONTHLY_REQUEST_LIMIT, SUBSCRIBER_MONTHLY_REQUEST_LIMIT } from './domain';
import { currentMonthKey } from './db';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { getQuotaState } from './quota';
import { getSubscriptionState } from './subscription';
import type { TelegramClient } from './telegram';

const PAGE_SIZE = 50;

export async function handleAdminUsersRequest(
  request: Request,
  env: Env,
  telegram: TelegramClient,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/admin/users')) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (request.method === 'GET' && url.pathname === '/api/app/admin/users') {
    return listUsers(url, env);
  }

  const detailMatch = /^\/api\/app\/admin\/users\/(\d+)$/.exec(url.pathname);
  if (request.method === 'GET' && detailMatch) {
    return userProfile(Number(detailMatch[1]), env, telegram);
  }

  const quotaMatch = /^\/api\/app\/admin\/users\/(\d+)\/quota$/.exec(url.pathname);
  if (request.method === 'POST' && quotaMatch) {
    const userId = Number(quotaMatch[1]);
    const body = await readJson<{ delta?: number; unlimited?: boolean; reason?: string }>(request);
    const delta = body.delta === undefined ? 0 : Number(body.delta);
    const hasUnlimited = typeof body.unlimited === 'boolean';
    if ((!Number.isInteger(delta) || Math.abs(delta) > 100) || (delta === 0 && !hasUnlimited)) {
      return miniAppJsonError('invalid_quota_change', 'Укажите изменение квоты от -100 до +100 или измените безлимит.', 400);
    }
    const exists = await env.DB.prepare('SELECT telegram_id FROM users WHERE telegram_id=?').bind(userId).first<{telegram_id:number}>();
    if (!exists) return miniAppJsonError('not_found', 'Пользователь не найден.', 404);

    const now = new Date().toISOString();
    const reason = String(body.reason || '').trim().slice(0, 300) || null;
    const ops: D1PreparedStatement[] = [];
    if (delta !== 0) {
      ops.push(env.DB.prepare(`INSERT INTO quota_events (user_id,month_key,delta,reason,admin_user_id,created_at) VALUES (?,?,?,?,?,?)`)
        .bind(userId, currentMonthKey(), delta, reason, auth.telegramUser.id, now));
      ops.push(env.DB.prepare(`INSERT INTO admin_audit_log (admin_user_id,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?)`)
        .bind(auth.telegramUser.id, 'quota_adjust', 'user', String(userId), JSON.stringify({ delta, reason }), now));
    }
    if (hasUnlimited) {
      ops.push(env.DB.prepare('UPDATE users SET quota_unlimited=?,updated_at=? WHERE telegram_id=?')
        .bind(body.unlimited ? 1 : 0, now, userId));
      ops.push(env.DB.prepare(`INSERT INTO admin_audit_log (admin_user_id,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?)`)
        .bind(auth.telegramUser.id, body.unlimited ? 'quota_unlimited_on' : 'quota_unlimited_off', 'user', String(userId), null, now));
    }
    if (ops.length) await env.DB.batch(ops);
    return userProfile(userId, env, telegram);
  }

  return miniAppJsonError('not_found', 'Admin users route not found.', 404);
}

async function listUsers(url: URL, env: Env): Promise<Response> {
  const query = String(url.searchParams.get('q') || '').trim().slice(0, 80);
  const filter = String(url.searchParams.get('filter') || 'all');
  const offset = Math.max(0, Math.min(10000, Number(url.searchParams.get('offset') || 0) || 0));
  const month = currentMonthKey();

  const where: string[] = ['1=1'];
  const binds: Array<string | number> = [];
  if (query) {
    where.push(`(CAST(u.telegram_id AS TEXT) LIKE ? OR LOWER(COALESCE(u.username,'')) LIKE ? OR LOWER(COALESCE(u.first_name,'')) LIKE ?)`);
    const needle = `%${query.toLowerCase()}%`;
    binds.push(`%${query}%`, needle, needle);
  }
  if (filter === 'unlimited') where.push('u.quota_unlimited=1');
  if (filter === 'boosty') where.push(`COALESCE((SELECT s.plan FROM submissions s WHERE s.user_id=u.telegram_id ORDER BY s.id DESC LIMIT 1),'free')='subscriber'`);
  if (filter === 'regular') where.push(`COALESCE((SELECT s.plan FROM submissions s WHERE s.user_id=u.telegram_id ORDER BY s.id DESC LIMIT 1),'free')<>'subscriber'`);

  const rows = await env.DB.prepare(`
    SELECT
      u.telegram_id,u.username,u.first_name,u.language,u.created_at,u.updated_at,
      u.activated_at,u.activated_via,u.last_seen_at,u.quota_unlimited,
      COALESCE((SELECT s.plan FROM submissions s WHERE s.user_id=u.telegram_id ORDER BY s.id DESC LIMIT 1),'free') AS last_plan,
      (SELECT COUNT(*) FROM submissions s WHERE s.user_id=u.telegram_id) AS submissions_total,
      (SELECT COUNT(*) FROM submissions s WHERE s.user_id=u.telegram_id AND s.month_key=? AND s.slot_returned=0) AS used_this_month,
      COALESCE((SELECT SUM(q.delta) FROM quota_events q WHERE q.user_id=u.telegram_id AND q.month_key=?),0) AS admin_adjustment,
      (SELECT COUNT(*) FROM referrals r WHERE r.referrer_user_id=u.telegram_id AND r.status='qualified') AS referrals_qualified,
      COALESCE(u.last_seen_at,u.updated_at,u.created_at) AS last_activity
    FROM users u
    WHERE ${where.join(' AND ')}
    ORDER BY last_activity DESC,u.telegram_id DESC
    LIMIT ? OFFSET ?
  `).bind(month, month, ...binds, PAGE_SIZE, offset).all<Record<string, unknown>>();

  const total = await env.DB.prepare(`SELECT COUNT(*) AS count FROM users u WHERE ${where.join(' AND ')}`)
    .bind(...binds).first<{count:number}>();

  return miniAppJson({ users: rows.results, total: Number(total?.count || 0), offset, limit: PAGE_SIZE });
}

async function userProfile(userId: number, env: Env, telegram: TelegramClient): Promise<Response> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return miniAppJsonError('invalid_user', 'Некорректный Telegram ID.', 400);
  const user = await env.DB.prepare(`
    SELECT telegram_id,username,first_name,language,language_selected,
           created_at,updated_at,activated_at,activated_via,last_seen_at,quota_unlimited,
           notify_request_updates,notify_releases,notify_announcements,notify_referrals
    FROM users WHERE telegram_id=?
  `).bind(userId).first<Record<string, unknown>>();
  if (!user) return miniAppJsonError('not_found', 'Пользователь не найден.', 404);

  const subscription = await getSubscriptionState(userId, env, telegram);
  const baseLimit = subscription.subscriber ? SUBSCRIBER_MONTHLY_REQUEST_LIMIT : FREE_MONTHLY_REQUEST_LIMIT;
  const quota = await getQuotaState(env, userId, baseLimit);

  const [stats, submissions, referrals, quotaEvents, audit] = await Promise.all([
    env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN status='accepted' AND queue_status='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected
      FROM submissions WHERE user_id=?`).bind(userId).first<Record<string, number>>(),
    env.DB.prepare(`SELECT id,title,original_language,chapter_count,status,queue_status,queue_position,plan,slot_returned,created_at,updated_at FROM submissions WHERE user_id=? ORDER BY id DESC LIMIT 30`).bind(userId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,referred_user_id,status,joined_at,left_at,qualified_at,reward_granted,reward_expires_at FROM referrals WHERE referrer_user_id=? ORDER BY id DESC LIMIT 30`).bind(userId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,month_key,delta,reason,admin_user_id,created_at FROM quota_events WHERE user_id=? ORDER BY id DESC LIMIT 30`).bind(userId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,admin_user_id,action,details,created_at FROM admin_audit_log WHERE target_type='user' AND target_id=? ORDER BY id DESC LIMIT 30`).bind(String(userId)).all<Record<string, unknown>>(),
  ]);

  return miniAppJson({
    user,
    subscription: { subscriber: subscription.subscriber, verification_error: subscription.verificationError },
    quota,
    stats: {
      total: Number(stats?.total || 0), pending: Number(stats?.pending || 0), accepted: Number(stats?.accepted || 0),
      completed: Number(stats?.completed || 0), rejected: Number(stats?.rejected || 0),
    },
    submissions: submissions.results,
    referrals: referrals.results,
    quota_events: quotaEvents.results,
    audit: audit.results,
  });
}

async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; } catch { return {} as T; }
}
