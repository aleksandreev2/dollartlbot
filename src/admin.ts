import { clearAdminSession, getSubmission, getUser, isAdmin } from './db';
import { normalizeLocale, t } from './i18n/index';
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

export async function showAdminHome(
  adminId: number,
  env: Env,
  telegram: TelegramClient,
  messageId?: number,
): Promise<void> {
  if (!isAdmin(adminId, env)) return;
  const counts = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'accepted' AND queue_status = 'queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status = 'accepted' AND queue_status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status = 'accepted' AND queue_status = 'completed' THEN 1 ELSE 0 END) AS completed,
      COUNT(*) AS total
    FROM submissions
  `).first<{ pending: number; queued: number; in_progress: number; completed: number; total: number }>();

  const text = [
    '<b>⚙️ Dollar TL — Admin</b>',
    '',
    `📨 Pending: <b>${Number(counts?.pending ?? 0)}</b>`,
    `📚 Queued: <b>${Number(counts?.queued ?? 0)}</b>`,
    `▶️ In progress: <b>${Number(counts?.in_progress ?? 0)}</b>`,
    `✅ Completed: <b>${Number(counts?.completed ?? 0)}</b>`,
    `🗂 Total requests: <b>${Number(counts?.total ?? 0)}</b>`,
  ].join('\n');

  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [
        { text: '📨 Pending', callback_data: 'admin:list:pending:0' },
        { text: '📚 Queue', callback_data: 'admin:list:queue:0' },
      ],
      [{ text: '🗂 All Requests', callback_data: 'admin:list:all:0' }],
      [{ text: '📖 Admin Guide', callback_data: 'admin:guide' }],
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
    await runAction(query, legacy[1], Number(legacy[2]), env, telegram, 'pending', 0);
    return;
  }

  const action = /^admin:a:(accept|reject|return|message|raw|start|complete|backqueue|up|down):(\d+):(pending|queue|all):(\d+)$/.exec(data);
  if (action) {
    await runAction(
      query,
      action[1],
      Number(action[2]),
      env,
      telegram,
      action[3] as ListKind,
      Number(action[4]),
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
    ? "status = 'pending'"
    : kind === 'queue'
      ? "status = 'accepted' AND queue_status IN ('queued', 'in_progress')"
      : '1 = 1';
  const order = kind === 'queue'
    ? "CASE WHEN queue_status = 'in_progress' THEN 0 ELSE 1 END, COALESCE(queue_position, 2147483647), id"
    : 'id DESC';
  const count = await env.DB.prepare(`SELECT COUNT(*) AS count FROM submissions WHERE ${where}`)
    .first<{ count: number }>();
  const total = Number(count?.count ?? 0);
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, pages - 1));
  const rows = await env.DB.prepare(`
    SELECT id, title, status, queue_status, queue_position, plan
    FROM submissions
    WHERE ${where}
    ORDER BY ${order}
    LIMIT ? OFFSET ?
  `).bind(ADMIN_PAGE_SIZE, safePage * ADMIN_PAGE_SIZE).all<AdminListRow>();

  const title = kind === 'pending' ? '📨 Pending Requests' : kind === 'queue' ? '📚 Translation Queue' : '🗂 All Requests';
  const lines = [`<b>${title}</b>`, ''];
  if (!rows.results.length) lines.push('Nothing here.');
  for (const row of rows.results) {
    lines.push(`${adminStatusIcon(row)} <b>#${row.id}</b> ${escapeHtml(shorten(row.title, 65))}`);
  }
  if (pages > 1) lines.push('', `Page ${safePage + 1}/${pages}`);

  const buttons: InlineKeyboardMarkup['inline_keyboard'] = rows.results.map((row) => [{
    text: `${adminStatusIcon(row)} #${row.id} · ${shorten(row.title, 34)}`,
    callback_data: `admin:d:${row.id}:${kind}:${safePage}`,
  }]);
  const nav = paginationRow(kind, safePage, pages);
  if (nav.length) buttons.push(nav);
  buttons.push([{ text: '← Admin', callback_data: 'admin:home' }]);

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
    await editOrSend(adminId, messageId, 'Request not found.', { inline_keyboard: [[{ text: '← Admin', callback_data: 'admin:home' }]] }, telegram);
    return;
  }
  const user = await getUser(env, submission.user_id);
  const username = user?.username ? `@${escapeHtml(user.username)}` : '—';
  const lines = [
    `<b>📚 Request #${submission.id}</b>`,
    `${adminStatusIcon(submission)} ${adminStatusText(submission)}`,
    '',
    `<b>Title:</b> ${escapeHtml(submission.title)}`,
    `<b>User:</b> ${username} · <code>${submission.user_id}</code>`,
    `<b>Plan:</b> ${submission.plan === 'subscriber' ? '⭐ Boosty' : 'Free'}`,
    `<b>Original:</b> ${escapeHtml(submission.original_language)} · ${submission.chapter_count} chapters · ${escapeHtml(submission.publication_status)}`,
    `<b>Source:</b> ${submission.source_url ? escapeHtml(submission.source_url) : '—'}`,
    '',
    `<b>Genres / Tags:</b>\n${escapeHtml(submission.genres_tags)}`,
    '',
    `<b>Fetishes / Sexual content:</b>\n${escapeHtml(submission.sexual_content)}`,
    '',
    `<b>Sensitive content:</b>\n${escapeHtml(submission.sensitive_content)}`,
    '',
    `<b>Notes:</b>\n${submission.notes ? escapeHtml(submission.notes) : '—'}`,
  ];
  if (submission.status === 'accepted' && submission.queue_status !== 'completed') {
    lines.splice(3, 0, `<b>Queue position:</b> ${submission.queue_position ?? '—'}`);
  }

  const kb: InlineKeyboardMarkup['inline_keyboard'] = [];
  if (submission.status === 'pending') {
    kb.push([
      { text: '✅ Accept → Queue', callback_data: `admin:a:accept:${submission.id}:${origin}:${page}` },
      { text: '❌ Reject', callback_data: `admin:a:reject:${submission.id}:${origin}:${page}` },
    ]);
    kb.push([{ text: '♻️ Reject + Return Slot', callback_data: `admin:a:return:${submission.id}:${origin}:${page}` }]);
  } else if (submission.status === 'accepted' && submission.queue_status === 'queued') {
    kb.push([
      { text: '▶️ Start', callback_data: `admin:a:start:${submission.id}:${origin}:${page}` },
      { text: '✅ Complete', callback_data: `admin:a:complete:${submission.id}:${origin}:${page}` },
    ]);
    kb.push([
      { text: '⬆️ Move Up', callback_data: `admin:a:up:${submission.id}:${origin}:${page}` },
      { text: '⬇️ Move Down', callback_data: `admin:a:down:${submission.id}:${origin}:${page}` },
    ]);
  } else if (submission.status === 'accepted' && submission.queue_status === 'in_progress') {
    kb.push([
      { text: '✅ Complete', callback_data: `admin:a:complete:${submission.id}:${origin}:${page}` },
      { text: '↩️ Back to Queue', callback_data: `admin:a:backqueue:${submission.id}:${origin}:${page}` },
    ]);
  }
  kb.push([
    { text: '📎 Raw File', callback_data: `admin:a:raw:${submission.id}:${origin}:${page}` },
    { text: '💬 Message User', callback_data: `admin:a:message:${submission.id}:${origin}:${page}` },
  ]);
  kb.push([{ text: '← Back', callback_data: `admin:list:${origin}:${page}` }]);

  await editOrSend(adminId, messageId, lines.join('\n'), { inline_keyboard: kb }, telegram);
}

async function runAction(
  query: TelegramCallbackQuery,
  action: string,
  submissionId: number,
  env: Env,
  telegram: TelegramClient,
  origin: ListKind,
  page: number,
): Promise<void> {
  const submission = await getSubmission(env, submissionId);
  if (!submission) return;
  const now = new Date().toISOString();

  if (action === 'message') {
    await env.DB.prepare(`
      INSERT INTO admin_sessions (admin_user_id, submission_id, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(admin_user_id) DO UPDATE SET submission_id = excluded.submission_id, updated_at = excluded.updated_at
    `).bind(query.from.id, submissionId, now).run();
    await telegram.sendMessage(query.from.id, `💬 Send the message for request #${submissionId}. Use /cancel to abort.`);
    return;
  }

  if (action === 'raw') {
    await telegram.sendDocument(query.from.id, submission.raw_file_id, `📎 Raw file for request #${submission.id}${submission.raw_file_name ? ` — ${escapeHtml(submission.raw_file_name)}` : ''}`);
    return;
  }

  if (action === 'accept' && submission.status === 'pending') {
    await env.DB.prepare(`
      UPDATE submissions
      SET status = 'accepted', queue_status = 'queued',
          queue_position = (SELECT COALESCE(MAX(queue_position), 0) + 1 FROM submissions WHERE status = 'accepted'),
          queued_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `).bind(now, now, submissionId).run();
    await telegram.sendMessage(submission.user_id, t(normalizeLocale(submission.language), 'acceptedToQueue'));
  } else if ((action === 'reject' || action === 'return') && submission.status === 'pending') {
    const returned = action === 'return' ? 1 : 0;
    await env.DB.prepare(`
      UPDATE submissions SET status = 'rejected', slot_returned = ?, updated_at = ? WHERE id = ? AND status = 'pending'
    `).bind(returned, now, submissionId).run();
    await telegram.sendMessage(
      submission.user_id,
      t(normalizeLocale(submission.language), returned ? 'statusRejectedReturned' : 'statusRejected'),
    );
  } else if (action === 'start' && submission.status === 'accepted') {
    await env.DB.prepare("UPDATE submissions SET queue_status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, submissionId).run();
    await telegram.sendMessage(submission.user_id, t(normalizeLocale(submission.language), 'translationStarted'));
  } else if (action === 'complete' && submission.status === 'accepted') {
    await env.DB.prepare("UPDATE submissions SET queue_status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?")
      .bind(now, now, submissionId).run();
    await telegram.sendMessage(submission.user_id, t(normalizeLocale(submission.language), 'translationCompleted'));
  } else if (action === 'backqueue' && submission.status === 'accepted') {
    await env.DB.prepare("UPDATE submissions SET queue_status = 'queued', started_at = NULL, updated_at = ? WHERE id = ?")
      .bind(now, submissionId).run();
  } else if ((action === 'up' || action === 'down') && submission.status === 'accepted' && submission.queue_status === 'queued') {
    await moveQueueItem(submissionId, action === 'up' ? -1 : 1, env);
  }

  await clearAdminSession(env, query.from.id);
  await showAdminDetail(query.from.id, submissionId, env, telegram, query.message?.message_id, origin, page);
}

async function moveQueueItem(submissionId: number, direction: -1 | 1, env: Env): Promise<void> {
  const current = await env.DB.prepare('SELECT queue_position FROM submissions WHERE id = ? AND queue_status = \'queued\'')
    .bind(submissionId).first<{ queue_position: number | null }>();
  if (!current?.queue_position) return;
  const operator = direction < 0 ? '<' : '>';
  const order = direction < 0 ? 'DESC' : 'ASC';
  const adjacent = await env.DB.prepare(`
    SELECT id, queue_position FROM submissions
    WHERE status = 'accepted' AND queue_status = 'queued' AND queue_position ${operator} ?
    ORDER BY queue_position ${order}, id ${order}
    LIMIT 1
  `).bind(current.queue_position).first<{ id: number; queue_position: number }>();
  if (!adjacent) return;

  const temp = -submissionId;
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE submissions SET queue_position = ?, updated_at = ? WHERE id = ?').bind(temp, now, submissionId),
    env.DB.prepare('UPDATE submissions SET queue_position = ?, updated_at = ? WHERE id = ?').bind(current.queue_position, now, adjacent.id),
    env.DB.prepare('UPDATE submissions SET queue_position = ?, updated_at = ? WHERE id = ?').bind(adjacent.queue_position, now, submissionId),
  ]);
}

async function showAdminGuide(adminId: number, telegram: TelegramClient, messageId?: number): Promise<void> {
  const text = [
    '<b>📖 Admin Guide</b>', '',
    '<b>Pending</b> — new requests waiting for your decision.',
    '<b>Accept → Queue</b> — accepts a request and places it at the end of the public translation queue.',
    '<b>Reject</b> — rejects it and keeps the monthly slot consumed.',
    '<b>Reject + Return Slot</b> — rejects it and gives that monthly request slot back.', '',
    '<b>Queue</b> — accepted titles. Move queued titles up/down, mark one In Progress, or Complete it.',
    '<b>Raw File</b> — re-sends the Telegram file to you at any time.',
    '<b>Message User</b> — your next text message is delivered privately to that requester.', '',
    'Users can see only the public title/status queue and their own request statuses. Private disclosure fields are never shown publicly.',
  ].join('\n');
  await editOrSend(adminId, messageId, text, { inline_keyboard: [[{ text: '← Admin', callback_data: 'admin:home' }]] }, telegram);
}

function adminStatusIcon(row: { status: string; queue_status?: string | null }): string {
  if (row.status === 'pending') return '🕓';
  if (row.status === 'rejected') return '❌';
  if (row.queue_status === 'completed') return '✅';
  if (row.queue_status === 'in_progress') return '▶️';
  return '⏳';
}

function adminStatusText(row: { status: string; queue_status?: string | null; slot_returned?: number }): string {
  if (row.status === 'pending') return 'Pending review';
  if (row.status === 'rejected') return row.slot_returned ? 'Rejected · slot returned' : 'Rejected';
  if (row.queue_status === 'completed') return 'Completed';
  if (row.queue_status === 'in_progress') return 'In progress';
  return 'In queue';
}

function paginationRow(kind: ListKind, page: number, pages: number): InlineKeyboardMarkup['inline_keyboard'][number] {
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
      // Fall back to a fresh admin message if Telegram cannot edit the old one.
    }
  }
  await telegram.sendMessage(chatId, text, { reply_markup: replyMarkup });
}
