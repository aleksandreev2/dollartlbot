import { AdminStateError, applyAdminSubmissionAction, type AdminSubmissionAction } from './admin-state';
import { clearAdminSession, getSubmission, getUser, isAdmin } from './db';
import { escapeHtml, type InlineKeyboardMarkup, type TelegramCallbackQuery, type TelegramClient } from './telegram';

const ADMIN_PAGE_SIZE = 6;
type ListKind = 'pending' | 'queue' | 'all';

type AdminListRow = {
  id: number;
  title: string;
  status: string;
  queue_status: string | null;
  queue_position: number | null;
  plan: string;
};

const CONFIRM_ACTIONS = new Set<AdminSubmissionAction>(['reject', 'return', 'complete', 'backqueue', 'reopen']);

export async function showAdminHome(
  adminId: number,
  env: Env,
  telegram: TelegramClient,
  messageId?: number,
): Promise<void> {
  if (!isAdmin(adminId, env)) return;
  const counts = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN status='accepted' AND queue_status='queued' THEN 1 ELSE 0 END) queued,
      SUM(CASE WHEN status='accepted' AND queue_status='in_progress' THEN 1 ELSE 0 END) in_progress,
      SUM(CASE WHEN status='accepted' AND queue_status='completed' THEN 1 ELSE 0 END) completed,
      COUNT(*) total
    FROM submissions
  `).first<{ pending: number; queued: number; in_progress: number; completed: number; total: number }>();

  const text = [
    '<b>⚙️ Dollar TL — Админ</b>',
    '',
    `📨 На проверке: <b>${Number(counts?.pending ?? 0)}</b>`,
    `📚 В очереди: <b>${Number(counts?.queued ?? 0)}</b>`,
    `▶️ В работе: <b>${Number(counts?.in_progress ?? 0)}</b>`,
    `✅ Завершено: <b>${Number(counts?.completed ?? 0)}</b>`,
    `🗂 Всего заявок: <b>${Number(counts?.total ?? 0)}</b>`,
  ].join('\n');
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: '📨 Новые заявки', callback_data: 'admin:list:pending:0' },
        { text: '📚 Очередь', callback_data: 'admin:list:queue:0' },
      ],
      [{ text: '🗂 Все заявки', callback_data: 'admin:list:all:0' }],
      [{ text: '📖 Инструкция', callback_data: 'admin:guide' }],
    ],
  };
  await editOrSend(adminId, messageId, text, keyboard, telegram);
}

export async function handleAdminCallback(
  query: TelegramCallbackQuery,
  data: string,
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  if (!isAdmin(query.from.id, env)) return;
  const messageId = query.message?.message_id;

  if (data === 'admin:home') {
    await showAdminHome(query.from.id, env, telegram, messageId);
    return;
  }
  if (data === 'admin:guide') {
    await showAdminGuide(query.from.id, telegram, messageId);
    return;
  }

  const list = /^admin:list:(pending|queue|all):(\d+)$/.exec(data);
  if (list) {
    await showAdminList(query.from.id, list[1] as ListKind, Number(list[2]), env, telegram, messageId);
    return;
  }

  const detail = /^admin:d:(\d+):(pending|queue|all):(\d+)$/.exec(data);
  if (detail) {
    await showAdminDetail(
      query.from.id,
      Number(detail[1]),
      env,
      telegram,
      messageId,
      detail[2] as ListKind,
      Number(detail[3]),
    );
    return;
  }

  const legacy = /^admin:(accept|reject|return|message):(\d+)$/.exec(data);
  if (legacy) {
    await runAction(query, legacy[1], Number(legacy[2]), env, telegram, 'pending', 0, false);
    return;
  }

  const action = /^admin:a:(accept|reject|return|message|raw|start|complete|backqueue|reopen|up|down):(\d+):(pending|queue|all):(\d+)$/.exec(data);
  if (action) {
    await runAction(
      query,
      action[1],
      Number(action[2]),
      env,
      telegram,
      action[3] as ListKind,
      Number(action[4]),
      false,
    );
    return;
  }

  const confirmed = /^admin:c:(reject|return|complete|backqueue|reopen):(\d+):(pending|queue|all):(\d+)$/.exec(data);
  if (confirmed) {
    await runAction(
      query,
      confirmed[1],
      Number(confirmed[2]),
      env,
      telegram,
      confirmed[3] as ListKind,
      Number(confirmed[4]),
      true,
    );
  }
}

async function showAdminList(
  adminId: number,
  kind: ListKind,
  page: number,
  env: Env,
  telegram: TelegramClient,
  messageId?: number,
): Promise<void> {
  const where = kind === 'pending'
    ? "status='pending'"
    : kind === 'queue'
      ? "status='accepted' AND queue_status IN ('queued','in_progress')"
      : '1=1';
  const order = kind === 'queue'
    ? "CASE WHEN queue_status='in_progress' THEN 0 ELSE 1 END,COALESCE(queue_position,2147483647),id"
    : 'id DESC';

  const count = await env.DB.prepare(`SELECT COUNT(*) count FROM submissions WHERE ${where}`)
    .first<{ count: number }>();
  const total = Number(count?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, pages - 1));
  const rows = await env.DB.prepare(`
    SELECT id,title,status,queue_status,queue_position,plan
    FROM submissions
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `).bind(ADMIN_PAGE_SIZE, safePage * ADMIN_PAGE_SIZE).all<AdminListRow>();

  const title = kind === 'pending'
    ? '📨 Новые заявки'
    : kind === 'queue'
      ? '📚 Очередь переводов'
      : '🗂 Все заявки';
  const lines = [`<b>${title}</b>`, ''];
  if (!rows.results.length) lines.push('Здесь пока ничего нет.');
  for (const row of rows.results) {
    lines.push(`${adminStatusIcon(row)} <b>#${row.id}</b> ${escapeHtml(shorten(row.title, 65))}`);
  }
  if (pages > 1) lines.push('', `Страница ${safePage + 1}/${pages}`);

  const buttons: InlineKeyboardMarkup['inline_keyboard'] = rows.results.map((row) => [{
    text: `${adminStatusIcon(row)} #${row.id} · ${shorten(row.title, 34)}`,
    callback_data: `admin:d:${row.id}:${kind}:${safePage}`,
  }]);
  const nav = paginationRow(kind, safePage, pages);
  if (nav.length) buttons.push(nav);
  buttons.push([{ text: '← Админ', callback_data: 'admin:home' }]);
  await editOrSend(adminId, messageId, lines.join('\n'), { inline_keyboard: buttons }, telegram);
}

async function showAdminDetail(
  adminId: number,
  submissionId: number,
  env: Env,
  telegram: TelegramClient,
  messageId?: number,
  origin: ListKind = 'all',
  page = 0,
): Promise<void> {
  const submission = await getSubmission(env, submissionId);
  if (!submission) {
    await editOrSend(
      adminId,
      messageId,
      'Заявка не найдена.',
      { inline_keyboard: [[{ text: '← Админ', callback_data: 'admin:home' }]] },
      telegram,
    );
    return;
  }

  const user = await getUser(env, submission.user_id);
  const username = user?.username ? `@${escapeHtml(user.username)}` : '—';
  const lines = [
    `<b>📚 Заявка #${submission.id}</b>`,
    `${adminStatusIcon(submission)} ${adminStatusText(submission)}`,
    '',
    `<b>Название:</b> ${escapeHtml(submission.title)}`,
    `<b>Пользователь:</b> ${username} · <code>${submission.user_id}</code>`,
    `<b>Статус:</b> ${submission.plan === 'subscriber' ? '⭐ Boosty' : 'Обычный'}`,
    `<b>Оригинал:</b> ${escapeHtml(submission.original_language)} · ${submission.chapter_count} глав · ${submission.publication_status === 'completed' ? 'завершена' : 'продолжается'}`,
    `<b>Источник:</b> ${submission.source_url ? escapeHtml(submission.source_url) : '—'}`,
    '',
    `<b>Жанры / теги:</b>\n${escapeHtml(submission.genres_tags)}`,
    '',
    `<b>Фетиши / сексуальный контент:</b>\n${escapeHtml(submission.sexual_content)}`,
    '',
    `<b>Чувствительный контент:</b>\n${escapeHtml(submission.sensitive_content)}`,
    '',
    `<b>Заметки:</b>\n${submission.notes ? escapeHtml(submission.notes) : '—'}`,
  ];
  if (submission.status === 'accepted' && submission.queue_status !== 'completed') {
    lines.splice(3, 0, `<b>Позиция в очереди:</b> ${submission.queue_position ?? '—'}`);
  }
  if (submission.status === 'accepted' && submission.queue_status === 'in_progress') {
    lines.splice(4, 0, `<b>Прогресс:</b> ${submission.current_chapter ?? 0} / ${submission.chapter_count}`);
  }

  const kb: InlineKeyboardMarkup['inline_keyboard'] = [];
  if (submission.status === 'pending') {
    kb.push([
      { text: '✅ Принять → в очередь', callback_data: `admin:a:accept:${submission.id}:${origin}:${page}` },
      { text: '❌ Отклонить', callback_data: `admin:a:reject:${submission.id}:${origin}:${page}` },
    ]);
    kb.push([{ text: '♻️ Отклонить + вернуть слот', callback_data: `admin:a:return:${submission.id}:${origin}:${page}` }]);
  } else if (submission.status === 'accepted' && submission.queue_status === 'queued') {
    kb.push([{ text: '▶️ Начать', callback_data: `admin:a:start:${submission.id}:${origin}:${page}` }]);
    kb.push([
      { text: '⬆️ Выше', callback_data: `admin:a:up:${submission.id}:${origin}:${page}` },
      { text: '⬇️ Ниже', callback_data: `admin:a:down:${submission.id}:${origin}:${page}` },
    ]);
  } else if (submission.status === 'accepted' && submission.queue_status === 'in_progress') {
    kb.push([
      { text: '✅ Завершить', callback_data: `admin:a:complete:${submission.id}:${origin}:${page}` },
      { text: '↩️ Вернуть в очередь', callback_data: `admin:a:backqueue:${submission.id}:${origin}:${page}` },
    ]);
  } else if (submission.status === 'accepted' && submission.queue_status === 'completed') {
    kb.push([{ text: '↩️ Вернуть в работу', callback_data: `admin:a:reopen:${submission.id}:${origin}:${page}` }]);
  }

  kb.push([
    { text: '📎 Raw-файл', callback_data: `admin:a:raw:${submission.id}:${origin}:${page}` },
    { text: '💬 Написать пользователю', callback_data: `admin:a:message:${submission.id}:${origin}:${page}` },
  ]);
  kb.push([{ text: '← Назад', callback_data: `admin:list:${origin}:${page}` }]);
  await editOrSend(adminId, messageId, lines.join('\n'), { inline_keyboard: kb }, telegram);
}

async function showAdminConfirmation(
  query: TelegramCallbackQuery,
  action: AdminSubmissionAction,
  submissionId: number,
  env: Env,
  telegram: TelegramClient,
  origin: ListKind,
  page: number,
): Promise<void> {
  const submission = await getSubmission(env, submissionId);
  if (!submission) return;

  const labels: Partial<Record<AdminSubmissionAction, string>> = {
    reject: 'Отклонить заявку',
    return: 'Отклонить и вернуть слот',
    complete: 'Завершить перевод',
    backqueue: 'Вернуть перевод в очередь',
    reopen: 'Вернуть перевод в работу',
  };
  const details: string[] = [`<b>${escapeHtml(labels[action] ?? action)}?</b>`, '', `Заявка #${submission.id}: ${escapeHtml(shorten(submission.title, 90))}`];
  if (action === 'complete') {
    details.push('', `Текущий прогресс: <b>${submission.current_chapter ?? 0} / ${submission.chapter_count}</b>.`, `После подтверждения будет <b>${submission.chapter_count} / ${submission.chapter_count}</b>.`);
  }
  if (action === 'reopen') {
    details.push('', 'Статус изменится с «Завершена» на «В работе». Если завершение было сделано через новую админку, предыдущий прогресс будет восстановлен из журнала.');
  }

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: 'Подтвердить', callback_data: `admin:c:${action}:${submission.id}:${origin}:${page}` }],
      [{ text: 'Отмена', callback_data: `admin:d:${submission.id}:${origin}:${page}` }],
    ],
  };
  await editOrSend(query.from.id, query.message?.message_id, details.join('\n'), keyboard, telegram);
}

async function runAction(
  query: TelegramCallbackQuery,
  action: string,
  submissionId: number,
  env: Env,
  telegram: TelegramClient,
  origin: ListKind,
  page: number,
  confirmed: boolean,
): Promise<void> {
  const submission = await getSubmission(env, submissionId);
  if (!submission) return;
  const now = new Date().toISOString();

  if (action === 'message') {
    await env.DB.prepare(`
      INSERT INTO admin_sessions (admin_user_id,submission_id,updated_at)
      VALUES (?,?,?)
      ON CONFLICT(admin_user_id) DO UPDATE SET
        submission_id=excluded.submission_id,
        updated_at=excluded.updated_at
    `).bind(query.from.id, submissionId, now).run();
    await telegram.sendMessage(query.from.id, `💬 Отправьте сообщение для заявки #${submissionId}. Для отмены используйте /cancel.`);
    return;
  }

  if (action === 'raw') {
    await telegram.sendDocument(
      query.from.id,
      submission.raw_file_id,
      `📎 Raw-файл заявки #${submission.id}${submission.raw_file_name ? ` — ${escapeHtml(submission.raw_file_name)}` : ''}`,
    );
    return;
  }

  const typedAction = action as AdminSubmissionAction;
  if (CONFIRM_ACTIONS.has(typedAction) && !confirmed) {
    await showAdminConfirmation(query, typedAction, submissionId, env, telegram, origin, page);
    return;
  }

  try {
    await applyAdminSubmissionAction(env, telegram, submissionId, typedAction, {
      adminUserId: query.from.id,
    });
  } catch (error) {
    const message = error instanceof AdminStateError
      ? error.message
      : 'Не удалось применить действие. Обновите заявку и попробуйте ещё раз.';
    await telegram.sendMessage(query.from.id, `⚠️ ${escapeHtml(message)}`).catch(() => undefined);
  }

  await clearAdminSession(env, query.from.id);
  await showAdminDetail(
    query.from.id,
    submissionId,
    env,
    telegram,
    query.message?.message_id,
    origin,
    page,
  );
}

async function showAdminGuide(
  adminId: number,
  telegram: TelegramClient,
  messageId?: number,
): Promise<void> {
  const text = [
    '<b>📖 Инструкция администратора</b>',
    '',
    '<b>Новые заявки</b> — ждут решения.',
    '<b>Принять → в очередь</b> — принять заявку и поставить её в конец публичной очереди.',
    '<b>Отклонить</b> — отклонить без возврата месячного слота.',
    '<b>Отклонить + вернуть слот</b> — отклонить и вернуть пользователю использованный слот.',
    '',
    '<b>Очередь</b> — принятые новеллы. Завершить можно только перевод, который уже находится в статусе «В работе».',
    '<b>Вернуть в работу</b> — отменить ошибочное завершение. Для новых завершений предыдущий прогресс восстанавливается из административного журнала.',
    '<b>Raw-файл</b> — повторно отправить исходный файл администратору.',
    '<b>Написать пользователю</b> — следующее текстовое сообщение будет отправлено владельцу заявки.',
    '',
    'Каждое изменение статуса записывается в административный журнал.',
    'Пользователи видят только публичную очередь и собственные заявки. Закрытые поля заявки публично не показываются.',
  ].join('\n');
  await editOrSend(
    adminId,
    messageId,
    text,
    { inline_keyboard: [[{ text: '← Админ', callback_data: 'admin:home' }]] },
    telegram,
  );
}

function adminStatusIcon(row: { status: string; queue_status?: string | null }): string {
  if (row.status === 'pending') return '🕓';
  if (row.status === 'rejected') return '❌';
  if (row.queue_status === 'completed') return '✅';
  if (row.queue_status === 'in_progress') return '▶️';
  return '⏳';
}

function adminStatusText(row: { status: string; queue_status?: string | null; slot_returned?: number }): string {
  if (row.status === 'pending') return 'На проверке';
  if (row.status === 'rejected') return row.slot_returned ? 'Отклонена · слот возвращён' : 'Отклонена';
  if (row.queue_status === 'completed') return 'Завершена';
  if (row.queue_status === 'in_progress') return 'В работе';
  return 'В очереди';
}

function paginationRow(
  kind: ListKind,
  page: number,
  pages: number,
): InlineKeyboardMarkup['inline_keyboard'][number] {
  if (pages <= 1) return [];
  const row: InlineKeyboardMarkup['inline_keyboard'][number] = [];
  if (page > 0) row.push({ text: '◀️', callback_data: `admin:list:${kind}:${page - 1}` });
  row.push({ text: `${page + 1}/${pages}`, callback_data: `admin:list:${kind}:${page}` });
  if (page + 1 < pages) row.push({ text: '▶️', callback_data: `admin:list:${kind}:${page + 1}` });
  return row;
}

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
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
      // The original message may be too old or already contain identical content.
    }
  }
  await telegram.sendMessage(chatId, text, { reply_markup: replyMarkup });
}
