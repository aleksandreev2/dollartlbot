import { FREE_MONTHLY_REQUEST_LIMIT, SUBSCRIBER_MONTHLY_REQUEST_LIMIT } from './domain';
import { currentMonthKey, errorText } from './db';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { getQuotaState } from './quota';
import { getSubscriptionState } from './subscription';
import { escapeHtml, isActiveChatMember, type TelegramClient } from './telegram';
import { getUserAdminControl, normalizeAdminTags, parseAdminTags } from './user-controls';

const PAGE_SIZE = 40;
const MAX_MESSAGE = 3500;
const MAX_NOTES = 2000;

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
    return changeQuota(Number(quotaMatch[1]), request, auth.telegramUser.id, env, telegram);
  }

  const controlMatch = /^\/api\/app\/admin\/users\/(\d+)\/control$/.exec(url.pathname);
  if (request.method === 'POST' && controlMatch) {
    return changeControl(Number(controlMatch[1]), request, auth.telegramUser.id, env, telegram);
  }

  const messageMatch = /^\/api\/app\/admin\/users\/(\d+)\/message$/.exec(url.pathname);
  if (request.method === 'POST' && messageMatch) {
    return messageUser(Number(messageMatch[1]), request, auth.telegramUser.id, env, telegram);
  }

  const refreshMatch = /^\/api\/app\/admin\/users\/(\d+)\/refresh-telegram$/.exec(url.pathname);
  if (request.method === 'POST' && refreshMatch) {
    return refreshTelegramProfile(Number(refreshMatch[1]), auth.telegramUser.id, env, telegram);
  }

  const recheckMatch = /^\/api\/app\/admin\/users\/(\d+)\/recheck$/.exec(url.pathname);
  if (request.method === 'POST' && recheckMatch) {
    return recheckUser(Number(recheckMatch[1]), auth.telegramUser.id, env, telegram);
  }

  return miniAppJsonError('not_found', 'Admin users route not found.', 404);
}

async function listUsers(url: URL, env: Env): Promise<Response> {
  const query = String(url.searchParams.get('q') || '').trim().slice(0, 80);
  const filter = String(url.searchParams.get('filter') || 'all');
  const sort = String(url.searchParams.get('sort') || 'recent');
  const offset = Math.max(0, Math.min(100_000, Number(url.searchParams.get('offset') || 0) || 0));
  const month = currentMonthKey();

  const where: string[] = ['1=1'];
  const binds: Array<string | number> = [];
  if (query) {
    where.push(`(CAST(u.telegram_id AS TEXT) LIKE ? OR LOWER(COALESCE(u.username,'')) LIKE ? OR LOWER(COALESCE(u.first_name,'')) LIKE ? OR LOWER(COALESCE(c.notes,'')) LIKE ? OR LOWER(COALESCE(c.tags_json,'')) LIKE ?)`);
    const needle = `%${query.toLowerCase()}%`;
    binds.push(`%${query}%`, needle, needle, needle, needle);
  }

  if (filter === 'unlimited') where.push('u.quota_unlimited=1');
  if (filter === 'blocked') where.push('c.blocked_at IS NOT NULL');
  if (filter === 'new') where.push(`u.activated_at >= datetime('now','-7 days')`);
  if (filter === 'active') where.push(`COALESCE(u.last_seen_at,u.updated_at,u.created_at) >= datetime('now','-7 days')`);
  if (filter === 'inactive') where.push(`COALESCE(u.last_seen_at,u.updated_at,u.created_at) < datetime('now','-30 days')`);
  if (filter === 'has_requests') where.push('EXISTS (SELECT 1 FROM submissions sx WHERE sx.user_id=u.telegram_id)');
  if (filter === 'no_requests') where.push('NOT EXISTS (SELECT 1 FROM submissions sx WHERE sx.user_id=u.telegram_id)');
  if (filter === 'boosty') where.push(`COALESCE((SELECT s.plan FROM submissions s WHERE s.user_id=u.telegram_id ORDER BY s.id DESC LIMIT 1),'free')='subscriber'`);
  if (filter === 'regular') where.push(`COALESCE((SELECT s.plan FROM submissions s WHERE s.user_id=u.telegram_id ORDER BY s.id DESC LIMIT 1),'free')<>'subscriber'`);

  const orderBy = {
    recent: 'last_activity DESC,u.telegram_id DESC',
    newest: 'COALESCE(u.activated_at,u.created_at) DESC,u.telegram_id DESC',
    requests: 'submissions_total DESC,last_activity DESC',
    referrals: 'referrals_qualified DESC,last_activity DESC',
    id: 'u.telegram_id DESC',
  }[sort] || 'last_activity DESC,u.telegram_id DESC';

  const rows = await env.DB.prepare(`
    SELECT
      u.telegram_id,u.username,u.first_name,u.language,u.created_at,u.updated_at,
      u.activated_at,u.activated_via,u.last_seen_at,u.quota_unlimited,
      c.blocked_at,c.blocked_reason,c.tags_json,
      COALESCE((SELECT s.plan FROM submissions s WHERE s.user_id=u.telegram_id ORDER BY s.id DESC LIMIT 1),'free') AS last_plan,
      (SELECT COUNT(*) FROM submissions s WHERE s.user_id=u.telegram_id) AS submissions_total,
      (SELECT COUNT(*) FROM submissions s WHERE s.user_id=u.telegram_id AND s.month_key=? AND s.slot_returned=0) AS used_this_month,
      COALESCE((SELECT SUM(q.delta) FROM quota_events q WHERE q.user_id=u.telegram_id AND q.month_key=?),0) AS admin_adjustment,
      (SELECT COUNT(*) FROM referrals r WHERE r.referrer_user_id=u.telegram_id AND r.status='qualified') AS referrals_qualified,
      COALESCE(u.last_seen_at,u.updated_at,u.created_at) AS last_activity
    FROM users u
    LEFT JOIN user_admin_controls c ON c.user_id=u.telegram_id
    WHERE ${where.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).bind(month, month, ...binds, PAGE_SIZE, offset).all<Record<string, unknown>>();

  const total = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM users u
    LEFT JOIN user_admin_controls c ON c.user_id=u.telegram_id
    WHERE ${where.join(' AND ')}
  `).bind(...binds).first<{count:number}>();
  const count = Number(total?.count || 0);

  return miniAppJson({
    users: rows.results.map((row) => ({ ...row, tags: parseAdminTags(String(row.tags_json || '[]')) })),
    total: count,
    offset,
    limit: PAGE_SIZE,
    has_more: offset + rows.results.length < count,
    next_offset: offset + rows.results.length,
    filter,
    sort,
  });
}

async function userProfile(userId: number, env: Env, telegram: TelegramClient): Promise<Response> {
  const invalid = validateUserId(userId);
  if (invalid) return invalid;
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

  const [control, stats, submissions, referrals, quotaEvents, audit, messages, accessCache] = await Promise.all([
    getUserAdminControl(env, userId),
    env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='accepted' THEN 1 ELSE 0 END) AS accepted,
      SUM(CASE WHEN status='accepted' AND queue_status='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected
      FROM submissions WHERE user_id=?`).bind(userId).first<Record<string, number>>(),
    env.DB.prepare(`SELECT id,title,original_language,chapter_count,status,queue_status,queue_position,plan,slot_returned,created_at,updated_at FROM submissions WHERE user_id=? ORDER BY id DESC LIMIT 50`).bind(userId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,referred_user_id,status,joined_at,left_at,qualified_at,reward_granted,reward_expires_at FROM referrals WHERE referrer_user_id=? ORDER BY id DESC LIMIT 30`).bind(userId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,month_key,delta,reason,admin_user_id,created_at FROM quota_events WHERE user_id=? ORDER BY id DESC LIMIT 30`).bind(userId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,admin_user_id,action,details,created_at FROM admin_audit_log WHERE target_type='user' AND target_id=? ORDER BY id DESC LIMIT 50`).bind(String(userId)).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT id,admin_user_id,text,status,telegram_message_id,error_text,created_at FROM user_admin_messages WHERE user_id=? ORDER BY id DESC LIMIT 30`).bind(userId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT channel_key,is_member,source,checked_at,expires_at,stale_until FROM access_membership_cache WHERE user_id=? ORDER BY checked_at DESC LIMIT 1`).bind(userId).first<Record<string, unknown>>(),
  ]);

  const timeline = buildTimeline(user, submissions.results, quotaEvents.results, audit.results, messages.results);

  return miniAppJson({
    user,
    control: {
      notes: control?.notes || '',
      tags: parseAdminTags(control?.tags_json),
      blocked: Boolean(control?.blocked_at),
      blocked_at: control?.blocked_at || null,
      blocked_by: control?.blocked_by || null,
      blocked_reason: control?.blocked_reason || '',
      updated_at: control?.updated_at || null,
    },
    access_cache: accessCache || null,
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
    messages: messages.results,
    timeline,
  });
}

async function changeQuota(
  userId: number,
  request: Request,
  adminUserId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<Response> {
  const invalid = validateUserId(userId);
  if (invalid) return invalid;
  const body = await readJson<{ delta?: number; unlimited?: boolean; reason?: string }>(request);
  const delta = body.delta === undefined ? 0 : Number(body.delta);
  const hasUnlimited = typeof body.unlimited === 'boolean';
  if ((!Number.isInteger(delta) || Math.abs(delta) > 100) || (delta === 0 && !hasUnlimited)) {
    return miniAppJsonError('invalid_quota_change', 'Укажите изменение квоты от -100 до +100 или измените безлимит.', 400);
  }
  if (!(await userExists(env, userId))) return miniAppJsonError('not_found', 'Пользователь не найден.', 404);

  const now = new Date().toISOString();
  const reason = String(body.reason || '').trim().slice(0, 300) || null;
  const ops: D1PreparedStatement[] = [];
  if (delta !== 0) {
    ops.push(env.DB.prepare(`INSERT INTO quota_events (user_id,month_key,delta,reason,admin_user_id,created_at) VALUES (?,?,?,?,?,?)`)
      .bind(userId, currentMonthKey(), delta, reason, adminUserId, now));
    ops.push(auditStatement(env, adminUserId, 'quota_adjust', userId, { delta, reason }, now));
  }
  if (hasUnlimited) {
    ops.push(env.DB.prepare('UPDATE users SET quota_unlimited=?,updated_at=? WHERE telegram_id=?')
      .bind(body.unlimited ? 1 : 0, now, userId));
    ops.push(auditStatement(env, adminUserId, body.unlimited ? 'quota_unlimited_on' : 'quota_unlimited_off', userId, null, now));
  }
  if (ops.length) await env.DB.batch(ops);
  return userProfile(userId, env, telegram);
}

async function changeControl(
  userId: number,
  request: Request,
  adminUserId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<Response> {
  const invalid = validateUserId(userId);
  if (invalid) return invalid;
  if (!(await userExists(env, userId))) return miniAppJsonError('not_found', 'Пользователь не найден.', 404);

  const body = await readJson<{ notes?: string; tags?: unknown; blocked?: boolean; blocked_reason?: string }>(request);
  const current = await getUserAdminControl(env, userId);
  const notes = body.notes === undefined ? (current?.notes || '') : String(body.notes || '').trim().slice(0, MAX_NOTES);
  const tags = body.tags === undefined ? parseAdminTags(current?.tags_json) : normalizeAdminTags(body.tags);
  const now = new Date().toISOString();
  let blockedAt = current?.blocked_at || null;
  let blockedBy = current?.blocked_by || null;
  let blockedReason = current?.blocked_reason || null;

  if (typeof body.blocked === 'boolean') {
    if (body.blocked) {
      const reason = String(body.blocked_reason || current?.blocked_reason || '').trim().slice(0, 300);
      if (!reason) return miniAppJsonError('block_reason_required', 'Укажите внутреннюю причину блокировки.', 400);
      blockedAt = blockedAt || now;
      blockedBy = adminUserId;
      blockedReason = reason;
    } else {
      blockedAt = null;
      blockedBy = null;
      blockedReason = null;
    }
  }

  await env.DB.prepare(`
    INSERT INTO user_admin_controls (user_id,notes,tags_json,blocked_at,blocked_by,blocked_reason,updated_at)
    VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      notes=excluded.notes,
      tags_json=excluded.tags_json,
      blocked_at=excluded.blocked_at,
      blocked_by=excluded.blocked_by,
      blocked_reason=excluded.blocked_reason,
      updated_at=excluded.updated_at
  `).bind(userId, notes, JSON.stringify(tags), blockedAt, blockedBy, blockedReason, now).run();

  const action = typeof body.blocked === 'boolean'
    ? (body.blocked ? 'user_block' : 'user_unblock')
    : 'user_control_update';
  await auditStatement(env, adminUserId, action, userId, {
    notes_changed: body.notes !== undefined,
    tags: body.tags === undefined ? undefined : tags,
    blocked_reason: body.blocked === true ? blockedReason : undefined,
  }, now).run();

  return userProfile(userId, env, telegram);
}

async function messageUser(
  userId: number,
  request: Request,
  adminUserId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<Response> {
  const invalid = validateUserId(userId);
  if (invalid) return invalid;
  if (!(await userExists(env, userId))) return miniAppJsonError('not_found', 'Пользователь не найден.', 404);
  const body = await readJson<{ text?: string }>(request);
  const text = String(body.text || '').trim();
  if (!text || text.length > MAX_MESSAGE) {
    return miniAppJsonError('invalid_message', `Сообщение должно содержать от 1 до ${MAX_MESSAGE} символов.`, 400);
  }

  const now = new Date().toISOString();
  try {
    const sent = await telegram.sendMessage(userId, escapeHtml(text));
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user_admin_messages (user_id,admin_user_id,text,status,telegram_message_id,error_text,created_at) VALUES (?,?,?,?,?,?,?)`)
        .bind(userId, adminUserId, text, 'sent', sent.message_id, null, now),
      auditStatement(env, adminUserId, 'user_message_sent', userId, { telegram_message_id: sent.message_id, length: text.length }, now),
    ]);
    return userProfile(userId, env, telegram);
  } catch (error) {
    const message = errorText(error).slice(0, 800);
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO user_admin_messages (user_id,admin_user_id,text,status,telegram_message_id,error_text,created_at) VALUES (?,?,?,?,?,?,?)`)
        .bind(userId, adminUserId, text, 'failed', null, message, now),
      auditStatement(env, adminUserId, 'user_message_failed', userId, { error: message, length: text.length }, now),
    ]).catch(() => undefined);
    return miniAppJsonError('telegram_delivery_failed', 'Telegram не доставил сообщение пользователю.', 502, { error: message });
  }
}

async function refreshTelegramProfile(
  userId: number,
  adminUserId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<Response> {
  const invalid = validateUserId(userId);
  if (invalid) return invalid;
  if (!(await userExists(env, userId))) return miniAppJsonError('not_found', 'Пользователь не найден.', 404);
  try {
    const chat = await telegram.call<{ id: number; type: string; username?: string; first_name?: string }>('getChat', { chat_id: userId });
    if (Number(chat.id) !== userId || chat.type !== 'private') {
      return miniAppJsonError('telegram_profile_unavailable', 'Telegram вернул неожиданный профиль.', 502);
    }
    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET username=?,first_name=?,updated_at=? WHERE telegram_id=?')
        .bind(chat.username || null, chat.first_name || null, now, userId),
      auditStatement(env, adminUserId, 'user_telegram_refresh', userId, { username: chat.username || null, first_name: chat.first_name || null }, now),
    ]);
    return userProfile(userId, env, telegram);
  } catch (error) {
    return miniAppJsonError('telegram_profile_unavailable', 'Не удалось обновить профиль через Telegram.', 502, { error: errorText(error).slice(0, 500) });
  }
}

async function recheckUser(
  userId: number,
  adminUserId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<Response> {
  const invalid = validateUserId(userId);
  if (invalid) return invalid;
  if (!(await userExists(env, userId))) return miniAppJsonError('not_found', 'Пользователь не найден.', 404);

  const setting = await env.DB.prepare("SELECT value FROM app_settings WHERE key='access_channel_id'").first<{value:string}>();
  const channelId = String(setting?.value || '').trim();
  const now = new Date().toISOString();
  let member: boolean | null = null;
  let membershipError: string | null = null;

  if (channelId) {
    try {
      const status = await telegram.getChatMember(normalizeChatId(channelId), userId);
      member = isActiveChatMember(status);
      const expires = new Date(Date.now() + (member ? 3 * 60_000 : 15_000)).toISOString();
      const stale = new Date(Date.now() + (member ? 30 * 60_000 : 15_000)).toISOString();
      await env.DB.prepare(`
        INSERT INTO access_membership_cache (user_id,channel_key,is_member,source,checked_at,expires_at,stale_until)
        VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(user_id,channel_key) DO UPDATE SET
          is_member=excluded.is_member,source=excluded.source,checked_at=excluded.checked_at,
          expires_at=excluded.expires_at,stale_until=excluded.stale_until
      `).bind(userId, channelId.toLowerCase(), member ? 1 : 0, 'admin_recheck', now, expires, stale).run();
    } catch (error) {
      membershipError = errorText(error).slice(0, 500);
    }
  } else {
    membershipError = 'Required access channel is not configured.';
  }

  const subscription = await getSubscriptionState(userId, env, telegram);
  await auditStatement(env, adminUserId, 'user_access_recheck', userId, {
    channel_member: member,
    membership_error: membershipError,
    subscriber: subscription.subscriber,
    subscription_verification_error: subscription.verificationError,
  }, now).run();

  return miniAppJson({
    ok: true,
    checked_at: now,
    channel: { member, error: membershipError },
    subscription: { subscriber: subscription.subscriber, verification_error: subscription.verificationError },
  });
}

function buildTimeline(
  user: Record<string, unknown>,
  submissions: Record<string, unknown>[],
  quota: Record<string, unknown>[],
  audit: Record<string, unknown>[],
  messages: Record<string, unknown>[],
) {
  const items: Array<Record<string, unknown>> = [];
  if (user.activated_at) items.push({ type: 'activated', title: 'Пользователь активирован', at: user.activated_at, detail: user.activated_via || '' });
  if (user.created_at) items.push({ type: 'created', title: 'Первое появление', at: user.created_at, detail: '' });
  for (const row of submissions) items.push({ type: 'request', title: `Заявка #${row.id}: ${row.title}`, at: row.created_at, detail: statusLabel(row) });
  for (const row of quota) items.push({ type: 'quota', title: `Квота ${Number(row.delta) > 0 ? '+' : ''}${row.delta}`, at: row.created_at, detail: row.reason || '' });
  for (const row of messages) items.push({ type: row.status === 'sent' ? 'message' : 'message_failed', title: row.status === 'sent' ? 'Сообщение отправлено' : 'Ошибка сообщения', at: row.created_at, detail: String(row.text || '').slice(0, 160) });
  for (const row of audit) items.push({ type: 'admin', title: String(row.action || 'admin action'), at: row.created_at, detail: summarizeDetails(row.details) });
  return items.filter((item) => item.at).sort((a, b) => Date.parse(String(b.at)) - Date.parse(String(a.at))).slice(0, 80);
}

function summarizeDetails(value: unknown): string {
  if (!value) return '';
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return JSON.stringify(parsed).slice(0, 220);
  } catch {
    return String(value).slice(0, 220);
  }
}

function statusLabel(row: Record<string, unknown>): string {
  if (row.status === 'pending') return 'На проверке';
  if (row.status === 'rejected') return Number(row.slot_returned) ? 'Отклонена · слот возвращён' : 'Отклонена';
  if (row.queue_status === 'completed') return 'Завершена';
  if (row.queue_status === 'in_progress') return 'В работе';
  return 'В очереди';
}

function auditStatement(
  env: Env,
  adminUserId: number,
  action: string,
  userId: number,
  details: unknown,
  createdAt: string,
): D1PreparedStatement {
  return env.DB.prepare(`INSERT INTO admin_audit_log (admin_user_id,action,target_type,target_id,details,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(adminUserId, action, 'user', String(userId), details == null ? null : JSON.stringify(details), createdAt);
}

function validateUserId(userId: number): Response | null {
  return Number.isSafeInteger(userId) && userId > 0
    ? null
    : miniAppJsonError('invalid_user', 'Некорректный Telegram ID.', 400);
}

async function userExists(env: Env, userId: number): Promise<boolean> {
  return Boolean(await env.DB.prepare('SELECT telegram_id FROM users WHERE telegram_id=?').bind(userId).first<{telegram_id:number}>());
}

function normalizeChatId(value: string): string | number {
  if (/^-?\d+$/.test(value)) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  return value;
}

async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; } catch { return {} as T; }
}
