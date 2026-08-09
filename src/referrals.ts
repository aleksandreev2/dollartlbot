import { currentMonthKey, getUser } from './db';
import { normalizeLocale, type Locale } from './i18n/index';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { getQuotaState, REFERRAL_MONTHLY_SLOT_CAP } from './quota';
import { getSubscriptionState } from './subscription';
import {
  TelegramClient,
  type TelegramChat,
  type TelegramChatMember,
  type TelegramChatMemberUpdated,
} from './telegram';
import { FREE_MONTHLY_REQUEST_LIMIT, SUBSCRIBER_MONTHLY_REQUEST_LIMIT } from './domain';

const QUALIFY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAINTENANCE_BATCH = 50;

type ReferralEnv = Env & { REFERRAL_CHANNEL_ID?: string };

type ReferralRow = {
  id: number;
  referrer_user_id: number;
  referred_user_id: number;
  invite_link: string;
  status: 'pending' | 'cancelled' | 'qualified';
  joined_at: string;
  left_at: string | null;
  qualified_at: string | null;
  reward_granted: number;
  reward_month_key: string | null;
  reward_expires_at: string | null;
};

const NOTIFY: Record<Locale, { earned: string; cap: string }> = {
  en: { earned: '🎁 Referral completed! You earned +1 bonus novel request.', cap: '✅ Referral completed. Your referral bonus is already at the +3 maximum.' },
  es: { earned: '🎁 ¡Referencia completada! Has ganado +1 solicitud extra de novela.', cap: '✅ Referencia completada. Ya alcanzaste el máximo de +3 solicitudes extra.' },
  fil: { earned: '🎁 Kumpleto ang referral! Nakakuha ka ng +1 bonus na kahilingan sa nobela.', cap: '✅ Kumpleto ang referral. Nasa maximum na +3 bonus requests ka na.' },
  hi: { earned: '🎁 रेफ़रल पूरा हुआ! आपको +1 अतिरिक्त उपन्यास अनुरोध मिला।', cap: '✅ रेफ़रल पूरा हुआ। आप पहले ही +3 अधिकतम रेफ़रल बोनस पर हैं।' },
  pt: { earned: '🎁 Indicação concluída! Você ganhou +1 pedido extra de novel.', cap: '✅ Indicação concluída. Você já atingiu o máximo de +3 pedidos extras.' },
  id: { earned: '🎁 Referral selesai! Kamu mendapat +1 permintaan novel bonus.', cap: '✅ Referral selesai. Bonus referral kamu sudah mencapai maksimum +3.' },
  vi: { earned: '🎁 Giới thiệu thành công! Bạn nhận được +1 lượt yêu cầu tiểu thuyết.', cap: '✅ Giới thiệu thành công. Bạn đã đạt mức thưởng giới thiệu tối đa +3.' },
  fr: { earned: '🎁 Parrainage validé ! Vous gagnez +1 demande de roman supplémentaire.', cap: '✅ Parrainage validé. Vous avez déjà atteint le maximum de +3 demandes bonus.' },
  de: { earned: '🎁 Empfehlung abgeschlossen! Du erhältst +1 zusätzliche Roman-Anfrage.', cap: '✅ Empfehlung abgeschlossen. Du hast bereits das Maximum von +3 Bonus-Anfragen erreicht.' },
  ru: { earned: '🎁 Реферал засчитан! Вы получили +1 дополнительную заявку на новеллу.', cap: '✅ Реферал засчитан. У вас уже достигнут максимум: +3 реферальных слота.' },
};

export async function handleReferralApiRequest(
  request: Request,
  env: Env,
  telegram: TelegramClient,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/app/referrals') return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  const channel = referralChannel(env);
  if (!channel) {
    return miniAppJson({ enabled: false, max_bonus: REFERRAL_MONTHLY_SLOT_CAP });
  }

  let invite = await env.DB.prepare(
    'SELECT invite_link FROM referral_invites WHERE referrer_user_id = ?',
  ).bind(auth.telegramUser.id).first<{ invite_link: string }>();

  if (!invite?.invite_link) {
    try {
      const created = await telegram.createChatInviteLink(channel, `DTL ref ${auth.telegramUser.id}`);
      const now = new Date().toISOString();
      await env.DB.prepare(`
        INSERT INTO referral_invites (referrer_user_id, invite_link, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(referrer_user_id) DO UPDATE SET
          invite_link = excluded.invite_link,
          updated_at = excluded.updated_at
      `).bind(auth.telegramUser.id, created.invite_link, now, now).run();
      invite = { invite_link: created.invite_link };
    } catch (error) {
      console.warn(JSON.stringify({ event: 'referral_invite_create_failed', user_id: auth.telegramUser.id, error: String(error) }));
      return miniAppJsonError(
        'referral_unavailable',
        'Referral links are temporarily unavailable. Please try again later.',
        503,
      );
    }
  }

  const [subscription, pending, qualified, grantStats] = await Promise.all([
    getSubscriptionState(auth.telegramUser.id, env, telegram),
    env.DB.prepare(`
      SELECT id, joined_at
      FROM referrals
      WHERE referrer_user_id = ? AND status = 'pending'
      ORDER BY joined_at ASC
      LIMIT 20
    `).bind(auth.telegramUser.id).all<{ id: number; joined_at: string }>(),
    env.DB.prepare(`
      SELECT id, qualified_at, reward_granted, reward_expires_at
      FROM referrals
      WHERE referrer_user_id = ? AND status = 'qualified'
      ORDER BY qualified_at DESC
      LIMIT 20
    `).bind(auth.telegramUser.id).all<{
      id: number;
      qualified_at: string | null;
      reward_granted: number;
      reward_expires_at: string | null;
    }>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM referrals
      WHERE referrer_user_id = ? AND reward_granted = 1 AND reward_month_key = ?
    `).bind(auth.telegramUser.id, currentMonthKey()).first<{ count: number }>(),
  ]);

  const baseLimit = subscription.subscriber
    ? SUBSCRIBER_MONTHLY_REQUEST_LIMIT
    : FREE_MONTHLY_REQUEST_LIMIT;
  const quota = await getQuotaState(env, auth.telegramUser.id, baseLimit);
  const nowMs = Date.now();

  return miniAppJson({
    enabled: true,
    invite_link: invite.invite_link,
    max_bonus: REFERRAL_MONTHLY_SLOT_CAP,
    grants_this_month: Number(grantStats?.count ?? 0),
    quota: {
      base_limit: quota.baseLimit,
      bonus: quota.referralBonus,
      available: quota.referralAvailable,
      used_bonus: quota.referralUsed,
      effective_limit: quota.limit,
      used: quota.used,
      remaining: quota.remaining,
    },
    pending: pending.results.map((row) => {
      const joined = new Date(row.joined_at).getTime();
      const elapsed = Math.max(0, nowMs - joined);
      return {
        id: row.id,
        joined_at: row.joined_at,
        progress: Math.max(0, Math.min(1, elapsed / QUALIFY_AFTER_MS)),
        remaining_seconds: Math.max(0, Math.ceil((QUALIFY_AFTER_MS - elapsed) / 1000)),
      };
    }),
    qualified: qualified.results,
  });
}

export async function handleReferralChatMemberUpdate(
  update: TelegramChatMemberUpdated,
  env: Env,
): Promise<void> {
  if (!isReferralChannel(update.chat, env)) return;

  const user = update.new_chat_member.user;
  if (!user || user.is_bot) return;
  const wasMember = isMember(update.old_chat_member);
  const isNowMember = isMember(update.new_chat_member);
  if (wasMember === isNowMember) return;

  const now = new Date(update.date * 1000).toISOString();
  if (isNowMember) {
    const inviteLink = update.invite_link?.invite_link;
    if (!inviteLink) return;
    const invite = await env.DB.prepare(
      'SELECT referrer_user_id FROM referral_invites WHERE invite_link = ?',
    ).bind(inviteLink).first<{ referrer_user_id: number }>();
    if (!invite || invite.referrer_user_id === user.id) return;

    const existing = await env.DB.prepare(
      'SELECT id, status FROM referrals WHERE referred_user_id = ?',
    ).bind(user.id).first<{ id: number; status: string }>();
    if (existing?.status === 'qualified') return;

    if (existing) {
      await env.DB.prepare(`
        UPDATE referrals
        SET referrer_user_id = ?, invite_link = ?, status = 'pending', joined_at = ?, left_at = NULL,
            qualified_at = NULL, reward_granted = 0, reward_month_key = NULL,
            reward_expires_at = NULL, updated_at = ?
        WHERE referred_user_id = ? AND status <> 'qualified'
      `).bind(invite.referrer_user_id, inviteLink, now, now, user.id).run();
    } else {
      await env.DB.prepare(`
        INSERT INTO referrals (
          referrer_user_id, referred_user_id, invite_link, status, joined_at,
          reward_granted, created_at, updated_at
        ) VALUES (?, ?, ?, 'pending', ?, 0, ?, ?)
      `).bind(invite.referrer_user_id, user.id, inviteLink, now, now, now).run();
    }
    return;
  }

  await env.DB.prepare(`
    UPDATE referrals
    SET status = 'cancelled', left_at = ?, updated_at = ?
    WHERE referred_user_id = ? AND status = 'pending'
  `).bind(now, now, user.id).run();
}

export async function runReferralMaintenance(
  env: Env,
  telegram: TelegramClient,
  date = new Date(),
): Promise<void> {
  const channel = referralChannel(env);
  if (!channel) return;

  const threshold = new Date(date.getTime() - QUALIFY_AFTER_MS).toISOString();
  const pending = await env.DB.prepare(`
    SELECT id, referrer_user_id, referred_user_id, invite_link, status, joined_at,
           left_at, qualified_at, reward_granted, reward_month_key, reward_expires_at
    FROM referrals
    WHERE status = 'pending' AND joined_at <= ?
    ORDER BY joined_at ASC
    LIMIT ?
  `).bind(threshold, MAINTENANCE_BATCH).all<ReferralRow>();

  for (const row of pending.results) {
    try {
      const member = await telegram.getChatMember(channel, row.referred_user_id);
      if (!isMember(member)) {
        const now = date.toISOString();
        await env.DB.prepare(`
          UPDATE referrals SET status = 'cancelled', left_at = ?, updated_at = ?
          WHERE id = ? AND status = 'pending'
        `).bind(now, now, row.id).run();
        continue;
      }

      await qualifyReferral(row, env, telegram, date);
    } catch (error) {
      console.warn(JSON.stringify({ event: 'referral_verification_failed', referral_id: row.id, error: String(error) }));
    }
  }
}

async function qualifyReferral(
  row: ReferralRow,
  env: Env,
  telegram: TelegramClient,
  date: Date,
): Promise<void> {
  const monthKey = currentMonthKey(date);
  const now = date.toISOString();
  const [grantedThisMonth, available] = await Promise.all([
    env.DB.prepare(`
      SELECT COUNT(*) AS count FROM referrals
      WHERE referrer_user_id = ? AND reward_granted = 1 AND reward_month_key = ?
    `).bind(row.referrer_user_id, monthKey).first<{ count: number }>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM referrals r
      WHERE r.referrer_user_id = ?
        AND r.status = 'qualified'
        AND r.reward_granted = 1
        AND r.reward_expires_at >= ?
        AND NOT EXISTS (
          SELECT 1 FROM submissions s WHERE s.referral_id = r.id AND s.slot_returned = 0
        )
    `).bind(row.referrer_user_id, now).first<{ count: number }>(),
  ]);

  const grant =
    Number(grantedThisMonth?.count ?? 0) < REFERRAL_MONTHLY_SLOT_CAP &&
    Number(available?.count ?? 0) < REFERRAL_MONTHLY_SLOT_CAP;
  const expires = grant ? endOfNextMonth(date).toISOString() : null;

  const updated = await env.DB.prepare(`
    UPDATE referrals
    SET status = 'qualified', qualified_at = ?, reward_granted = ?,
        reward_month_key = ?, reward_expires_at = ?, updated_at = ?
    WHERE id = ? AND status = 'pending'
  `).bind(now, grant ? 1 : 0, grant ? monthKey : null, expires, now, row.id).run();
  if ((updated.meta.changes ?? 0) === 0) return;

  const user = await getUser(env, row.referrer_user_id);
  const locale = normalizeLocale(user?.language);
  await telegram.sendMessage(row.referrer_user_id, grant ? NOTIFY[locale].earned : NOTIFY[locale].cap).catch(() => undefined);
}

function referralChannel(env: Env): number | string | null {
  const value = String((env as ReferralEnv).REFERRAL_CHANNEL_ID ?? '').trim();
  if (!value) return null;
  if (/^-?\d+$/.test(value)) {
    const numeric = Number(value);
    return Number.isSafeInteger(numeric) ? numeric : value;
  }
  return value.startsWith('@') ? value : `@${value}`;
}

function isReferralChannel(chat: TelegramChat, env: Env): boolean {
  const configured = referralChannel(env);
  if (configured === null) return false;
  if (typeof configured === 'number') return chat.id === configured;
  return Boolean(chat.username && `@${chat.username}`.toLowerCase() === configured.toLowerCase());
}

function isMember(member: TelegramChatMember): boolean {
  if (member.status === 'creator' || member.status === 'administrator' || member.status === 'member') return true;
  return member.status === 'restricted' && member.is_member === true;
}

function endOfNextMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 2, 1, 0, 0, 0, 0) - 1);
}
