import { normalizeLocale, t, type Locale } from './i18n/index';
import {
  FREE_MONTHLY_REQUEST_LIMIT,
  REGULAR_MAX_CHAPTERS,
  SUBSCRIBER_MONTHLY_REQUEST_LIMIT,
} from './domain';
import {
  clearSession,
  currentMonthKey,
  errorText,
  getSubmission,
  getUser,
  isAdmin,
  isCompleteDraft,
  parseDraft,
  saveSession,
} from './db';
import { getQuotaState, insertSubmissionWithQuota } from './quota';
import { getSubscriptionState } from './subscription';
import { sendLimitReached, sendMainMenu, sendRules } from './ui';
import {
  escapeHtml,
  type InlineKeyboardMarkup,
  type TelegramCallbackQuery,
  type TelegramClient,
  type TelegramUser,
} from './telegram';

export async function beginSubmission(
  userId: number,
  locale: Locale,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  const subscription = await getSubscriptionState(userId, env, telegram);
  const baseLimit = subscription.subscriber
    ? SUBSCRIBER_MONTHLY_REQUEST_LIMIT
    : FREE_MONTHLY_REQUEST_LIMIT;
  const quota = await getQuotaState(env, userId, baseLimit);

  if (quota.remaining <= 0) {
    if (subscription.verificationError) {
      await telegram.sendMessage(userId, t(locale, 'verificationUnavailable'), {
        reply_markup: {
          inline_keyboard: [
            [{ text: t(locale, 'retryVerification'), callback_data: 'menu:submit' }],
            [{ text: t(locale, 'subscribe'), url: env.BOOSTY_SUBSCRIPTION_URL }],
          ],
        },
      });
      return;
    }
    await sendLimitReached(userId, locale, subscription.subscriber, env, telegram);
    return;
  }

  await saveSession(env, userId, 'rules', {});
  await sendRules(userId, locale, telegram, true);
}

export async function finalizeSubmission(
  user: TelegramUser,
  locale: Locale,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<void> {
  const session = await env.DB.prepare('SELECT step, data FROM sessions WHERE user_id = ?')
    .bind(user.id)
    .first<{ step: string; data: string }>();
  if (!session || session.step !== 'confirm') {
    await telegram.sendMessage(user.id, t(locale, 'noSession'));
    return;
  }

  const draft = parseDraft(session.data);
  if (!isCompleteDraft(draft)) {
    await clearSession(env, user.id);
    await telegram.sendMessage(user.id, t(locale, 'unknownAction'));
    await sendMainMenu(user.id, locale, telegram);
    return;
  }

  const subscription = await getSubscriptionState(user.id, env, telegram);
  const baseLimit = subscription.subscriber
    ? SUBSCRIBER_MONTHLY_REQUEST_LIMIT
    : FREE_MONTHLY_REQUEST_LIMIT;
  const quota = await getQuotaState(env, user.id, baseLimit);

  if (subscription.verificationError && draft.chapter_count > REGULAR_MAX_CHAPTERS) {
    await telegram.sendMessage(user.id, t(locale, 'verificationUnavailable'), {
      reply_markup: {
        inline_keyboard: [[{ text: t(locale, 'retryVerification'), callback_data: 'form:confirm' }]],
      },
    });
    return;
  }

  if (!subscription.subscriber && draft.chapter_count > REGULAR_MAX_CHAPTERS) {
    await telegram.sendMessage(user.id, t(locale, 'freeChapterLimit'), {
      reply_markup: {
        inline_keyboard: [[{ text: t(locale, 'subscribe'), url: env.BOOSTY_SUBSCRIPTION_URL }]],
      },
    });
    return;
  }

  if (quota.remaining <= 0) {
    if (subscription.verificationError) {
      await telegram.sendMessage(user.id, t(locale, 'verificationUnavailable'), {
        reply_markup: {
          inline_keyboard: [[{ text: t(locale, 'retryVerification'), callback_data: 'form:confirm' }]],
        },
      });
      return;
    }
    await sendLimitReached(user.id, locale, subscription.subscriber, env, telegram);
    return;
  }

  const plan: 'free' | 'subscriber' = subscription.subscriber ? 'subscriber' : 'free';
  const monthKey = currentMonthKey();
  const now = new Date().toISOString();

  const insert = await insertSubmissionWithQuota(env, {
    userId: user.id,
    username: user.username ?? null,
    locale,
    monthKey,
    title: draft.title,
    originalLanguage: draft.original_language,
    chapterCount: draft.chapter_count,
    publicationStatus: draft.publication_status,
    sourceUrl: draft.source_url || null,
    rawFileId: draft.raw_file_id,
    rawFileName: draft.raw_file_name || null,
    rawFileMime: draft.raw_file_mime || null,
    genresTags: draft.genres_tags,
    sexualContent: draft.sexual_content,
    sensitiveContent: draft.sensitive_content,
    notes: draft.notes || null,
    plan,
    adminSummarySent: 0,
    adminFileSent: 0,
    now,
  }, baseLimit);

  if (!insert) {
    await sendLimitReached(user.id, locale, subscription.subscriber, env, telegram);
    return;
  }

  const submissionId = insert.submissionId;
  await clearSession(env, user.id);
  await telegram.sendMessage(user.id, t(locale, 'submitted'));
  await sendMainMenu(user.id, locale, telegram);

  ctx.waitUntil(
    deliverSubmissionToAdmin(submissionId, env, telegram).catch((error) => {
      console.error(
        JSON.stringify({
          event: 'admin_notification_failed',
          submission_id: submissionId,
          error: errorText(error),
        }),
      );
    }),
  );
}

export async function deliverSubmissionToAdmin(
  submissionId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  const submission = await getSubmission(env, submissionId);
  if (!submission) return;

  if (!submission.admin_summary_sent) {
    const user = await getUser(env, submission.user_id);
    const username = user?.username ? `@${escapeHtml(user.username)}` : '—';
    const displayName = user?.first_name ? escapeHtml(user.first_name) : '—';
    const source = submission.source_url ? escapeHtml(submission.source_url) : '—';
    const notes = submission.notes ? escapeHtml(submission.notes) : '—';
    const baseLimit = submission.plan === 'subscriber'
      ? SUBSCRIBER_MONTHLY_REQUEST_LIMIT
      : FREE_MONTHLY_REQUEST_LIMIT;
    const quota = await getQuotaState(env, submission.user_id, baseLimit);
    const quotaLimit = quota.unlimited ? '∞' : String(quota.limit);
    const referralSuffix = !quota.unlimited && quota.referralBonus > 0
      ? ` (base ${baseLimit} + referral ${quota.referralBonus})`
      : '';

    const summary = [
      `📚 <b>NEW NOVEL REQUEST #${submission.id}</b>`,
      '',
      `<b>User:</b> ${displayName} ${username}`,
      `<b>Telegram ID:</b> <code>${submission.user_id}</code>`,
      `<b>Plan:</b> ${submission.plan === 'subscriber' ? '⭐ Boosty Subscriber' : 'Free'}`,
      `<b>Monthly usage:</b> ${quota.used} / ${quotaLimit}${referralSuffix}`,
      '',
      `<b>Title:</b> ${escapeHtml(submission.title)}`,
      `<b>Original language:</b> ${escapeHtml(submission.original_language)}`,
      `<b>Chapters:</b> ${submission.chapter_count}`,
      `<b>Status:</b> ${escapeHtml(submission.publication_status)}`,
      `<b>Source:</b> ${source}`,
      '',
      `<b>Genres / Tags:</b>\n${escapeHtml(submission.genres_tags)}`,
      '',
      `<b>Fetishes / Sexual content:</b>\n${escapeHtml(submission.sexual_content)}`,
      '',
      `<b>Sensitive content:</b>\n${escapeHtml(submission.sensitive_content)}`,
      '',
      `<b>Notes:</b>\n${notes}`,
    ].join('\n');

    const keyboard: InlineKeyboardMarkup = {
      inline_keyboard: [
        [
          { text: '✅ Accept', callback_data: `admin:accept:${submission.id}` },
          { text: '❌ Reject', callback_data: `admin:reject:${submission.id}` },
        ],
        [{ text: '♻️ Reject + Return Slot', callback_data: `admin:return:${submission.id}` }],
        [{ text: '💬 Message User', callback_data: `admin:message:${submission.id}` }],
      ],
    };

    await telegram.sendMessage(env.ADMIN_TELEGRAM_ID, summary, { reply_markup: keyboard });
    await env.DB.prepare(
      'UPDATE submissions SET admin_summary_sent = 1, updated_at = ? WHERE id = ?',
    )
      .bind(new Date().toISOString(), submission.id)
      .run();
  }

  if (!submission.admin_file_sent) {
    await telegram.sendDocument(
      env.ADMIN_TELEGRAM_ID,
      submission.raw_file_id,
      `📎 Raw file for request #${submission.id}${submission.raw_file_name ? ` — ${escapeHtml(submission.raw_file_name)}` : ''}`,
    );
    await env.DB.prepare(
      'UPDATE submissions SET admin_file_sent = 1, updated_at = ? WHERE id = ?',
    )
      .bind(new Date().toISOString(), submission.id)
      .run();
  }
}

export async function retryPendingAdminDeliveries(
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  const pending = await env.DB.prepare(`
    SELECT id
    FROM submissions
    WHERE admin_summary_sent = 0 OR admin_file_sent = 0
    ORDER BY id ASC
    LIMIT 20
  `).all<{ id: number }>();

  for (const row of pending.results) {
    try {
      await deliverSubmissionToAdmin(Number(row.id), env, telegram);
    } catch (error) {
      console.warn(
        JSON.stringify({
          event: 'admin_delivery_retry_failed',
          submission_id: row.id,
          error: errorText(error),
        }),
      );
    }
  }
}

export async function handleAdminCallback(
  query: TelegramCallbackQuery,
  data: string,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  if (!isAdmin(query.from.id, env)) return;

  const match = /^admin:(accept|reject|return|message):(\d+)$/.exec(data);
  if (!match) return;
  const action = match[1];
  const submissionId = Number(match[2]);
  const submission = await getSubmission(env, submissionId);
  if (!submission) {
    await telegram.sendMessage(query.from.id, 'Submission not found.');
    return;
  }

  if (action === 'message') {
    await env.DB.prepare(`
      INSERT INTO admin_sessions (admin_user_id, submission_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(admin_user_id) DO UPDATE SET submission_id = excluded.submission_id, updated_at = excluded.updated_at
    `)
      .bind(query.from.id, submissionId, new Date().toISOString())
      .run();
    await telegram.sendMessage(
      query.from.id,
      `Send the message you want delivered to request #${submissionId}. Use /cancel to abort.`,
    );
    return;
  }

  const now = new Date().toISOString();
  if (action === 'accept') {
    await env.DB.prepare("UPDATE submissions SET status = 'accepted', updated_at = ? WHERE id = ?")
      .bind(now, submissionId)
      .run();
    await telegram.sendMessage(
      submission.user_id,
      t(normalizeLocale(submission.language), 'statusAccepted'),
    );
  } else if (action === 'reject') {
    await env.DB.prepare("UPDATE submissions SET status = 'rejected', updated_at = ? WHERE id = ?")
      .bind(now, submissionId)
      .run();
    await telegram.sendMessage(
      submission.user_id,
      t(normalizeLocale(submission.language), 'statusRejected'),
    );
  } else {
    await env.DB.prepare(
      "UPDATE submissions SET status = 'rejected', slot_returned = 1, updated_at = ? WHERE id = ?",
    )
      .bind(now, submissionId)
      .run();
    await telegram.sendMessage(
      submission.user_id,
      t(normalizeLocale(submission.language), 'statusRejectedReturned'),
    );
  }

  if (query.message) {
    await telegram
      .editMessageReplyMarkup(query.message.chat.id, query.message.message_id)
      .catch(() => undefined);
  }
  await telegram.sendMessage(query.from.id, `Request #${submissionId}: ${action}.`);
}