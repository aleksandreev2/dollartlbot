import { t, type Locale } from './i18n/index';
import { escapeHtml, type InlineKeyboardMarkup, type TelegramClient } from './telegram';

const PAGE_SIZE = 7;

type QueueListRow = {
  id: number;
  title: string;
  original_language: string;
  chapter_count: number;
  queue_status: 'queued' | 'in_progress' | 'completed' | null;
  queue_position: number | null;
};

type MyRequestRow = QueueListRow & {
  status: string;
  slot_returned: number;
};

export async function showPublicQueue(
  chatId: number,
  locale: Locale,
  env: Env,
  telegram: TelegramClient,
  page = 0,
  messageId?: number,
): Promise<void> {
  const countRow = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM submissions
    WHERE status = 'accepted' AND queue_status IN ('queued', 'in_progress')
  `).first<{ count: number }>();
  const total = Number(countRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));

  const rows = await env.DB.prepare(`
    SELECT id, title, original_language, chapter_count, queue_status, queue_position
    FROM submissions
    WHERE status = 'accepted' AND queue_status IN ('queued', 'in_progress')
    ORDER BY CASE WHEN queue_status = 'in_progress' THEN 0 ELSE 1 END,
             COALESCE(queue_position, 2147483647) ASC, id ASC
    LIMIT ? OFFSET ?
  `)
    .bind(PAGE_SIZE, safePage * PAGE_SIZE)
    .all<QueueListRow>();

  const lines = [t(locale, 'queueTitle'), ''];
  if (!rows.results.length) {
    lines.push(t(locale, 'queueEmpty'));
  } else {
    rows.results.forEach((row, index) => {
      const number = safePage * PAGE_SIZE + index + 1;
      const status = row.queue_status === 'in_progress' ? `▶️ ${t(locale, 'statusInProgress')}` : `⏳ ${t(locale, 'statusQueued')}`;
      lines.push(
        `<b>${number}.</b> ${escapeHtml(row.title)}`,
        `   ${status} · ${escapeHtml(row.original_language)} · ${row.chapter_count}`,
      );
    });
  }

  if (totalPages > 1) {
    lines.push('', `${t(locale, 'pageLabel')} ${safePage + 1}/${totalPages}`);
  }

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      paginationRow('queue:page', safePage, totalPages),
      [{ text: '←', callback_data: 'menu:home' }],
    ].filter((row) => row.length > 0),
  };

  await editOrSend(chatId, messageId, lines.join('\n'), keyboard, telegram);
}

export async function showMyRequests(
  userId: number,
  locale: Locale,
  env: Env,
  telegram: TelegramClient,
  page = 0,
  messageId?: number,
): Promise<void> {
  const countRow = await env.DB.prepare('SELECT COUNT(*) AS count FROM submissions WHERE user_id = ?')
    .bind(userId)
    .first<{ count: number }>();
  const total = Number(countRow?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));

  const rows = await env.DB.prepare(`
    SELECT id, title, original_language, chapter_count, status, slot_returned,
           queue_status, queue_position
    FROM submissions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `)
    .bind(userId, PAGE_SIZE, safePage * PAGE_SIZE)
    .all<MyRequestRow>();

  const lines = [t(locale, 'myRequestsTitle'), ''];
  if (!rows.results.length) {
    lines.push(t(locale, 'myRequestsEmpty'));
  } else {
    for (const row of rows.results) {
      const state = requestState(locale, row);
      lines.push(`<b>#${row.id} · ${escapeHtml(row.title)}</b>`, `   ${state}`);
      if (row.status === 'accepted' && row.queue_status === 'queued' && row.queue_position) {
        lines.push(`   ${t(locale, 'positionLabel')}: ${row.queue_position}`);
      }
    }
  }

  if (totalPages > 1) {
    lines.push('', `${t(locale, 'pageLabel')} ${safePage + 1}/${totalPages}`);
  }

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      paginationRow('myreq:page', safePage, totalPages),
      [{ text: '←', callback_data: 'menu:home' }],
    ].filter((row) => row.length > 0),
  };
  await editOrSend(userId, messageId, lines.join('\n'), keyboard, telegram);
}

function requestState(locale: Locale, row: MyRequestRow): string {
  if (row.status === 'pending') return `🕓 ${t(locale, 'statusPending')}`;
  if (row.status === 'rejected') {
    return row.slot_returned ? `↩️ ${t(locale, 'statusRejectedReturned')}` : `❌ ${t(locale, 'statusRejected')}`;
  }
  if (row.queue_status === 'completed') return `✅ ${t(locale, 'statusCompleted')}`;
  if (row.queue_status === 'in_progress') return `▶️ ${t(locale, 'statusInProgress')}`;
  return `⏳ ${t(locale, 'statusQueued')}`;
}

function paginationRow(prefix: string, page: number, totalPages: number): InlineKeyboardMarkup['inline_keyboard'][number] {
  if (totalPages <= 1) return [];
  const row: InlineKeyboardMarkup['inline_keyboard'][number] = [];
  if (page > 0) row.push({ text: '◀️', callback_data: `${prefix}:${page - 1}` });
  row.push({ text: `${page + 1}/${totalPages}`, callback_data: `${prefix}:${page}` });
  if (page + 1 < totalPages) row.push({ text: '▶️', callback_data: `${prefix}:${page + 1}` });
  return row;
}

async function editOrSend(
  chatId: number,
  messageId: number | undefined,
  text: string,
  replyMarkup: InlineKeyboardMarkup,
  telegram: TelegramClient,
): Promise<void> {
  if (messageId) {
    try {
      await telegram.editMessageText(chatId, messageId, text, { reply_markup: replyMarkup });
      return;
    } catch {
      // The originating message may be too old or already have identical content.
    }
  }
  await telegram.sendMessage(chatId, text, { reply_markup: replyMarkup });
}
