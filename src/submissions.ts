import { normalizeLocale, t, type Locale } from './i18n/index';
import {
  clearSession,
  currentMonthKey,
  errorText,
  getSubmission,
  getUser,
  isAdmin,
  isCompleteDraft,
  monthlySubmissionCount,
  parseDraft,
  saveSession,
} from './db';
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
  const count = await monthlySubmissionCount(env, userId);
  const subscription = await getSubscriptionState(userId, env, telegram);

  if (subscription.verificationError && count >= 1) {
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

  const limit = subscription.subscriber ? 5 : 1;
  if (count >= limit) {
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

  const count = await monthlySubmissionCount(env, user.id);
  const subscription = await getSubscriptionState(user.id, env, telegram);

  if (subscription.verificationError && (count >= 1 || draft.chapter_count > 200)) {
    await telegram.sendMessage(user.id, t(locale, 'verificationUnavailable'), {
      reply_markup: {
        inline_keyboard: [[{ text: t(locale, 'retryVerification'), callback_data: 'form:confirm' }]],
      },
    });
    return;
  }

  if (!subscription.subscriber && draft.chapter_count > 200) {
    await telegram.sendMessage(user.id, t(locale, 'freeChapterLimit'), {
      reply_markup: {
        inline_keyboard: [[{ text: t(locale, 'subscribe'), url: env.BOOSTY_SUBSCRIPTION_URL }]],
      },
    });
    return;
  }

  const plan: 'free' | 'subscriber' = subscription.subscriber ? 'subscriber' : 'free';
  const limit = plan === 'subscriber' ? 5 : 1;
  const monthKey = currentMonthKey();
  const now = new Date().toISOString();

  const insert = await env.DB.prepare(`
    INSERT INTO submissions (
      user_id, username_snapshot, language, month_key, title, original_language,
      chapter_count, publication_status, source_url, raw_file_id, raw_file_name,
      raw_file_mime, genres_tags, sexual_content, sensitive_content, notes,
      plan, status, slot_returned, created_at, updated_at
    )
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?
    WHERE (
      SELECT COUNT(*) FROM submissions
      WHERE user_id = ? AND month_key = ? AND slot_returned = 0
    ) < ?
  `)
    .bind(
      user.id,
      user.username ?? null,
      locale,
      monthKey,
      draft.title,
      draft.original_language,
      draft.chapter_count,
      draft.publication_status,
      draft.source_url || null,
      draft.raw_file_id,
      draft.raw_file_name || null,
      draft.raw_file_mime || null,
      draft.genres_tags,
      draft.sexual_content,
      draft.sensitive_content,
      draft.notes || null,
      plan,
      now,
      now,
      user.id,
      monthKey,
      limit,
    )
    .run();

  if ((insert.meta.changes ?? 0) === 0) {
    await sendLimitReached(user.id, locale, subscription.subscriber, env, telegram);
    return;
  }

  const submissionId = Number(insert.meta.last_row_id);
  await clearSession(env, user.id);
  await telegram.sendMessage(user.id, t(locale, 'submitted'));
  await sendMainMenu(user.id, locale, telegram);

  ctx.waitUntil(
    notifyAdmin(submissionId, env, telegram).catch((error) => {
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

async function notifyAdmin(
  submissionId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  const submission = await getSubmission(env, submissionId);
  if (!submission) return;

  const user = await getUser(env, submission.user_id);
  const username = user?.username ? `@${escapeHtml(user.username)}` : '—';
  const displayName = user?.first_name ? escapeHtml(user.first_name) : '—';
  const source = submission.source_url ? escapeHtml(submission.source_url) : '—';
  const notes = submission.notes ? escapeHtml(submission.notes) : '—';

  const summary = [
    `📚 <b>NEW NOVEL REQUEST #${submission.id}</b>`,
    '',
    `<b>User:</b> ${displayName} ${username}`,
    `<b>Telegram ID:</b> <code>${submission.user_id}</code>`,
    `<b>Plan:</b> ${submission.plan === 'subscriber' ? '⭐ Boosty Subscriber' : 'Free'}`,
    `<b>Monthly usage:</b> ${await monthlySubmissionCount(env, submission.user_id)} / ${submission.plan === 'subscriber' ? 5 : 1}`,
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
  await telegram.sendDocument(
    env.ADMIN_TELEGRAM_ID,
    submission.raw_file_id,
    `📎 Raw file for request #${submission.id}${submission.raw_file_name ? ` — ${escapeHtml(submission.raw_file_name)}` : ''}`,
  );
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
