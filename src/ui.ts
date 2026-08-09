import { SUPPORTED_LANGUAGES, t, type Locale } from './i18n/index';
import { monthlySubmissionCount } from './db';
import { getSubscriptionState } from './subscription';
import { escapeHtml, type InlineKeyboardMarkup, type TelegramClient } from './telegram';
import type { FormStep, SubmissionDraft } from './domain';

const LOCALE_TAGS: Record<Locale, string> = {
  en: 'en-US', es: 'es-ES', fil: 'fil-PH', hi: 'hi-IN', pt: 'pt-BR',
  id: 'id-ID', vi: 'vi-VN', fr: 'fr-FR', de: 'de-DE', ru: 'ru-RU',
};

export async function sendLanguagePicker(
  chatId: number,
  locale: Locale,
  telegram: TelegramClient,
): Promise<void> {
  const rows = [] as InlineKeyboardMarkup['inline_keyboard'];
  for (let i = 0; i < SUPPORTED_LANGUAGES.length; i += 2) {
    rows.push(
      SUPPORTED_LANGUAGES.slice(i, i + 2).map((language) => ({
        text: language.label,
        callback_data: `lang:${language.code}`,
      })),
    );
  }
  await telegram.sendMessage(chatId, t(locale, 'chooseLanguage'), {
    reply_markup: { inline_keyboard: rows },
  });
}

export async function sendMainMenu(
  chatId: number,
  locale: Locale,
  telegram: TelegramClient,
): Promise<void> {
  await telegram.sendMessage(chatId, t(locale, 'menuTitle'), {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(locale, 'submit'), callback_data: 'menu:submit' }],
        [
          { text: t(locale, 'rules'), callback_data: 'menu:rules' },
          { text: t(locale, 'limit'), callback_data: 'menu:limit' },
        ],
        [{ text: t(locale, 'language'), callback_data: 'menu:language' }],
      ],
    },
  });
}

export async function sendRules(
  chatId: number,
  locale: Locale,
  telegram: TelegramClient,
  asGate: boolean,
): Promise<void> {
  const keyboard: InlineKeyboardMarkup = asGate
    ? {
        inline_keyboard: [
          [{ text: t(locale, 'acceptRules'), callback_data: 'form:agree' }],
          [{ text: t(locale, 'cancel'), callback_data: 'form:cancel' }],
        ],
      }
    : {
        inline_keyboard: [
          [{ text: t(locale, 'submit'), callback_data: 'menu:submit' }],
          [{ text: '← Menu', callback_data: 'menu:home' }],
        ],
      };

  await telegram.sendMessage(
    chatId,
    `${t(locale, 'rulesText')}${asGate ? `\n\n${t(locale, 'rulesGate')}` : ''}`,
    { reply_markup: keyboard },
  );
}

export async function sendStep(
  chatId: number,
  step: FormStep,
  locale: Locale,
  telegram: TelegramClient,
): Promise<void> {
  switch (step) {
    case 'rules':
      await sendRules(chatId, locale, telegram, true);
      return;
    case 'title':
      await telegram.sendMessage(chatId, t(locale, 'askTitle'));
      return;
    case 'original_language':
      await telegram.sendMessage(chatId, t(locale, 'askOriginalLanguage'));
      return;
    case 'chapter_count':
      await telegram.sendMessage(chatId, t(locale, 'askChapterCount'));
      return;
    case 'publication_status':
      await telegram.sendMessage(chatId, t(locale, 'askStatus'), {
        reply_markup: {
          inline_keyboard: [
            [
              { text: t(locale, 'ongoing'), callback_data: 'form:status:ongoing' },
              { text: t(locale, 'completed'), callback_data: 'form:status:completed' },
            ],
            [{ text: t(locale, 'cancel'), callback_data: 'form:cancel' }],
          ],
        },
      });
      return;
    case 'source_url':
      await telegram.sendMessage(chatId, t(locale, 'askSource'), {
        reply_markup: {
          inline_keyboard: [[{ text: t(locale, 'skip'), callback_data: 'form:skip_source' }]],
        },
      });
      return;
    case 'raw_file':
      await telegram.sendMessage(chatId, t(locale, 'askRawFile'));
      return;
    case 'genres_tags':
      await telegram.sendMessage(chatId, t(locale, 'askTags'));
      return;
    case 'sexual_content':
      await telegram.sendMessage(chatId, t(locale, 'askSexual'), {
        reply_markup: {
          inline_keyboard: [[{ text: t(locale, 'none'), callback_data: 'form:none_sexual' }]],
        },
      });
      return;
    case 'sensitive_content':
      await telegram.sendMessage(chatId, t(locale, 'askSensitive'), {
        reply_markup: {
          inline_keyboard: [[{ text: t(locale, 'none'), callback_data: 'form:none_sensitive' }]],
        },
      });
      return;
    case 'notes':
      await telegram.sendMessage(chatId, t(locale, 'askNotes'), {
        reply_markup: {
          inline_keyboard: [[{ text: t(locale, 'skip'), callback_data: 'form:skip_notes' }]],
        },
      });
      return;
    case 'confirm':
      return;
  }
}

export async function sendConfirmation(
  chatId: number,
  locale: Locale,
  draft: SubmissionDraft,
  telegram: TelegramClient,
): Promise<void> {
  const status = draft.publication_status === 'completed' ? t(locale, 'completed') : t(locale, 'ongoing');
  const source = draft.source_url ? escapeHtml(draft.source_url) : '—';
  const notes = draft.notes ? escapeHtml(draft.notes) : '—';

  const text = [
    t(locale, 'confirmHeader'),
    '',
    `<b>${t(locale, 'titleLabel')}:</b> ${escapeHtml(draft.title)}`,
    `<b>${t(locale, 'originalLanguageLabel')}:</b> ${escapeHtml(draft.original_language)}`,
    `<b>${t(locale, 'chaptersLabel')}:</b> ${draft.chapter_count ?? '—'}`,
    `<b>${t(locale, 'publicationStatusLabel')}:</b> ${status}`,
    `<b>${t(locale, 'sourceLabel')}:</b> ${source}`,
    '',
    `<b>${t(locale, 'tagsLabel')}:</b>\n${escapeHtml(draft.genres_tags)}`,
    '',
    `<b>${t(locale, 'sexualLabel')}:</b>\n${escapeHtml(draft.sexual_content)}`,
    '',
    `<b>${t(locale, 'sensitiveLabel')}:</b>\n${escapeHtml(draft.sensitive_content)}`,
    '',
    `<b>${t(locale, 'notesLabel')}:</b>\n${notes}`,
    '',
    t(locale, 'confirmFooter'),
  ].join('\n');

  await telegram.sendMessage(chatId, text, {
    reply_markup: {
      inline_keyboard: [
        [{ text: t(locale, 'confirmSubmit'), callback_data: 'form:confirm' }],
        [
          { text: t(locale, 'restart'), callback_data: 'form:restart' },
          { text: t(locale, 'cancel'), callback_data: 'form:cancel' },
        ],
      ],
    },
  });
}

export async function sendLimit(
  userId: number,
  locale: Locale,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  const count = await monthlySubmissionCount(env, userId);
  const subscription = await getSubscriptionState(userId, env, telegram);
  const limit = subscription.subscriber ? 5 : 1;
  const remaining = Math.max(0, limit - count);
  const resetDate = nextMonthDate(locale);

  const text = [
    t(locale, 'limitTitle'),
    '',
    `<b>${t(locale, 'planLabel')}:</b> ${t(locale, subscription.subscriber ? 'planSubscriber' : 'planFree')}`,
    `<b>${t(locale, 'usedLabel')}:</b> ${count} / ${limit}`,
    `<b>${t(locale, 'remainingLabel')}:</b> ${remaining}`,
    `<b>${t(locale, 'resetLabel')}:</b> ${escapeHtml(resetDate)}`,
    subscription.verificationError ? `\n${t(locale, 'verificationUnavailable')}` : '',
  ].join('\n');

  const rows: InlineKeyboardMarkup['inline_keyboard'] = [];
  if (!subscription.subscriber) {
    rows.push([{ text: t(locale, 'subscribe'), url: env.BOOSTY_SUBSCRIPTION_URL }]);
  }
  rows.push([{ text: '← Menu', callback_data: 'menu:home' }]);

  await telegram.sendMessage(userId, text, { reply_markup: { inline_keyboard: rows } });
}

export async function sendLimitReached(
  userId: number,
  locale: Locale,
  subscriber: boolean,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  const rows: InlineKeyboardMarkup['inline_keyboard'] = [];
  if (!subscriber) {
    rows.push([{ text: t(locale, 'subscribe'), url: env.BOOSTY_SUBSCRIPTION_URL }]);
  }
  rows.push([{ text: t(locale, 'limit'), callback_data: 'menu:limit' }]);

  await telegram.sendMessage(
    userId,
    t(locale, subscriber ? 'limitReachedSubscriber' : 'limitReachedFree'),
    { reply_markup: { inline_keyboard: rows } },
  );
}

function nextMonthDate(locale: Locale): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(next);
}
