import { errorText, isAdmin } from './db';
import { getRuntimeSetting, runtimeFlag } from './runtime-settings';
import { getSubscriptionState } from './subscription';
import {
  isActiveChatMember,
  TelegramApiError,
  type TelegramChatMemberUpdated,
  type TelegramClient,
} from './telegram';

const DEFAULT_MAX_ATTEMPTS = 6;
const RETRY_DELAYS_SECONDS = [60, 300, 900, 3600, 7200, 21600];

type AutoBanRow = {
  user_id: number;
  channel_key: string;
  channel_id: string;
  status: string;
  attempts: number;
  left_at: string;
};

type AccessChannel = {
  id: string;
  key: string;
};

export async function handleChannelLeaveAutoBan(
  update: TelegramChatMemberUpdated,
  env: Env,
  telegram: TelegramClient,
  ctx?: ExecutionContext,
): Promise<void> {
  if (!(await runtimeFlag(env, 'channel_leave_autoban_enabled', true))) return;

  const channel = await getAccessChannel(env);
  if (!channel || !matchesChannel(update, channel.id)) return;

  const user = update.new_chat_member.user;
  if (user.is_bot || isAdmin(user.id, env)) return;
  if (['creator', 'administrator'].includes(update.old_chat_member.status)) return;
  if (!isActiveChatMember(update.old_chat_member) || update.new_chat_member.status !== 'left') return;

  // ChatMemberUpdated.from is the performer of the action. Requiring the same
  // user prevents admin removals and moderation actions from being treated as a
  // voluntary leave.
  if (update.from.id !== user.id) return;

  // Persist the self-leave before the webhook is acknowledged. The slower
  // entitlement and Telegram ban calls may run in waitUntil; if they are cut
  // short, the durable pending row is picked up by scheduled maintenance.
  const leftAt = new Date(update.date * 1000).toISOString();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO channel_leave_auto_bans (
      user_id,channel_key,channel_id,username,first_name,status,exemption_reason,
      leave_count,left_at,banned_at,unbanned_at,attempts,next_attempt_at,last_error,
      actor_user_id,old_status,new_status,updated_at
    ) VALUES (?,?,?,?,?,'pending',NULL,1,?,NULL,NULL,0,?,NULL,?,?,?,?)
    ON CONFLICT(user_id,channel_key) DO UPDATE SET
      channel_id=excluded.channel_id,
      username=excluded.username,
      first_name=excluded.first_name,
      status='pending',
      exemption_reason=NULL,
      leave_count=channel_leave_auto_bans.leave_count+1,
      left_at=excluded.left_at,
      banned_at=NULL,
      unbanned_at=NULL,
      attempts=0,
      next_attempt_at=excluded.next_attempt_at,
      last_error=NULL,
      actor_user_id=excluded.actor_user_id,
      old_status=excluded.old_status,
      new_status=excluded.new_status,
      updated_at=excluded.updated_at
  `).bind(
    user.id,
    channel.key,
    channel.id,
    user.username || null,
    user.first_name || null,
    leftAt,
    now,
    update.from.id,
    update.old_chat_member.status,
    update.new_chat_member.status,
    now,
  ).run();

  const attempt = attemptChannelLeaveAutoBan(user.id, channel.key, env, telegram).catch((error) => {
    console.error(JSON.stringify({
      event: 'channel_leave_autoban_attempt_crashed',
      user_id: user.id,
      channel: channel.id,
      error: errorText(error),
    }));
  });
  if (ctx) {
    ctx.waitUntil(attempt);
    return;
  }
  await attempt;
}

export async function runChannelLeaveAutoBanMaintenance(
  env: Env,
  telegram: TelegramClient,
  limit = 20,
): Promise<void> {
  if (!(await runtimeFlag(env, 'channel_leave_autoban_enabled', true))) return;
  const now = new Date().toISOString();
  const maxAttempts = await maxAttemptsSetting(env);
  const rows = await env.DB.prepare(`
    SELECT user_id,channel_key
    FROM channel_leave_auto_bans
    WHERE status IN ('pending','retry')
      AND attempts < ?
      AND COALESCE(next_attempt_at,left_at) <= ?
    ORDER BY COALESCE(next_attempt_at,left_at), user_id
    LIMIT ?
  `).bind(maxAttempts, now, Math.max(1, Math.min(100, limit))).all<{ user_id: number; channel_key: string }>();

  for (const row of rows.results) {
    await attemptChannelLeaveAutoBan(Number(row.user_id), String(row.channel_key), env, telegram);
  }
}

export async function retryChannelLeaveAutoBan(
  userId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<boolean> {
  const channel = await getAccessChannel(env);
  if (!channel) return false;
  const now = new Date().toISOString();
  const updated = await env.DB.prepare(`
    UPDATE channel_leave_auto_bans
    SET status='retry', attempts=0, next_attempt_at=?, last_error=NULL, updated_at=?
    WHERE user_id=? AND channel_key=? AND status IN ('failed','retry','pending')
  `).bind(now, now, userId, channel.key).run();
  if ((updated.meta.changes ?? 0) === 0) return false;
  await attemptChannelLeaveAutoBan(userId, channel.key, env, telegram);
  return true;
}

export async function unbanChannelLeaveUser(
  userId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT user_id,channel_key,channel_id,status,attempts,left_at
    FROM channel_leave_auto_bans
    WHERE user_id=? AND status='banned'
    ORDER BY left_at DESC
    LIMIT 1
  `).bind(userId).first<AutoBanRow>();
  if (!row) return false;

  await telegram.call<boolean>('unbanChatMember', {
    chat_id: normalizeChatId(row.channel_id),
    user_id: userId,
    only_if_banned: true,
  });
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE channel_leave_auto_bans
    SET status='unbanned',unbanned_at=?,next_attempt_at=NULL,last_error=NULL,updated_at=?
    WHERE user_id=? AND channel_key=?
  `).bind(now, now, userId, row.channel_key).run();
  return true;
}

export async function getChannelLeaveAutoBanSummary(env: Env): Promise<Record<string, number>> {
  const rows = await env.DB.prepare(`
    SELECT status,COUNT(*) AS n
    FROM channel_leave_auto_bans
    GROUP BY status
  `).all<{ status: string; n: number }>();
  return Object.fromEntries(rows.results.map((row) => [row.status, Number(row.n || 0)]));
}

export async function getAccessChannelForAutoBan(env: Env): Promise<AccessChannel | null> {
  return getAccessChannel(env);
}

async function attemptChannelLeaveAutoBan(
  userId: number,
  channelKey: string,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  const row = await env.DB.prepare(`
    SELECT user_id,channel_key,channel_id,status,attempts,left_at
    FROM channel_leave_auto_bans
    WHERE user_id=? AND channel_key=?
  `).bind(userId, channelKey).first<AutoBanRow>();
  if (!row || !['pending', 'retry'].includes(row.status)) return;

  const channel = await getAccessChannel(env);
  if (!channel || channel.key !== row.channel_key) {
    await markExempt(env, row, 'required_channel_changed');
    return;
  }

  if (isAdmin(userId, env)) {
    await markExempt(env, row, 'admin');
    return;
  }

  if (await runtimeFlag(env, 'channel_leave_autoban_boosty_exempt', true)) {
    const subscription = await getSubscriptionState(userId, env, telegram);
    if (subscription.subscriber) {
      await markExempt(env, row, 'boosty');
      return;
    }
    if (subscription.verificationError) {
      await scheduleRetry(env, row, new Error('Boosty entitlement check unavailable'));
      return;
    }
  }

  try {
    await telegram.call<boolean>('banChatMember', {
      chat_id: normalizeChatId(row.channel_id),
      user_id: userId,
    });
    const now = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE channel_leave_auto_bans
      SET status='banned',attempts=attempts+1,banned_at=?,next_attempt_at=NULL,
          last_error=NULL,exemption_reason=NULL,updated_at=?
      WHERE user_id=? AND channel_key=?
    `).bind(now, now, userId, channelKey).run();
    console.log(JSON.stringify({
      event: 'channel_leave_autoban_success',
      user_id: userId,
      channel: row.channel_id,
    }));
  } catch (error) {
    await scheduleRetry(env, row, error);
  }
}

async function scheduleRetry(env: Env, row: AutoBanRow, error: unknown): Promise<void> {
  const attempts = Number(row.attempts || 0) + 1;
  const maxAttempts = await maxAttemptsSetting(env);
  const now = new Date();
  const terminal = attempts >= maxAttempts;
  const retrySeconds = terminal ? 0 : retryDelaySeconds(attempts, error);
  const next = terminal ? null : new Date(now.getTime() + retrySeconds * 1000).toISOString();
  const message = errorText(error).slice(0, 900);

  await env.DB.prepare(`
    UPDATE channel_leave_auto_bans
    SET status=?,attempts=?,next_attempt_at=?,last_error=?,updated_at=?
    WHERE user_id=? AND channel_key=?
  `).bind(
    terminal ? 'failed' : 'retry',
    attempts,
    next,
    message,
    now.toISOString(),
    row.user_id,
    row.channel_key,
  ).run();

  console.warn(JSON.stringify({
    event: terminal ? 'channel_leave_autoban_failed' : 'channel_leave_autoban_retry',
    user_id: row.user_id,
    channel: row.channel_id,
    attempts,
    next_attempt_at: next,
    error: message,
  }));
}

async function markExempt(env: Env, row: AutoBanRow, reason: string): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE channel_leave_auto_bans
    SET status='exempt',exemption_reason=?,next_attempt_at=NULL,last_error=NULL,updated_at=?
    WHERE user_id=? AND channel_key=?
  `).bind(reason, now, row.user_id, row.channel_key).run();
}

async function maxAttemptsSetting(env: Env): Promise<number> {
  const raw = Number(await getRuntimeSetting(env, 'channel_leave_autoban_max_attempts', String(DEFAULT_MAX_ATTEMPTS)));
  return Number.isFinite(raw) ? Math.max(1, Math.min(20, Math.round(raw))) : DEFAULT_MAX_ATTEMPTS;
}

function retryDelaySeconds(attempts: number, error: unknown): number {
  if (error instanceof TelegramApiError && error.retryAfter !== undefined) {
    return Math.max(30, Math.min(21600, error.retryAfter));
  }
  return RETRY_DELAYS_SECONDS[Math.min(RETRY_DELAYS_SECONDS.length - 1, Math.max(0, attempts - 1))];
}

async function getAccessChannel(env: Env): Promise<AccessChannel | null> {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='access_channel_id'")
    .first<{ value: string | null }>();
  const id = normalizeConfiguredChannelId(String(row?.value || ''));
  return id ? { id, key: id.toLowerCase() } : null;
}

function matchesChannel(update: TelegramChatMemberUpdated, configuredId: string): boolean {
  if (/^-?\d+$/.test(configuredId)) return String(update.chat.id) === configuredId;
  const expected = configuredId.replace(/^@/, '').toLowerCase();
  return Boolean(update.chat.username && update.chat.username.toLowerCase() === expected);
}

function normalizeConfiguredChannelId(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^-?\d+$/.test(raw)) return raw;
  const username = raw.replace(/^@/, '');
  if (/^[A-Za-z0-9_]{5,}$/.test(username)) return `@${username}`;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['t.me', 'telegram.me', 'telegram.dog'].includes(url.hostname.toLowerCase())) return null;
    const part = url.pathname.split('/').filter(Boolean)[0] || '';
    return /^[A-Za-z0-9_]{5,}$/.test(part) ? `@${part}` : null;
  } catch {
    return null;
  }
}

function normalizeChatId(value: string): string | number {
  if (/^-?\d+$/.test(value)) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  return value;
}
