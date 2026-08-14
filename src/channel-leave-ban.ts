import { errorText, isAdmin, upsertUser } from './db';
import { normalizeLocale, t, type Locale } from './i18n/index';
import {
  escapeHtml,
  isActiveChatMember,
  type InlineKeyboardMarkup,
  type TelegramChatMemberUpdated,
  type TelegramClient,
  type TelegramUpdate,
  type TelegramUser,
} from './telegram';

type AppealState = 'none' | 'awaiting_text' | 'pending' | 'approved' | 'rejected';
type TelegramBanStatus = 'pending' | 'applied' | 'failed';

export type ChannelLeaveBanRow = {
  user_id: number;
  channel_id: string;
  active: number;
  leave_count: number;
  banned_at: string;
  telegram_ban_status: TelegramBanStatus;
  appeal_state: AppealState;
  appeal_text: string | null;
  appeal_created_at: string | null;
  appeal_reviewed_at: string | null;
  appeal_reviewed_by: number | null;
  last_language: string;
  updated_at: string;
};

const MAX_APPEAL_LENGTH = 3000;

export function localeFromTelegramUi(user: Pick<TelegramUser, 'language_code'> | null | undefined): Locale {
  const raw = String(user?.language_code ?? '').trim().toLowerCase();
  const base = raw.split(/[-_]/)[0];
  switch (base) {
    case 'ru': return 'ru';
    case 'es': return 'es';
    case 'fil':
    case 'tl': return 'fil';
    case 'hi': return 'hi';
    case 'pt': return 'pt';
    case 'id': return 'id';
    case 'vi': return 'vi';
    case 'fr': return 'fr';
    case 'de': return 'de';
    case 'ur': return 'ur';
    default: return 'en';
  }
}

export async function getActiveChannelLeaveBan(env: Env, userId: number): Promise<ChannelLeaveBanRow | null> {
  const row = await getChannelLeaveBan(env, userId);
  return row?.active === 1 ? row : null;
}

export async function handleChannelLeaveChatMemberUpdate(
  update: TelegramChatMemberUpdated,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  if (update.chat.type !== 'channel') return;
  if (!(await matchesConfiguredAccessChat(update, env))) return;

  const target = update.new_chat_member.user;
  if (isAdmin(target.id, env)) return;

  const voluntarilyLeft = isActiveChatMember(update.old_chat_member)
    && update.new_chat_member.status === 'left'
    && update.from.id === target.id;
  if (!voluntarilyLeft) return;

  await upsertUser(env, target);
  const now = new Date().toISOString();
  const locale = localeFromTelegramUi(target);

  try {
    await env.DB.prepare(`
      INSERT INTO channel_leave_bans (
        user_id, channel_id, active, leave_count, banned_at, telegram_ban_status,
        appeal_state, appeal_text, appeal_created_at, appeal_reviewed_at,
        appeal_reviewed_by, last_language, updated_at
      ) VALUES (?, ?, 1, 1, ?, 'pending', 'none', NULL, NULL, NULL, NULL, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        channel_id = excluded.channel_id,
        active = 1,
        leave_count = channel_leave_bans.leave_count + 1,
        banned_at = excluded.banned_at,
        telegram_ban_status = 'pending',
        appeal_state = 'none',
        appeal_text = NULL,
        appeal_created_at = NULL,
        appeal_reviewed_at = NULL,
        appeal_reviewed_by = NULL,
        last_language = excluded.last_language,
        updated_at = excluded.updated_at
    `).bind(target.id, String(update.chat.id), now, locale, now).run();
  } catch (error) {
    if (isMissingSchema(error)) return;
    throw error;
  }

  try {
    await telegram.call<boolean>('banChatMember', {
      chat_id: update.chat.id,
      user_id: target.id,
    });
    await setTelegramBanStatus(env, target.id, 'applied');
  } catch (error) {
    await setTelegramBanStatus(env, target.id, 'failed').catch(() => undefined);
    console.error(JSON.stringify({
      event: 'voluntary_channel_leave_ban_failed',
      user_id: target.id,
      channel_id: update.chat.id,
      error: errorText(error),
    }));
  }
}

/**
 * Handles both sides of the leave-ban flow before the normal bot router:
 * blocked users can only see the reason / submit an appeal, while the admin can
 * approve or reject appeal callbacks without entering the ordinary user flow.
 */
export async function handleChannelLeaveBanUpdate(
  update: TelegramUpdate,
  env: Env,
  telegram: TelegramClient,
): Promise<boolean> {
  const adminCallback = update.callback_query?.data
    ? /^leaveban:(approve|reject):(\d+)$/.exec(update.callback_query.data)
    : null;
  if (adminCallback && update.callback_query) {
    await handleAdminAppealCallback(
      update.callback_query.id,
      update.callback_query.from,
      update.callback_query.message?.chat.id,
      update.callback_query.message?.message_id,
      adminCallback[1] as 'approve' | 'reject',
      Number(adminCallback[2]),
      env,
      telegram,
    );
    return true;
  }

  const actor = privateActor(update);
  if (!actor || isAdmin(actor.id, env)) return false;

  const ban = await getActiveChannelLeaveBan(env, actor.id);
  if (!ban) return false;

  const locale = localeFromTelegramUi(actor);
  await rememberLanguage(env, actor.id, locale).catch(() => undefined);

  if (update.callback_query) {
    await telegram.answerCallbackQuery(update.callback_query.id).catch(() => undefined);
    if (update.callback_query.data === 'leaveban:appeal') {
      await beginAppeal(actor.id, locale, ban, env, telegram);
    } else {
      await sendBanNotice(actor.id, locale, ban, telegram);
    }
    return true;
  }

  const text = update.message?.text?.trim() ?? '';
  if (isAppealCommand(text)) {
    await beginAppeal(actor.id, locale, ban, env, telegram);
    return true;
  }

  if (ban.appeal_state === 'awaiting_text' && text && !text.startsWith('/')) {
    await submitAppeal(actor, locale, ban, text, env, telegram);
    return true;
  }

  await sendBanNotice(actor.id, locale, ban, telegram);
  return true;
}

async function beginAppeal(
  userId: number,
  locale: Locale,
  ban: ChannelLeaveBanRow,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  if (ban.appeal_state === 'pending') {
    await sendBanNotice(userId, locale, ban, telegram);
    return;
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE channel_leave_bans
    SET appeal_state = 'awaiting_text', appeal_text = NULL, appeal_created_at = NULL,
        appeal_reviewed_at = NULL, appeal_reviewed_by = NULL,
        last_language = ?, updated_at = ?
    WHERE user_id = ? AND active = 1
  `).bind(locale, now, userId).run();

  await telegram.sendMessage(
    userId,
    `<b>${t(locale, 'channelLeaveBanTitle')}</b>\n\n${t(locale, 'channelLeaveBanAppealPrompt')}`,
  );
}

async function submitAppeal(
  user: TelegramUser,
  locale: Locale,
  ban: ChannelLeaveBanRow,
  text: string,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  const appeal = text.slice(0, MAX_APPEAL_LENGTH);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE channel_leave_bans
    SET appeal_state = 'pending', appeal_text = ?, appeal_created_at = ?,
        appeal_reviewed_at = NULL, appeal_reviewed_by = NULL,
        last_language = ?, updated_at = ?
    WHERE user_id = ? AND active = 1
  `).bind(appeal, now, locale, now, user.id).run();

  const username = user.username ? `@${escapeHtml(user.username)}` : '—';
  const adminText = [
    '<b>Channel leave appeal</b>',
    '',
    `User: ${username}`,
    `Telegram ID: <code>${user.id}</code>`,
    `Voluntary leaves: <b>${ban.leave_count}</b>`,
    `Banned at: ${escapeHtml(ban.banned_at)}`,
    '',
    '<b>Appeal:</b>',
    escapeHtml(appeal),
  ].join('\n');
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [[
      { text: '✅ Approve', callback_data: `leaveban:approve:${user.id}` },
      { text: '❌ Reject', callback_data: `leaveban:reject:${user.id}` },
    ]],
  };

  try {
    await telegram.sendMessage(env.ADMIN_TELEGRAM_ID, adminText, { reply_markup: keyboard });
  } catch (error) {
    // Keep the appeal pending even if admin delivery temporarily fails; the user
    // must not regain access merely because an admin notification failed.
    console.error(JSON.stringify({
      event: 'channel_leave_appeal_admin_delivery_failed',
      user_id: user.id,
      error: errorText(error),
    }));
  }

  await telegram.sendMessage(user.id, t(locale, 'channelLeaveBanAppealSubmitted'));
}

async function handleAdminAppealCallback(
  callbackQueryId: string,
  admin: TelegramUser,
  chatId: number | undefined,
  messageId: number | undefined,
  action: 'approve' | 'reject',
  userId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  if (!isAdmin(admin.id, env)) {
    await telegram.answerCallbackQuery(callbackQueryId, 'Not allowed.').catch(() => undefined);
    return;
  }

  const ban = await getActiveChannelLeaveBan(env, userId);
  if (!ban) {
    await telegram.answerCallbackQuery(callbackQueryId, 'This ban is already resolved.').catch(() => undefined);
    if (chatId && messageId) {
      await telegram.editMessageReplyMarkup(chatId, messageId).catch(() => undefined);
    }
    return;
  }

  if (action === 'approve') {
    try {
      await telegram.call<boolean>('unbanChatMember', {
        chat_id: ban.channel_id,
        user_id: userId,
        only_if_banned: true,
      });
    } catch (error) {
      await telegram.answerCallbackQuery(callbackQueryId, 'Telegram unban failed.').catch(() => undefined);
      await telegram.sendMessage(admin.id, `<b>Could not unban ${userId}.</b>\n\n${escapeHtml(errorText(error))}`)
        .catch(() => undefined);
      return;
    }

    const now = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE channel_leave_bans
      SET active = 0, telegram_ban_status = 'applied', appeal_state = 'approved',
          appeal_reviewed_at = ?, appeal_reviewed_by = ?, updated_at = ?
      WHERE user_id = ? AND active = 1
    `).bind(now, admin.id, now, userId).run();

    const locale = normalizeLocale(ban.last_language);
    await telegram.sendMessage(userId, t(locale, 'channelLeaveBanAppealApproved')).catch(() => undefined);
    await telegram.answerCallbackQuery(callbackQueryId, 'Appeal approved.').catch(() => undefined);
    await finishAdminAppealMessage(chatId, messageId, '✅ Approved', telegram);
    return;
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE channel_leave_bans
    SET appeal_state = 'rejected', appeal_reviewed_at = ?, appeal_reviewed_by = ?, updated_at = ?
    WHERE user_id = ? AND active = 1
  `).bind(now, admin.id, now, userId).run();

  const locale = normalizeLocale(ban.last_language);
  await telegram.sendMessage(userId, t(locale, 'channelLeaveBanAppealRejected')).catch(() => undefined);
  await telegram.answerCallbackQuery(callbackQueryId, 'Appeal rejected.').catch(() => undefined);
  await finishAdminAppealMessage(chatId, messageId, '❌ Rejected', telegram);
}

async function finishAdminAppealMessage(
  chatId: number | undefined,
  messageId: number | undefined,
  status: string,
  telegram: TelegramClient,
): Promise<void> {
  if (!chatId || !messageId) return;
  await telegram.editMessageReplyMarkup(chatId, messageId).catch(() => undefined);
  await telegram.sendMessage(chatId, status).catch(() => undefined);
}

async function sendBanNotice(
  userId: number,
  locale: Locale,
  ban: ChannelLeaveBanRow,
  telegram: TelegramClient,
): Promise<void> {
  const parts = [
    `<b>${t(locale, 'channelLeaveBanTitle')}</b>`,
    '',
    t(locale, 'channelLeaveBanText'),
  ];

  if (ban.appeal_state === 'pending') {
    parts.push('', t(locale, 'channelLeaveBanAppealPending'));
  } else if (ban.appeal_state === 'rejected') {
    parts.push('', t(locale, 'channelLeaveBanAppealRejected'));
  } else if (ban.appeal_state === 'awaiting_text') {
    parts.push('', t(locale, 'channelLeaveBanAppealPrompt'));
  }

  const keyboard: InlineKeyboardMarkup | undefined = ban.appeal_state === 'pending'
    ? undefined
    : {
        inline_keyboard: [[{
          text: t(locale, 'channelLeaveBanAppealButton'),
          callback_data: 'leaveban:appeal',
        }]],
      };

  await telegram.sendMessage(userId, parts.join('\n'), keyboard ? { reply_markup: keyboard } : {});
}

async function getChannelLeaveBan(env: Env, userId: number): Promise<ChannelLeaveBanRow | null> {
  try {
    return await env.DB.prepare(`
      SELECT user_id, channel_id, active, leave_count, banned_at, telegram_ban_status,
             appeal_state, appeal_text, appeal_created_at, appeal_reviewed_at,
             appeal_reviewed_by, last_language, updated_at
      FROM channel_leave_bans WHERE user_id = ?
    `).bind(userId).first<ChannelLeaveBanRow>();
  } catch (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
}

async function setTelegramBanStatus(env: Env, userId: number, status: TelegramBanStatus): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE channel_leave_bans SET telegram_ban_status = ?, updated_at = ?
    WHERE user_id = ? AND active = 1
  `).bind(status, now, userId).run();
}

async function rememberLanguage(env: Env, userId: number, locale: Locale): Promise<void> {
  await env.DB.prepare(`
    UPDATE channel_leave_bans SET last_language = ?, updated_at = ?
    WHERE user_id = ? AND active = 1
  `).bind(locale, new Date().toISOString(), userId).run();
}

async function matchesConfiguredAccessChat(update: TelegramChatMemberUpdated, env: Env): Promise<boolean> {
  const row = await env.DB.prepare(
    "SELECT value FROM app_settings WHERE key = 'access_channel_id'",
  ).first<{ value: string }>();
  const channelId = normalizeConfiguredChannelId(String(row?.value ?? ''));
  if (!channelId) return false;
  if (/^-?\d+$/.test(channelId)) return String(update.chat.id) === channelId;
  const configured = channelId.replace(/^@/, '').toLowerCase();
  return Boolean(update.chat.username && update.chat.username.toLowerCase() === configured);
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

function privateActor(update: TelegramUpdate): TelegramUser | null {
  if (update.message?.chat.type === 'private' && update.message.from) return update.message.from;
  if (update.callback_query?.message?.chat.type === 'private') return update.callback_query.from;
  return null;
}

function isAppealCommand(text: string): boolean {
  return text === '/appeal' || /^\/appeal@[^\s]+$/i.test(text);
}

function isMissingSchema(error: unknown): boolean {
  return errorText(error).toLowerCase().includes('no such table: channel_leave_bans');
}
