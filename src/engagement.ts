import { currentMonthKey } from './db';
import { normalizeLocale, t } from './i18n/index';
import { getSubscriptionState } from './subscription';
import type { TelegramClient } from './telegram';

const PROMO_URL = 'https://boosty.to/domnekromanta/subscription-level/4041120/promo/183608?linkId=86c8c34bd6f4a5629aefdd41a21b62eb';
const PROMO_INTERVAL_DAYS = 60;
const FIRST_PROMO_DELAY_DAYS = 14;

export async function runDailyEngagement(
  env: Env,
  telegram: TelegramClient,
  now = new Date(),
): Promise<void> {
  // Run reset notices during the first three days so a deploy around month rollover cannot easily miss them.
  if (now.getUTCDate() <= 3) {
    await sendLimitResetNotices(env, telegram, now);
  }
  await sendOccasionalPromos(env, telegram, now);
}

export async function disablePromoReminders(
  userId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  await env.DB.prepare('UPDATE users SET promo_opt_out = 1, updated_at = ? WHERE telegram_id = ?')
    .bind(new Date().toISOString(), userId)
    .run();
  const row = await env.DB.prepare('SELECT language FROM users WHERE telegram_id = ?')
    .bind(userId)
    .first<{ language: string }>();
  await telegram.sendMessage(userId, t(normalizeLocale(row?.language), 'promoOptedOut'));
}

async function sendLimitResetNotices(env: Env, telegram: TelegramClient, now: Date): Promise<void> {
  const month = currentMonthKey(now);
  const previousDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previousMonth = currentMonthKey(previousDate);

  const candidates = await env.DB.prepare(`
    SELECT DISTINCT u.telegram_id, u.language
    FROM users u
    JOIN submissions s ON s.user_id = u.telegram_id
    WHERE s.month_key = ?
      AND u.language_selected = 1
      AND COALESCE(u.last_limit_reset_notified_month, '') <> ?
    ORDER BY u.telegram_id
    LIMIT 50
  `).bind(previousMonth, month).all<{ telegram_id: number; language: string }>();

  for (const user of candidates.results) {
    const locale = normalizeLocale(user.language);
    try {
      await telegram.sendMessage(user.telegram_id, t(locale, 'limitResetNotice'), {
        reply_markup: {
          inline_keyboard: [[{ text: t(locale, 'limit'), callback_data: 'menu:limit' }]],
        },
      });
      await env.DB.prepare(`
        UPDATE users SET last_limit_reset_notified_month = ?, updated_at = ? WHERE telegram_id = ?
      `).bind(month, now.toISOString(), user.telegram_id).run();
    } catch (error) {
      console.warn(JSON.stringify({ event: 'limit_reset_notice_failed', user_id: user.telegram_id, error: String(error) }));
    }
  }
}

async function sendOccasionalPromos(env: Env, telegram: TelegramClient, now: Date): Promise<void> {
  const promoCutoff = new Date(now.getTime() - PROMO_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const secondSubmissionCutoff = new Date(now.getTime() - FIRST_PROMO_DELAY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const candidates = await env.DB.prepare(`
    SELECT u.telegram_id, u.language
    FROM users u
    WHERE u.language_selected = 1
      AND u.promo_opt_out = 0
      AND (u.last_promo_at IS NULL OR u.last_promo_at <= ?)
      AND (SELECT COUNT(*) FROM submissions s WHERE s.user_id = u.telegram_id) >= 2
      AND COALESCE((
        SELECT s2.created_at FROM submissions s2
        WHERE s2.user_id = u.telegram_id
        ORDER BY s2.id ASC
        LIMIT 1 OFFSET 1
      ), '9999-12-31') <= ?
    ORDER BY COALESCE(u.last_promo_at, '') ASC, u.telegram_id ASC
    LIMIT 20
  `).bind(promoCutoff, secondSubmissionCutoff).all<{ telegram_id: number; language: string }>();

  for (const user of candidates.results) {
    const subscription = await getSubscriptionState(user.telegram_id, env, telegram);
    if (subscription.verificationError) continue;

    // Subscribers do not receive promotional reminders. Record the check so they are not re-verified every day.
    if (subscription.subscriber) {
      await markPromoChecked(env, user.telegram_id, now);
      continue;
    }

    const locale = normalizeLocale(user.language);
    try {
      await telegram.sendMessage(user.telegram_id, t(locale, 'promoText'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: t(locale, 'promoButton'), url: PROMO_URL }],
            [{ text: t(locale, 'promoOptOut'), callback_data: 'promo:optout' }],
          ],
        },
      });
    } catch (error) {
      console.warn(JSON.stringify({ event: 'promo_send_failed', user_id: user.telegram_id, error: String(error) }));
    } finally {
      // Marketing is intentionally non-critical: never retry aggressively after a send failure.
      await markPromoChecked(env, user.telegram_id, now);
    }
  }
}

function markPromoChecked(env: Env, userId: number, now: Date): Promise<D1Result> {
  return env.DB.prepare('UPDATE users SET last_promo_at = ?, updated_at = ? WHERE telegram_id = ?')
    .bind(now.toISOString(), now.toISOString(), userId)
    .run();
}
