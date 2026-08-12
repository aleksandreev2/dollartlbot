import { currentMonthKey, getUser } from './db';
import { normalizeLocale, type Locale } from './i18n/index';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { sendUserNotification } from './notifications';
import { getQuotaState, REFERRAL_MONTHLY_SLOT_CAP } from './quota';
import { getSubscriptionState } from './subscription';
import {
  TelegramClient,
  type InlineKeyboardMarkup,
  type TelegramChat,
  type TelegramChatMember,
  type TelegramChatMemberUpdated,
} from './telegram';
import { FREE_MONTHLY_REQUEST_LIMIT, SUBSCRIBER_MONTHLY_REQUEST_LIMIT } from './domain';

const QUALIFY_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAINTENANCE_BATCH = 50;

type ReferralEnv = Env & {
  REFERRAL_CHANNEL_ID?: string;
  BOT_USERNAME?: string;
  MINI_APP_URL?: string;
};

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
  ur: { earned: '🎁 ریفرل مکمل! آپ کو ناول کی +1 اضافی درخواست ملی۔', cap: '✅ ریفرل مکمل۔ آپ کا ریفرل بونس پہلے ہی زیادہ سے زیادہ +3 ہے۔' },
};

const REFERRAL_NOTIFY_TITLE: Record<Locale, string> = {
  en:'Referral bonus updated',
  es:'Bono de referido actualizado',
  fil:'Na-update ang referral bonus',
  hi:'रेफ़रल बोनस अपडेट हुआ',
  pt:'Bônus de indicação atualizado',
  id:'Bonus referral diperbarui',
  vi:'Đã cập nhật thưởng giới thiệu',
  fr:'Bonus de parrainage mis à jour',
  de:'Empfehlungsbonus aktualisiert',
  ru:'Реферальный бонус обновлён',
  ur:'ریفرل بونس اپ ڈیٹ ہو گیا',
};

const REFERRAL_START: Record<Locale, { title: string; body: string; join: string; app: string }> = {
  en: {
    title: '🎁 You were invited to Dollar TL',
    body: 'Join our channel using the button below and stay subscribed for at least 7 days. After that, the person who invited you receives +1 bonus novel request. You can also open the Dollar TL Mini App right away.',
    join: 'Join the Dollar TL channel',
    app: 'Open Dollar TL',
  },
  es: {
    title: '🎁 Te invitaron a Dollar TL',
    body: 'Únete a nuestro canal con el botón de abajo y permanece suscrito al menos 7 días. Después, la persona que te invitó recibirá +1 solicitud extra de novela. También puedes abrir la Mini App de Dollar TL ahora mismo.',
    join: 'Unirse al canal de Dollar TL',
    app: 'Abrir Dollar TL',
  },
  fil: {
    title: '🎁 Inimbitahan ka sa Dollar TL',
    body: 'Sumali sa aming channel gamit ang button sa ibaba at manatili nang hindi bababa sa 7 araw. Pagkatapos nito, makakakuha ng +1 bonus na kahilingan sa nobela ang nag-imbita sa iyo. Maaari mo ring buksan agad ang Dollar TL Mini App.',
    join: 'Sumali sa Dollar TL channel',
    app: 'Buksan ang Dollar TL',
  },
  hi: {
    title: '🎁 आपको Dollar TL में आमंत्रित किया गया है',
    body: 'नीचे दिए गए बटन से हमारे चैनल में जुड़ें और कम से कम 7 दिन सदस्य बने रहें। इसके बाद आपको आमंत्रित करने वाले व्यक्ति को +1 अतिरिक्त उपन्यास अनुरोध मिलेगा। आप अभी Dollar TL Mini App भी खोल सकते हैं।',
    join: 'Dollar TL चैनल से जुड़ें',
    app: 'Dollar TL खोलें',
  },
  pt: {
    title: '🎁 Você foi convidado para o Dollar TL',
    body: 'Entre no nosso canal pelo botão abaixo e permaneça inscrito por pelo menos 7 dias. Depois disso, quem te convidou recebe +1 pedido extra de novel. Você também pode abrir o Mini App do Dollar TL agora.',
    join: 'Entrar no canal do Dollar TL',
    app: 'Abrir Dollar TL',
  },
  id: {
    title: '🎁 Kamu diundang ke Dollar TL',
    body: 'Gabung ke channel kami lewat tombol di bawah dan tetap menjadi anggota setidaknya selama 7 hari. Setelah itu, orang yang mengundangmu mendapat +1 permintaan novel bonus. Kamu juga bisa langsung membuka Mini App Dollar TL.',
    join: 'Gabung channel Dollar TL',
    app: 'Buka Dollar TL',
  },
  vi: {
    title: '🎁 Bạn được mời vào Dollar TL',
    body: 'Hãy tham gia kênh của chúng tôi bằng nút bên dưới và ở lại ít nhất 7 ngày. Sau đó, người đã mời bạn sẽ nhận +1 lượt yêu cầu tiểu thuyết. Bạn cũng có thể mở Mini App Dollar TL ngay bây giờ.',
    join: 'Tham gia kênh Dollar TL',
    app: 'Mở Dollar TL',
  },
  fr: {
    title: '🎁 Vous avez été invité sur Dollar TL',
    body: 'Rejoignez notre canal avec le bouton ci-dessous et restez abonné pendant au moins 7 jours. Ensuite, la personne qui vous a invité reçoit +1 demande de roman bonus. Vous pouvez aussi ouvrir immédiatement la Mini App Dollar TL.',
    join: 'Rejoindre le canal Dollar TL',
    app: 'Ouvrir Dollar TL',
  },
  de: {
    title: '🎁 Du wurdest zu Dollar TL eingeladen',
    body: 'Tritt unserem Kanal über die Schaltfläche unten bei und bleibe mindestens 7 Tage Mitglied. Danach erhält die Person, die dich eingeladen hat, +1 zusätzliche Roman-Anfrage. Du kannst außerdem sofort die Dollar TL Mini App öffnen.',
    join: 'Dollar TL Kanal beitreten',
    app: 'Dollar TL öffnen',
  },
  ru: {
    title: '🎁 Вас пригласили в Dollar TL',
    body: 'Вступите в наш канал по кнопке ниже и оставайтесь подписчиком не менее 7 дней. После этого пригласивший вас пользователь получит +1 дополнительную заявку на новеллу. Mini App Dollar TL можно открыть сразу.',
    join: 'Вступить в канал Dollar TL',
    app: 'Открыть Dollar TL',
  },
  ur: {
    title: '🎁 آپ کو Dollar TL میں مدعو کیا گیا ہے',
    body: 'نیچے والے بٹن سے ہمارے channel میں شامل ہوں اور کم از کم 7 دن subscribed رہیں۔ اس کے بعد جس شخص نے آپ کو مدعو کیا اسے ناول کی +1 اضافی درخواست ملے گی۔ آپ Dollar TL Mini App ابھی بھی کھول سکتے ہیں۔',
    join: 'Dollar TL channel join کریں',
    app: 'Dollar TL کھولیں',
  },
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

  try {
    await ensureChannelInvite(auth.telegramUser.id, env, telegram);
  } catch (error) {
    console.warn(JSON.stringify({ event: 'referral_invite_create_failed', user_id: auth.telegramUser.id, error: String(error) }));
    return miniAppJsonError(
      'referral_unavailable',
      'Referral links are temporarily unavailable. Please try again later.',
      503,
    );
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
    invite_link: referralDeepLink(auth.telegramUser.id, env),
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

export async function handleReferralBotStart(
  startParam: string,
  referredUserId: number,
  locale: Locale,
  env: Env,
  telegram: TelegramClient,
): Promise<boolean> {
  const match = /^ref_([0-9a-z]+)$/i.exec(startParam.trim());
  if (!match) return false;

  const referrerUserId = Number.parseInt(match[1], 36);
  if (!Number.isSafeInteger(referrerUserId) || referrerUserId <= 0 || referrerUserId === referredUserId) {
    return true;
  }

  const referrer = await getUser(env, referrerUserId);
  if (!referrer || !referralChannel(env)) return true;

  let inviteLink: string;
  try {
    inviteLink = await ensureChannelInvite(referrerUserId, env, telegram);
  } catch (error) {
    console.warn(JSON.stringify({ event: 'referral_start_invite_failed', referrer_user_id: referrerUserId, referred_user_id: referredUserId, error: String(error) }));
    return true;
  }

  const copy = REFERRAL_START[locale];
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: copy.join, url: inviteLink }],
      ...((env as ReferralEnv).MINI_APP_URL
        ? [[{ text: copy.app, web_app: { url: String((env as ReferralEnv).MINI_APP_URL) } }]]
        : []),
    ],
  };
  await telegram.sendMessage(referredUserId, `<b>${copy.title}</b>\n\n${copy.body}`, { reply_markup: keyboard });
  return true;
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
  const message = (grant ? NOTIFY[locale].earned : NOTIFY[locale].cap).replace(/^[🎁✅]\s*/u, '');
  await sendUserNotification(
    env,
    telegram,
    row.referrer_user_id,
    locale,
    'notify_referrals',
    grant ? 'referral_earned' : 'referral_cap',
    REFERRAL_NOTIFY_TITLE[locale],
    message,
    '/app/?view=account',
    `referral:${row.id}:qualified`,
  );
}

async function ensureChannelInvite(
  referrerUserId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<string> {
  const existing = await env.DB.prepare(
    'SELECT invite_link FROM referral_invites WHERE referrer_user_id = ?',
  ).bind(referrerUserId).first<{ invite_link: string }>();
  if (existing?.invite_link) return existing.invite_link;

  const channel = referralChannel(env);
  if (!channel) throw new Error('Referral channel is not configured');
  const created = await telegram.createChatInviteLink(channel, `DTL ref ${referrerUserId}`);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO referral_invites (referrer_user_id, invite_link, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(referrer_user_id) DO UPDATE SET
      invite_link = excluded.invite_link,
      updated_at = excluded.updated_at
  `).bind(referrerUserId, created.invite_link, now, now).run();
  return created.invite_link;
}

function referralDeepLink(referrerUserId: number, env: Env): string {
  const configured = String((env as ReferralEnv).BOT_USERNAME ?? 'dollartlbot').trim().replace(/^@/, '');
  return `https://t.me/${configured}?start=ref_${referrerUserId.toString(36)}`;
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
