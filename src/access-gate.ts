import { errorText, isAdmin } from './db';
import { t, type Locale } from './i18n/index';
import { getSubscriptionState } from './subscription';
import {
  isActiveChatMember,
  type InlineKeyboardMarkup,
  type TelegramChatMemberUpdated,
  type TelegramClient,
  type TelegramUser,
} from './telegram';

const POSITIVE_TTL_MS = 3 * 60 * 1000;
const NEGATIVE_TTL_MS = 15 * 1000;
const STALE_POSITIVE_GRACE_MS = 30 * 60 * 1000;
const CONFIG_TTL_MS = 60 * 1000;

type AccessConfig = {
  channelId: string | null;
  channelKey: string | null;
  joinUrl: string | null;
  configured: boolean;
  intended: boolean;
};

type CacheRow = {
  is_member: number;
  source: string;
  checked_at: string;
  expires_at: string;
  stale_until: string;
};

export type AccessDecisionReason =
  | 'admin'
  | 'channel'
  | 'cache'
  | 'entitlement'
  | 'not_configured'
  | 'membership_required'
  | 'check_unavailable';

export type AccessDecision = {
  allowed: boolean;
  configured: boolean;
  reason: AccessDecisionReason;
  channelId: string | null;
  channelKey: string | null;
  joinUrl: string | null;
};

type AccessOptions = { force?: boolean };

let configCache: { value: AccessConfig; expiresAt: number } | null = null;

export function invalidateAccessConfigCache(): void {
  configCache = null;
}

export async function checkBotAccess(
  userId: number,
  env: Env,
  telegram: TelegramClient,
  options: AccessOptions = {},
): Promise<AccessDecision> {
  if (isAdmin(userId, env)) return decision(true, 'admin', null);

  const config = await getAccessConfig(env);
  if (!config.intended) return decision(true, 'not_configured', config);
  if (!config.configured || !config.channelId || !config.channelKey) {
    return decision(false, 'check_unavailable', config);
  }

  const now = Date.now();
  const cached = await readCache(env, userId, config.channelKey);
  if (!options.force && cached && Date.parse(cached.expires_at) > now) {
    if (cached.is_member === 1) {
      return decision(true, cached.source === 'entitlement' ? 'entitlement' : 'cache', config);
    }
    if (cached.source === 'denied') return decision(false, 'membership_required', config);
  }

  let channelCheckFailed = false;
  try {
    const member = await telegram.getChatMember(config.channelId, userId);
    if (isActiveChatMember(member)) {
      await writeCache(env, userId, config.channelKey, true, 'channel', POSITIVE_TTL_MS, STALE_POSITIVE_GRACE_MS);
      return decision(true, 'channel', config);
    }
  } catch (error) {
    channelCheckFailed = true;
    console.warn(JSON.stringify({ event: 'access_channel_check_failed', user_id: userId, error: errorText(error) }));
  }

  // Existing privileged entitlement remains an internal access path and is never
  // disclosed in access-gate copy or API details shown to users.
  const subscription = await getSubscriptionState(userId, env, telegram);
  if (subscription.subscriber) {
    await writeCache(env, userId, config.channelKey, true, 'entitlement', POSITIVE_TTL_MS, STALE_POSITIVE_GRACE_MS);
    return decision(true, 'entitlement', config);
  }

  if (
    subscription.verificationError
    && cached?.is_member === 1
    && cached.source === 'entitlement'
    && Date.parse(cached.stale_until) > now
  ) {
    return decision(true, 'cache', config);
  }

  if (channelCheckFailed) {
    if (
      cached?.is_member === 1
      && cached.source !== 'entitlement'
      && Date.parse(cached.stale_until) > now
    ) {
      return decision(true, 'cache', config);
    }
    return decision(false, 'check_unavailable', config);
  }

  if (subscription.verificationError) return decision(false, 'check_unavailable', config);

  await writeCache(env, userId, config.channelKey, false, 'denied', NEGATIVE_TTL_MS, NEGATIVE_TTL_MS);
  return decision(false, 'membership_required', config);
}

export async function handleAccessChatMemberUpdate(update: TelegramChatMemberUpdated, env: Env): Promise<void> {
  const config = await getAccessConfig(env);
  if (!config.configured || !config.channelId || !config.channelKey) return;
  if (!matchesConfiguredChat(update, config.channelId)) return;

  const active = isActiveChatMember(update.new_chat_member);
  await writeCache(
    env,
    update.new_chat_member.user.id,
    config.channelKey,
    active,
    'channel_event',
    active ? POSITIVE_TTL_MS : 0,
    active ? STALE_POSITIVE_GRACE_MS : 0,
  );
}

export async function runAccessGateMaintenance(env: Env, now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare('DELETE FROM access_membership_cache WHERE stale_until < ?').bind(cutoff).run();
}

export async function sendAccessGate(
  chatId: number,
  locale: Locale,
  access: AccessDecision,
  telegram: TelegramClient,
  messageId?: number,
): Promise<void> {
  const unavailable = access.reason === 'check_unavailable';
  const title = t(locale, unavailable ? 'accessCheckUnavailableTitle' : 'accessRequiredTitle');
  const body = t(locale, unavailable ? 'accessCheckUnavailableText' : 'accessRequiredText');
  const text = `<b>${title}</b>\n\n${body}`;
  const keyboard = accessKeyboard(locale, access);

  if (messageId) {
    try {
      await telegram.editMessageText(chatId, messageId, text, { reply_markup: keyboard });
      return;
    } catch {
      // A stale/non-editable gate message should not make the flow unusable.
    }
  }
  await telegram.sendMessage(chatId, text, { reply_markup: keyboard });
}

export function accessErrorDetails(locale: Locale, access: AccessDecision) {
  const unavailable = access.reason === 'check_unavailable';
  return {
    title: t(locale, unavailable ? 'accessCheckUnavailableTitle' : 'accessRequiredTitle'),
    join_url: access.joinUrl,
    join_label: t(locale, 'accessJoinButton'),
    retry_label: t(locale, 'accessRetryButton'),
  };
}

export function accessErrorMessage(locale: Locale, access: AccessDecision): string {
  return t(locale, access.reason === 'check_unavailable' ? 'accessCheckUnavailableText' : 'accessRequiredText');
}

export function accessErrorCode(access: AccessDecision): 'membership_required' | 'access_check_unavailable' {
  return access.reason === 'check_unavailable' ? 'access_check_unavailable' : 'membership_required';
}

export async function getAccessGateDiagnostics(env: Env, telegram: TelegramClient) {
  const config = await getAccessConfig(env, true);
  if (!config.intended) {
    return {
      ok: false,
      configured: false,
      message: 'Канал обязательного доступа не настроен. Ограничение доступа выключено.',
      join_url: null,
    };
  }
  if (!config.configured || !config.channelId) {
    return {
      ok: false,
      configured: false,
      message: 'Канал обязательного доступа указан некорректно. Используйте @username или числовой chat ID.',
      join_url: config.joinUrl,
    };
  }

  try {
    const chat = await telegram.call<{ id: number; type: string; title?: string; username?: string }>('getChat', {
      chat_id: normalizeTelegramChatId(config.channelId),
    });
    if (chat.type !== 'channel') {
      return {
        ok: false,
        configured: true,
        id: String(chat.id),
        message: `Для обязательного доступа нужен Telegram-канал, сейчас указан чат типа «${chat.type}».`,
        join_url: config.joinUrl,
      };
    }
    const me = await telegram.call<TelegramUser>('getMe', {});
    const member = await telegram.getChatMember(chat.id, me.id);
    const botAdmin = member.status === 'administrator' || member.status === 'creator';
    const effectiveJoinUrl = config.joinUrl || (chat.username ? `https://t.me/${chat.username}` : null);
    return {
      ok: botAdmin && Boolean(effectiveJoinUrl),
      configured: true,
      id: String(chat.id),
      title: chat.title || chat.username || '',
      bot_status: member.status,
      join_url: effectiveJoinUrl,
      message: !botAdmin
        ? 'Канал найден, но бот не является администратором. Надёжная проверка участников и мгновенный отзыв доступа невозможны.'
        : !effectiveJoinUrl
          ? 'Канал и права бота настроены, но нет публичной или invite-ссылки для кнопки вступления.'
          : `Доступ настроен: ${chat.title || chat.username || chat.id}. Бот имеет права администратора.`,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      message: `Не удалось проверить канал обязательного доступа: ${errorText(error)}`,
      join_url: config.joinUrl,
    };
  }
}

async function getAccessConfig(env: Env, force = false): Promise<AccessConfig> {
  const now = Date.now();
  if (!force && configCache && configCache.expiresAt > now) return configCache.value;

  const rows = await env.DB.prepare(`
    SELECT key, value FROM app_settings
    WHERE key IN ('access_channel_id','access_channel_url')
  `).all<{ key: string; value: string }>();
  const values = Object.fromEntries(rows.results.map((row) => [row.key, String(row.value || '').trim()]));
  const raw = values.access_channel_id || '';
  const channelId = normalizeConfiguredChannelId(raw);
  const explicitJoin = normalizeJoinUrl(values.access_channel_url || '');
  const value: AccessConfig = {
    channelId,
    channelKey: channelId ? channelId.toLowerCase() : null,
    joinUrl: explicitJoin || deriveJoinUrl(channelId),
    configured: Boolean(channelId),
    intended: Boolean(raw),
  };
  configCache = { value, expiresAt: now + CONFIG_TTL_MS };
  return value;
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

function normalizeJoinUrl(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !['t.me', 'telegram.me', 'telegram.dog'].includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function deriveJoinUrl(channelId: string | null): string | null {
  if (!channelId?.startsWith('@')) return null;
  return `https://t.me/${channelId.slice(1)}`;
}

function matchesConfiguredChat(update: TelegramChatMemberUpdated, channelId: string): boolean {
  if (/^-?\d+$/.test(channelId)) return String(update.chat.id) === channelId;
  const configured = channelId.replace(/^@/, '').toLowerCase();
  return Boolean(update.chat.username && update.chat.username.toLowerCase() === configured);
}

function accessKeyboard(locale: Locale, access: AccessDecision): InlineKeyboardMarkup {
  const rows: InlineKeyboardMarkup['inline_keyboard'] = [];
  if (access.joinUrl) rows.push([{ text: t(locale, 'accessJoinButton'), url: access.joinUrl }]);
  rows.push([{ text: t(locale, 'accessRetryButton'), callback_data: 'access:retry' }]);
  return { inline_keyboard: rows };
}

function decision(allowed: boolean, reason: AccessDecisionReason, config: AccessConfig | null): AccessDecision {
  return {
    allowed,
    configured: Boolean(config?.configured),
    reason,
    channelId: config?.channelId ?? null,
    channelKey: config?.channelKey ?? null,
    joinUrl: config?.joinUrl ?? null,
  };
}

async function readCache(env: Env, userId: number, channelKey: string): Promise<CacheRow | null> {
  try {
    return await env.DB.prepare(`
      SELECT is_member, source, checked_at, expires_at, stale_until
      FROM access_membership_cache WHERE user_id = ? AND channel_key = ?
    `).bind(userId, channelKey).first<CacheRow>();
  } catch (error) {
    console.warn(JSON.stringify({ event: 'access_cache_read_failed', user_id: userId, error: errorText(error) }));
    return null;
  }
}

async function writeCache(
  env: Env,
  userId: number,
  channelKey: string,
  member: boolean,
  source: string,
  ttlMs: number,
  staleMs: number,
): Promise<void> {
  const now = Date.now();
  try {
    await env.DB.prepare(`
      INSERT INTO access_membership_cache (user_id, channel_key, is_member, source, checked_at, expires_at, stale_until)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, channel_key) DO UPDATE SET
        is_member = excluded.is_member,
        source = excluded.source,
        checked_at = excluded.checked_at,
        expires_at = excluded.expires_at,
        stale_until = excluded.stale_until
    `).bind(
      userId,
      channelKey,
      member ? 1 : 0,
      source,
      new Date(now).toISOString(),
      new Date(now + ttlMs).toISOString(),
      new Date(now + staleMs).toISOString(),
    ).run();
  } catch (error) {
    console.warn(JSON.stringify({ event: 'access_cache_write_failed', user_id: userId, error: errorText(error) }));
  }
}

function normalizeTelegramChatId(value: string): string | number {
  if (/^-?\d+$/.test(value)) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  return value;
}
