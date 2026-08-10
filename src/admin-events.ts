import { errorText, isAdmin } from './db';
import { escapeHtml, TelegramApiError, type TelegramClient } from './telegram';

const ADMIN_EVENT_BATCH = 25;
const ADMIN_EVENT_MAX_ATTEMPTS = 5;
const ADMIN_EVENT_CLAIM_MS = 2 * 60 * 1000;
const ACTIVATION_MEMO_MAX = 5_000;

type ActivationSource = 'bot' | 'miniapp';
type AdminEventSeverity = 'info' | 'warning' | 'error';

type AdminEventInput = {
  type: string;
  severity?: AdminEventSeverity;
  userId?: number | null;
  submissionId?: number | null;
  publicationId?: number | null;
  title: string;
  body?: string;
  actionUrl?: string | null;
  dedupeKey?: string | null;
  details?: Record<string, unknown> | null;
};

type AdminEventDeliveryRow = {
  id: number;
  type: string;
  severity: AdminEventSeverity;
  user_id: number | null;
  title: string;
  body: string;
  action_url: string | null;
  telegram_attempts: number;
};

type ActivationUser = {
  telegram_id: number;
  username: string | null;
  first_name: string | null;
  language: string;
  activated_at: string | null;
};

const activationMemo = new Set<number>();

/**
 * Marks the first successful, non-admin use of Dollar TL and creates exactly one
 * durable admin event. Existing users are backfilled as activated by migration
 * 0019, so deployment cannot produce a notification storm.
 */
export async function markUserActivated(
  env: Env,
  telegram: TelegramClient,
  userId: number,
  source: ActivationSource = 'bot',
): Promise<void> {
  if (isAdmin(userId, env) || activationMemo.has(userId)) return;

  const user = await env.DB.prepare(`
    SELECT telegram_id, username, first_name, language, activated_at
    FROM users
    WHERE telegram_id = ?
  `).bind(userId).first<ActivationUser>();
  if (!user) return;
  if (user.activated_at) {
    rememberActivated(userId);
    return;
  }

  const now = new Date().toISOString();
  const display = user.username
    ? `@${cleanUsername(user.username)}`
    : String(user.first_name || `Telegram user ${userId}`).trim();
  const sourceLabel = source === 'miniapp' ? 'Mini App' : 'Telegram Bot';
  const language = languageLabel(user.language);
  const title = 'Новый пользователь Dollar TL';
  const body = `${display}\nID: ${userId}\nЯзык: ${language}\nИсточник: ${sourceLabel}`;
  const actionUrl = `/app/?view=admin&admin=activity&user=${userId}`;
  const dedupeKey = `new_user:${userId}`;
  const details = JSON.stringify({ source, language: user.language || 'en' });

  const [eventInsert] = await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO admin_events (
        type, severity, user_id, title, body, action_url, dedupe_key, details,
        telegram_status, telegram_attempts, telegram_next_attempt_at, created_at
      )
      SELECT 'new_user', 'info', telegram_id, ?, ?, ?, ?, ?, 'queued', 0, ?, ?
      FROM users
      WHERE telegram_id = ? AND activated_at IS NULL
    `).bind(title, body, actionUrl, dedupeKey, details, now, now, userId),
    env.DB.prepare(`
      UPDATE users
      SET activated_at = COALESCE(activated_at, ?),
          activated_via = COALESCE(activated_via, ?),
          last_seen_at = ?,
          updated_at = ?
      WHERE telegram_id = ?
    `).bind(now, source, now, now, userId),
  ]);

  rememberActivated(userId);
  if ((eventInsert.meta.changes ?? 0) === 0) return;

  const eventId = Number(eventInsert.meta.last_row_id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return;

  // Immediate delivery keeps the alert useful. The durable state below means a
  // Telegram/network failure is retried later by the scheduled maintenance job.
  await deliverAdminEventById(env, telegram, eventId).catch((error) => {
    console.warn(JSON.stringify({
      event: 'admin_event_immediate_delivery_failed',
      admin_event_id: eventId,
      error: errorText(error),
    }));
  });
}

export async function enqueueAdminEvent(
  env: Env,
  telegram: TelegramClient,
  input: AdminEventInput,
): Promise<number | null> {
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO admin_events (
      type, severity, user_id, submission_id, publication_id,
      title, body, action_url, dedupe_key, details,
      telegram_status, telegram_attempts, telegram_next_attempt_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)
  `).bind(
    input.type,
    input.severity ?? 'info',
    input.userId ?? null,
    input.submissionId ?? null,
    input.publicationId ?? null,
    input.title,
    input.body ?? '',
    input.actionUrl ?? null,
    input.dedupeKey ?? null,
    input.details ? JSON.stringify(input.details) : null,
    now,
    now,
  ).run();

  if ((inserted.meta.changes ?? 0) === 0) return null;
  const eventId = Number(inserted.meta.last_row_id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return null;
  await deliverAdminEventById(env, telegram, eventId);
  return eventId;
}

export async function runAdminEventMaintenance(
  env: Env,
  telegram: TelegramClient,
  limit = ADMIN_EVENT_BATCH,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = await env.DB.prepare(`
    SELECT id
    FROM admin_events
    WHERE telegram_status IN ('queued','retry','sending')
      AND COALESCE(telegram_next_attempt_at, created_at) <= ?
    ORDER BY COALESCE(telegram_next_attempt_at, created_at) ASC, id ASC
    LIMIT ?
  `).bind(now, Math.max(1, Math.min(100, limit))).all<{ id: number }>();

  for (const row of rows.results) {
    await deliverAdminEventById(env, telegram, Number(row.id));
  }
}

export async function retryAdminEventDelivery(
  env: Env,
  telegram: TelegramClient,
  eventId: number,
): Promise<boolean> {
  const now = new Date().toISOString();
  const updated = await env.DB.prepare(`
    UPDATE admin_events
    SET telegram_status='retry', telegram_next_attempt_at=?, telegram_last_error=NULL
    WHERE id=? AND telegram_status='failed'
  `).bind(now, eventId).run();
  if ((updated.meta.changes ?? 0) === 0) return false;
  await deliverAdminEventById(env, telegram, eventId);
  return true;
}

async function deliverAdminEventById(
  env: Env,
  telegram: TelegramClient,
  eventId: number,
): Promise<void> {
  const now = new Date();
  const nowIso = now.toISOString();
  const claimUntil = new Date(now.getTime() + ADMIN_EVENT_CLAIM_MS).toISOString();
  const claimed = await env.DB.prepare(`
    UPDATE admin_events
    SET telegram_status='sending', telegram_next_attempt_at=?
    WHERE id=?
      AND telegram_status IN ('queued','retry','sending')
      AND COALESCE(telegram_next_attempt_at, created_at) <= ?
  `).bind(claimUntil, eventId, nowIso).run();
  if ((claimed.meta.changes ?? 0) === 0) return;

  const row = await env.DB.prepare(`
    SELECT id, type, severity, user_id, title, body, action_url, telegram_attempts
    FROM admin_events
    WHERE id=? AND telegram_status='sending'
  `).bind(eventId).first<AdminEventDeliveryRow>();
  if (!row) return;

  try {
    const actionUrl = row.action_url ? resolveAdminActionUrl(env, row.action_url) : null;
    await telegram.sendMessage(
      env.ADMIN_TELEGRAM_ID,
      `<b>${eventIcon(row)} ${escapeHtml(row.title)}</b>\n\n${escapeHtml(row.body)}`,
      actionUrl
        ? { reply_markup: { inline_keyboard: [[{ text: 'Открыть в админке', web_app: { url: actionUrl } }]] } }
        : {},
    );
    await env.DB.prepare(`
      UPDATE admin_events
      SET telegram_status='sent', telegram_attempts=telegram_attempts+1,
          telegram_sent_at=?, telegram_next_attempt_at=NULL, telegram_last_error=NULL
      WHERE id=? AND telegram_status='sending'
    `).bind(new Date().toISOString(), eventId).run();
  } catch (error) {
    const attempts = Number(row.telegram_attempts ?? 0) + 1;
    const retryable = isRetryableTelegramError(error) && attempts < ADMIN_EVENT_MAX_ATTEMPTS;
    const nextAttemptAt = retryable ? retryAt(new Date(), attempts, error) : null;
    await env.DB.prepare(`
      UPDATE admin_events
      SET telegram_status=?, telegram_attempts=?, telegram_next_attempt_at=?, telegram_last_error=?
      WHERE id=? AND telegram_status='sending'
    `).bind(
      retryable ? 'retry' : 'failed',
      attempts,
      nextAttemptAt,
      errorText(error).slice(0, 1000),
      eventId,
    ).run();
  }
}

function resolveAdminActionUrl(env: Env, actionUrl: string): string {
  const configured = String(env.MINI_APP_URL || 'https://t.me/dollartlbot');
  try {
    const base = new URL(configured);
    const target = new URL(actionUrl, base);
    const build = base.searchParams.get('build');
    if (build && !target.searchParams.has('build')) target.searchParams.set('build', build);
    return target.toString();
  } catch {
    return configured;
  }
}

function eventIcon(row: Pick<AdminEventDeliveryRow, 'type' | 'severity'>): string {
  if (row.type === 'new_user') return '👤';
  if (row.severity === 'error') return '🚨';
  if (row.severity === 'warning') return '⚠️';
  return '🔔';
}

function isRetryableTelegramError(error: unknown): boolean {
  if (!(error instanceof TelegramApiError)) return true;
  if (error.retryAfter !== undefined || error.code === 429 || error.httpStatus === 429) return true;
  if ((error.httpStatus ?? 0) >= 500 || (error.code ?? 0) >= 500) return true;
  if (error.code === undefined && error.httpStatus === undefined) return true;
  return false;
}

function retryAt(now: Date, attempts: number, error: unknown): string {
  const retryAfter = error instanceof TelegramApiError ? error.retryAfter : undefined;
  const seconds = retryAfter !== undefined
    ? Math.max(1, Math.min(3600, retryAfter))
    : Math.min(3600, 60 * (2 ** Math.max(0, attempts - 1)));
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function rememberActivated(userId: number): void {
  if (activationMemo.size >= ACTIVATION_MEMO_MAX) activationMemo.clear();
  activationMemo.add(userId);
}

function cleanUsername(value: string): string {
  return String(value || '').trim().replace(/^@/, '').slice(0, 32);
}

function languageLabel(locale: string): string {
  const labels: Record<string, string> = {
    en: 'English', ru: 'Russian', es: 'Spanish', fil: 'Filipino', hi: 'Hindi',
    pt: 'Portuguese', id: 'Indonesian', vi: 'Vietnamese', fr: 'French', de: 'German',
  };
  return labels[String(locale || '').toLowerCase()] || String(locale || 'English');
}
