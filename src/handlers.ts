import { SUPPORTED_LANGUAGES, normalizeLocale, t, type Locale } from './i18n/index';
import {
  MAX_LONG,
  MAX_SHORT,
  MAX_SOURCE,
  MAX_TITLE,
  type FormStep,
  type SubmissionDraft,
} from './domain';
import {
  clearAdminSession,
  clearSession,
  getSession,
  getSubmission,
  getUser,
  isAdmin,
  parseDraft,
  saveSession,
  upsertUser,
} from './db';
import { getSubscriptionState } from './subscription';
import { beginSubmission, finalizeSubmission, handleAdminCallback } from './submissions';
import {
  sendConfirmation,
  sendLanguagePicker,
  sendLimit,
  sendMainMenu,
  sendRules,
  sendStep,
} from './ui';
import {
  escapeHtml,
  type InlineKeyboardMarkup,
  type TelegramCallbackQuery,
  type TelegramClient,
  type TelegramMessage,
  type TelegramUpdate,
} from './telegram';

export async function handleUpdate(
  update: TelegramUpdate,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query, env, telegram, ctx);
    return;
  }

  if (update.message) {
    await handleMessage(update.message, env, telegram);
  }
}

async function handleMessage(
  message: TelegramMessage,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  const from = message.from;
  if (!from) return;

  const text = message.text?.trim();

  if (text === '/chatid' || text?.startsWith('/chatid@')) {
    await telegram.sendMessage(message.chat.id, `<code>${message.chat.id}</code>`);
    return;
  }

  if (text === '/id' || text?.startsWith('/id@')) {
    await telegram.sendMessage(message.chat.id, `<code>${from.id}</code>`);
    return;
  }

  if (message.chat.type !== 'private') return;

  await upsertUser(env, from);
  const user = await getUser(env, from.id);
  const locale = normalizeLocale(user?.language);

  if (isAdmin(from.id, env)) {
    const adminDraft = await env.DB.prepare(
      'SELECT submission_id FROM admin_sessions WHERE admin_user_id = ?',
    )
      .bind(from.id)
      .first<{ submission_id: number }>();

    if (adminDraft && text && !text.startsWith('/')) {
      const submission = await getSubmission(env, adminDraft.submission_id);
      if (!submission) {
        await clearAdminSession(env, from.id);
        await telegram.sendMessage(from.id, 'That submission no longer exists.');
        return;
      }

      await telegram.sendMessage(
        submission.user_id,
        `${t(normalizeLocale(submission.language), 'adminMessagePrefix')}${escapeHtml(text)}`,
      );
      await clearAdminSession(env, from.id);
      await telegram.sendMessage(from.id, `Message sent to request #${submission.id}.`);
      return;
    }
  }

  if (text === '/start' || text?.startsWith('/start ')) {
    await clearSession(env, from.id);
    if (!user?.language_selected) {
      await sendLanguagePicker(from.id, 'en', telegram);
    } else {
      await sendMainMenu(from.id, locale, telegram);
    }
    return;
  }

  if (text === '/language') {
    await sendLanguagePicker(from.id, locale, telegram);
    return;
  }

  if (!user?.language_selected) {
    await sendLanguagePicker(from.id, 'en', telegram);
    return;
  }

  if (text === '/rules') {
    await sendRules(from.id, locale, telegram, false);
    return;
  }

  if (text === '/limit') {
    await sendLimit(from.id, locale, env, telegram);
    return;
  }

  if (text === '/cancel') {
    if (isAdmin(from.id, env)) await clearAdminSession(env, from.id);
    await clearSession(env, from.id);
    await telegram.sendMessage(from.id, t(locale, 'cancelled'));
    await sendMainMenu(from.id, locale, telegram);
    return;
  }

  const session = await getSession(env, from.id);
  if (!session) {
    await sendMainMenu(from.id, locale, telegram);
    return;
  }

  await handleFormMessage(message, session.step, parseDraft(session.data), locale, env, telegram);
}

async function handleFormMessage(
  message: TelegramMessage,
  step: FormStep,
  draft: SubmissionDraft,
  locale: Locale,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  const userId = message.from!.id;
  const text = message.text?.trim();

  if (step === 'raw_file') {
    if (!message.document) {
      await telegram.sendMessage(userId, t(locale, 'invalidRawFile'));
      return;
    }

    draft.raw_file_id = message.document.file_id;
    draft.raw_file_name = message.document.file_name;
    draft.raw_file_mime = message.document.mime_type;
    await saveSession(env, userId, 'genres_tags', draft);
    await sendStep(userId, 'genres_tags', locale, telegram);
    return;
  }

  if (!text) {
    await sendStep(userId, step, locale, telegram);
    return;
  }

  switch (step) {
    case 'title':
      if (!(await validateLength(userId, text, MAX_TITLE, telegram))) return;
      draft.title = text;
      await saveSession(env, userId, 'original_language', draft);
      await sendStep(userId, 'original_language', locale, telegram);
      return;

    case 'original_language':
      if (!(await validateLength(userId, text, MAX_SHORT, telegram))) return;
      draft.original_language = text;
      await saveSession(env, userId, 'chapter_count', draft);
      await sendStep(userId, 'chapter_count', locale, telegram);
      return;

    case 'chapter_count': {
      if (!/^\d+$/.test(text)) {
        await telegram.sendMessage(userId, t(locale, 'invalidChapterCount'));
        return;
      }
      const chapterCount = Number(text);
      if (!Number.isSafeInteger(chapterCount) || chapterCount < 1 || chapterCount > 10_000_000) {
        await telegram.sendMessage(userId, t(locale, 'invalidChapterCount'));
        return;
      }

      const subscription = await getSubscriptionState(userId, env, telegram);
      if (!subscription.subscriber && chapterCount > 200) {
        const keyboard: InlineKeyboardMarkup = {
          inline_keyboard: [
            [{ text: t(locale, 'subscribe'), url: env.BOOSTY_SUBSCRIPTION_URL }],
            [{ text: t(locale, 'retryVerification'), callback_data: 'form:retry_chapters' }],
            [{ text: t(locale, 'cancel'), callback_data: 'form:cancel' }],
          ],
        };
        await telegram.sendMessage(
          userId,
          `${t(locale, 'freeChapterLimit')}${subscription.verificationError ? `\n\n${t(locale, 'verificationUnavailable')}` : ''}`,
          { reply_markup: keyboard },
        );
        return;
      }

      draft.chapter_count = chapterCount;
      await saveSession(env, userId, 'publication_status', draft);
      await sendStep(userId, 'publication_status', locale, telegram);
      return;
    }

    case 'source_url':
      if (!(await validateLength(userId, text, MAX_SOURCE, telegram))) return;
      draft.source_url = text;
      await saveSession(env, userId, 'raw_file', draft);
      await sendStep(userId, 'raw_file', locale, telegram);
      return;

    case 'genres_tags':
      if (!(await validateLength(userId, text, MAX_LONG, telegram))) return;
      draft.genres_tags = text;
      await saveSession(env, userId, 'sexual_content', draft);
      await sendStep(userId, 'sexual_content', locale, telegram);
      return;

    case 'sexual_content':
      if (!(await validateLength(userId, text, MAX_LONG, telegram))) return;
      draft.sexual_content = text;
      await saveSession(env, userId, 'sensitive_content', draft);
      await sendStep(userId, 'sensitive_content', locale, telegram);
      return;

    case 'sensitive_content':
      if (!(await validateLength(userId, text, MAX_LONG, telegram))) return;
      draft.sensitive_content = text;
      await saveSession(env, userId, 'notes', draft);
      await sendStep(userId, 'notes', locale, telegram);
      return;

    case 'notes':
      if (!(await validateLength(userId, text, MAX_LONG, telegram))) return;
      draft.notes = text;
      await saveSession(env, userId, 'confirm', draft);
      await sendConfirmation(userId, locale, draft, telegram);
      return;

    case 'rules':
    case 'publication_status':
    case 'confirm':
      await sendStep(userId, step, locale, telegram);
      return;
  }
}

async function handleCallback(
  query: TelegramCallbackQuery,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<void> {
  const data = query.data;
  const chat = query.message?.chat;
  if (!data || !chat) return;

  await telegram.answerCallbackQuery(query.id).catch(() => undefined);
  if (chat.type !== 'private') return;

  await upsertUser(env, query.from);
  const user = await getUser(env, query.from.id);
  let locale = normalizeLocale(user?.language);

  if (data.startsWith('lang:')) {
    const requested = data.slice(5);
    const nextLocale = normalizeLocale(requested);
    if (!SUPPORTED_LANGUAGES.some((language) => language.code === requested)) return;

    await env.DB.prepare(
      'UPDATE users SET language = ?, language_selected = 1, updated_at = ? WHERE telegram_id = ?',
    )
      .bind(nextLocale, new Date().toISOString(), query.from.id)
      .run();
    locale = nextLocale;
    await telegram.sendMessage(query.from.id, t(locale, 'languageSaved'));

    const session = await getSession(env, query.from.id);
    if (session) {
      if (session.step === 'confirm') {
        await sendConfirmation(query.from.id, locale, parseDraft(session.data), telegram);
      } else {
        await sendStep(query.from.id, session.step, locale, telegram);
      }
    } else {
      await sendMainMenu(query.from.id, locale, telegram);
    }
    return;
  }

  if (data.startsWith('admin:')) {
    await handleAdminCallback(query, data, env, telegram);
    return;
  }

  switch (data) {
    case 'menu:home':
      await sendMainMenu(query.from.id, locale, telegram);
      return;
    case 'menu:language':
      await sendLanguagePicker(query.from.id, locale, telegram);
      return;
    case 'menu:rules':
      await sendRules(query.from.id, locale, telegram, false);
      return;
    case 'menu:limit':
      await sendLimit(query.from.id, locale, env, telegram);
      return;
    case 'menu:submit':
      await beginSubmission(query.from.id, locale, env, telegram);
      return;
    case 'form:agree': {
      const session = await getSession(env, query.from.id);
      if (!session || session.step !== 'rules') {
        await telegram.sendMessage(query.from.id, t(locale, 'unknownAction'));
        return;
      }
      await saveSession(env, query.from.id, 'title', {});
      await sendStep(query.from.id, 'title', locale, telegram);
      return;
    }
    case 'form:cancel':
      await clearSession(env, query.from.id);
      await telegram.sendMessage(query.from.id, t(locale, 'cancelled'));
      await sendMainMenu(query.from.id, locale, telegram);
      return;
    case 'form:restart':
      await saveSession(env, query.from.id, 'rules', {});
      await sendRules(query.from.id, locale, telegram, true);
      return;
    case 'form:status:ongoing':
    case 'form:status:completed': {
      const session = await getSession(env, query.from.id);
      if (!session || session.step !== 'publication_status') {
        await telegram.sendMessage(query.from.id, t(locale, 'unknownAction'));
        return;
      }
      const draft = parseDraft(session.data);
      draft.publication_status = data.endsWith('completed') ? 'completed' : 'ongoing';
      await saveSession(env, query.from.id, 'source_url', draft);
      await sendStep(query.from.id, 'source_url', locale, telegram);
      return;
    }
    case 'form:skip_source': {
      const session = await getSession(env, query.from.id);
      if (!session || session.step !== 'source_url') {
        await telegram.sendMessage(query.from.id, t(locale, 'unknownAction'));
        return;
      }
      const draft = parseDraft(session.data);
      draft.source_url = '';
      await saveSession(env, query.from.id, 'raw_file', draft);
      await sendStep(query.from.id, 'raw_file', locale, telegram);
      return;
    }
    case 'form:none_sexual': {
      const session = await getSession(env, query.from.id);
      if (!session || session.step !== 'sexual_content') {
        await telegram.sendMessage(query.from.id, t(locale, 'unknownAction'));
        return;
      }
      const draft = parseDraft(session.data);
      draft.sexual_content = 'None';
      await saveSession(env, query.from.id, 'sensitive_content', draft);
      await sendStep(query.from.id, 'sensitive_content', locale, telegram);
      return;
    }
    case 'form:none_sensitive': {
      const session = await getSession(env, query.from.id);
      if (!session || session.step !== 'sensitive_content') {
        await telegram.sendMessage(query.from.id, t(locale, 'unknownAction'));
        return;
      }
      const draft = parseDraft(session.data);
      draft.sensitive_content = 'None';
      await saveSession(env, query.from.id, 'notes', draft);
      await sendStep(query.from.id, 'notes', locale, telegram);
      return;
    }
    case 'form:skip_notes': {
      const session = await getSession(env, query.from.id);
      if (!session || session.step !== 'notes') {
        await telegram.sendMessage(query.from.id, t(locale, 'unknownAction'));
        return;
      }
      const draft = parseDraft(session.data);
      draft.notes = '';
      await saveSession(env, query.from.id, 'confirm', draft);
      await sendConfirmation(query.from.id, locale, draft, telegram);
      return;
    }
    case 'form:retry_chapters': {
      const session = await getSession(env, query.from.id);
      if (!session || session.step !== 'chapter_count') {
        await telegram.sendMessage(query.from.id, t(locale, 'unknownAction'));
        return;
      }
      await sendStep(query.from.id, 'chapter_count', locale, telegram);
      return;
    }
    case 'form:confirm':
      await finalizeSubmission(query.from, locale, env, telegram, ctx);
      return;
    default:
      await telegram.sendMessage(query.from.id, t(locale, 'unknownAction'));
  }
}

async function validateLength(
  chatId: number,
  value: string,
  maxLength: number,
  telegram: TelegramClient,
): Promise<boolean> {
  if (value.length <= maxLength) return true;
  await telegram.sendMessage(
    chatId,
    `Please keep this answer under <b>${maxLength}</b> characters. Current length: ${value.length}.`,
  );
  return false;
}
