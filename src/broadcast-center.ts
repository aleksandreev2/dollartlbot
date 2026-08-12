import { createInAppNotification } from './notifications';
import { currentMonthKey, errorText } from './db';
import { normalizeLocale } from './i18n/index';
import { escapeHtml, TelegramApiError, type TelegramClient } from './telegram';

const BROADCAST_BATCH = 25;
const BROADCAST_MAX_ATTEMPTS = 5;
const LEASE_NAME = 'release_broadcast_runner';
const LEASE_MS = 5 * 60 * 1000;
const MINI_APP_PATH = '/app/';

export type BroadcastAudience = 'release_followers' | 'all' | 'unused_quota' | 'has_requests' | 'no_requests';
export type BroadcastPreference = 'notify_releases' | 'notify_announcements';

type BroadcastJob = {
  id: number;
  status: 'queued' | 'running';
  kind: string;
  title: string;
  body: string;
  audience: BroadcastAudience;
  preference_key: BroadcastPreference;
  action_url: string | null;
  template_key: string | null;
  dedupe_key: string | null;
};

type BroadcastRecipient = {
  user_id: number;
  attempts: number;
  language: string;
  notify_releases: number;
  notify_announcements: number;
};

type BroadcastLocalization = {
  locale: string;
  title: string;
  body: string;
  action_label: string | null;
};

type AudienceFilter = {
  sql: string;
  binds: Array<string | number>;
};

const OPEN_LABEL: Record<string, string> = {
  en:'Open Dollar TL', es:'Abrir Dollar TL', fil:'Buksan ang Dollar TL', hi:'Dollar TL खोलें',
  pt:'Abrir Dollar TL', id:'Buka Dollar TL', vi:'Mở Dollar TL', fr:'Ouvrir Dollar TL',
  de:'Dollar TL öffnen', ru:'Открыть Dollar TL', ur:'Dollar TL کھولیں',
};

const RELEASE_TITLE: Record<string, string> = {
  en:'New translation release', es:'Nueva publicación de traducción', fil:'Bagong salin',
  hi:'नया अनुवाद जारी', pt:'Nova tradução publicada', id:'Rilis terjemahan baru',
  vi:'Bản dịch mới', fr:'Nouvelle traduction', de:'Neue Übersetzung', ru:'Новый перевод',
  ur:'نیا ترجمہ جاری ہوا',
};

export async function runBroadcastCenterMaintenanceWithLease(
  env: Env,
  telegram: TelegramClient,
  maxBatches = 1,
): Promise<boolean> {
  const owner = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresIso = new Date(now.getTime() + LEASE_MS).toISOString();

  const claimed = await env.DB.prepare(`
    INSERT INTO runtime_leases (name, owner_token, expires_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      owner_token = excluded.owner_token,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
    WHERE runtime_leases.expires_at <= excluded.updated_at
  `).bind(LEASE_NAME, owner, expiresIso, nowIso).run();

  if ((claimed.meta.changes ?? 0) === 0) return false;

  try {
    await runBroadcastCenterMaintenance(env, telegram, maxBatches);
    return true;
  } finally {
    await env.DB.prepare(
      'DELETE FROM runtime_leases WHERE name = ? AND owner_token = ?',
    ).bind(LEASE_NAME, owner).run().catch(() => undefined);
  }
}

export async function runBroadcastCenterMaintenance(
  env: Env,
  telegram: TelegramClient,
  maxBatches = 1,
): Promise<void> {
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const job = await env.DB.prepare(`
      SELECT id, status, kind, title, body,
             COALESCE(audience, 'release_followers') AS audience,
             COALESCE(preference_key, 'notify_releases') AS preference_key,
             action_url, template_key, dedupe_key
      FROM broadcasts
      WHERE status IN ('queued', 'running')
      ORDER BY id ASC
      LIMIT 1
    `).first<BroadcastJob>();
    if (!job) return;

    const now = new Date().toISOString();
    await ensureBroadcastRecipients(env, job, now);
    await skipOptedOutRecipients(env, job, now);

    const recipients = await env.DB.prepare(`
      SELECT br.user_id, br.attempts, u.language,
             u.notify_releases, u.notify_announcements
      FROM broadcast_recipients br
      JOIN users u ON u.telegram_id = br.user_id
      WHERE br.broadcast_id = ?
        AND br.status IN ('queued', 'retry')
        AND br.next_attempt_at <= ?
      ORDER BY br.user_id ASC
      LIMIT ?
    `).bind(job.id, now, BROADCAST_BATCH).all<BroadcastRecipient>();

    if (!recipients.results.length) {
      const pending = await refreshBroadcastTotals(env, job.id, now);
      if (pending === 0) continue;
      return;
    }

    for (const recipient of recipients.results) {
      if (!preferenceEnabled(recipient, job.preference_key)) {
        await markBroadcastRecipientSkipped(env, job.id, recipient.user_id);
        continue;
      }
      if (!(await recipientStillEligible(env, job, recipient.user_id, new Date()))) {
        await markBroadcastRecipientSkipped(env, job.id, recipient.user_id);
        continue;
      }
      await deliverBroadcastRecipient(env, telegram, job, recipient);
    }

    await refreshBroadcastTotals(env, job.id, new Date().toISOString());
  }
}

async function ensureBroadcastRecipients(env: Env, job: BroadcastJob, now: string): Promise<void> {
  let shouldSnapshot = job.status === 'queued';
  if (!shouldSnapshot) {
    const existing = await env.DB.prepare(`
      SELECT 1 AS present FROM broadcast_recipients WHERE broadcast_id = ? LIMIT 1
    `).bind(job.id).first<{ present: number }>();
    shouldSnapshot = !existing;
  }
  if (!shouldSnapshot) return;

  const preferenceSql = job.preference_key === 'notify_announcements'
    ? 'u.notify_announcements = 1'
    : 'u.notify_releases = 1';
  const monthKey = currentMonthKey(new Date(now));
  const audience = audienceFilter(job.audience, monthKey, now);
  const automationSql = isAutomatedBroadcast(job) ? 'u.language_selected = 1' : '1 = 1';

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE broadcasts
      SET status = 'running', started_at = COALESCE(started_at, ?)
      WHERE id = ? AND status IN ('queued', 'running')
    `).bind(now, job.id),
    env.DB.prepare(`
      INSERT OR IGNORE INTO broadcast_recipients (
        broadcast_id, user_id, status, attempts, next_attempt_at, created_at, updated_at
      )
      SELECT ?, u.telegram_id, 'queued', 0, ?, ?, ?
      FROM users u
      LEFT JOIN user_admin_controls control ON control.user_id = u.telegram_id
      WHERE ${preferenceSql}
        AND control.blocked_at IS NULL
        AND ${automationSql}
        AND ${audience.sql}
    `).bind(job.id, now, now, now, ...audience.binds),
  ]);
}

function audienceFilter(audience: BroadcastAudience, monthKey: string, now: string): AudienceFilter {
  if (audience === 'unused_quota') {
    return {
      sql: `NOT EXISTS (
        SELECT 1 FROM submissions s
        WHERE s.user_id = u.telegram_id AND s.month_key = ? AND s.slot_returned = 0
      ) AND NOT EXISTS (
        SELECT 1 FROM submission_intake_reservations sr
        WHERE sr.user_id = u.telegram_id
          AND sr.month_key = ?
          AND sr.state = 'reserved'
          AND sr.expires_at > ?
      )`,
      binds: [monthKey, monthKey, now],
    };
  }
  if (audience === 'has_requests') {
    return { sql: 'EXISTS (SELECT 1 FROM submissions s WHERE s.user_id = u.telegram_id)', binds: [] };
  }
  if (audience === 'no_requests') {
    return { sql: 'NOT EXISTS (SELECT 1 FROM submissions s WHERE s.user_id = u.telegram_id)', binds: [] };
  }
  return { sql: '1 = 1', binds: [] };
}

async function recipientStillEligible(
  env: Env,
  job: BroadcastJob,
  userId: number,
  now: Date,
): Promise<boolean> {
  const monthKey = currentMonthKey(now);
  const automatedMonth = automationMonth(job);
  if (automatedMonth && automatedMonth !== monthKey) return false;
  const preferenceSql = job.preference_key === 'notify_announcements'
    ? 'u.notify_announcements = 1'
    : 'u.notify_releases = 1';
  const automationSql = isAutomatedBroadcast(job) ? 'u.language_selected = 1' : '1 = 1';
  const audience = audienceFilter(job.audience, monthKey, now.toISOString());
  const row = await env.DB.prepare(`
    SELECT 1 AS ok
    FROM users u
    LEFT JOIN user_admin_controls control ON control.user_id = u.telegram_id
    WHERE u.telegram_id = ?
      AND ${preferenceSql}
      AND control.blocked_at IS NULL
      AND ${automationSql}
      AND ${audience.sql}
    LIMIT 1
  `).bind(userId, ...audience.binds).first<{ ok: number }>();
  return Boolean(row?.ok);
}

function isAutomatedBroadcast(job: BroadcastJob): boolean {
  return String(job.template_key || '').startsWith('auto:');
}

function automationMonth(job: BroadcastJob): string | null {
  if (!isAutomatedBroadcast(job)) return null;
  const match = /^automation:[^:]+:(\d{4}-\d{2}):/.exec(String(job.dedupe_key || ''));
  return match?.[1] || null;
}

async function skipOptedOutRecipients(env: Env, job: BroadcastJob, now: string): Promise<void> {
  const preferenceColumn = job.preference_key === 'notify_announcements'
    ? 'notify_announcements'
    : 'notify_releases';
  await env.DB.prepare(`
    UPDATE broadcast_recipients
    SET status = 'skipped', updated_at = ?
    WHERE broadcast_id = ?
      AND status IN ('queued', 'retry')
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.telegram_id = broadcast_recipients.user_id
          AND u.${preferenceColumn} = 0
      )
  `).bind(now, job.id).run();
}

async function markBroadcastRecipientSkipped(env: Env, broadcastId: number, userId: number): Promise<void> {
  await env.DB.prepare(`
    UPDATE broadcast_recipients
    SET status = 'skipped', updated_at = ?
    WHERE broadcast_id = ? AND user_id = ? AND status IN ('queued', 'retry')
  `).bind(new Date().toISOString(), broadcastId, userId).run();
}

async function deliverBroadcastRecipient(
  env: Env,
  telegram: TelegramClient,
  job: BroadcastJob,
  recipient: BroadcastRecipient,
): Promise<void> {
  const lang = normalizeLocale(recipient.language);
  const actionUrl = resolveMiniAppActionUrl(
    env,
    job.action_url || (job.kind === 'release' ? `${MINI_APP_PATH}?view=home` : `${MINI_APP_PATH}?view=suggest`),
  );
  const copy = job.kind === 'release'
    ? releaseCopy(job, lang)
    : await localizedCopy(env, job, lang);

  await createInAppNotification(
    env,
    recipient.user_id,
    job.kind === 'release' ? 'release' : 'announcement',
    copy.title,
    copy.body,
    job.action_url || (job.kind === 'release' ? `${MINI_APP_PATH}?view=home` : `${MINI_APP_PATH}?view=suggest`),
    job.id,
  );

  const icon = job.kind === 'release' ? '📚' : '📣';
  const message = job.kind === 'release'
    ? `<b>${icon} ${escapeHtml(copy.title)}</b>\n\n<b>${escapeHtml(job.title)}</b>\n${escapeHtml(shorten(job.body, 2600))}`
    : `<b>${icon} ${escapeHtml(copy.title)}</b>\n\n${escapeHtml(shorten(copy.body, 3000))}`;

  try {
    await telegram.sendMessage(
      recipient.user_id,
      message,
      { reply_markup: { inline_keyboard: [[{ text: copy.actionLabel, web_app: { url: actionUrl } }]] } },
    );
    const sentAt = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE broadcast_recipients
      SET status = 'sent', attempts = attempts + 1,
          telegram_sent_at = ?, last_error = NULL, updated_at = ?
      WHERE broadcast_id = ? AND user_id = ? AND status IN ('queued', 'retry')
    `).bind(sentAt, sentAt, job.id, recipient.user_id).run();
  } catch (error) {
    const attempts = Number(recipient.attempts ?? 0) + 1;
    const retryable = isRetryableBroadcastError(error) && attempts < BROADCAST_MAX_ATTEMPTS;
    const now = new Date();
    const nextAttemptAt = retryable ? broadcastRetryAt(now, attempts, error) : now.toISOString();
    await env.DB.prepare(`
      UPDATE broadcast_recipients
      SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
      WHERE broadcast_id = ? AND user_id = ? AND status IN ('queued', 'retry')
    `).bind(
      retryable ? 'retry' : 'failed',
      attempts,
      nextAttemptAt,
      errorText(error).slice(0, 1000),
      now.toISOString(),
      job.id,
      recipient.user_id,
    ).run();
  }
}

function releaseCopy(job: BroadcastJob, locale: string) {
  return {
    title: RELEASE_TITLE[locale] || RELEASE_TITLE.en,
    body: job.title,
    actionLabel: OPEN_LABEL[locale] || OPEN_LABEL.en,
  };
}

async function localizedCopy(env: Env, job: BroadcastJob, locale: string) {
  const exact = await env.DB.prepare(`
    SELECT locale, title, body, action_label
    FROM broadcast_localizations
    WHERE broadcast_id = ? AND locale = ?
  `).bind(job.id, locale).first<BroadcastLocalization>();
  const fallback = exact || await env.DB.prepare(`
    SELECT locale, title, body, action_label
    FROM broadcast_localizations
    WHERE broadcast_id = ? AND locale = 'en'
  `).bind(job.id).first<BroadcastLocalization>();

  return {
    title: fallback?.title || job.title,
    body: fallback?.body || job.body,
    actionLabel: fallback?.action_label?.trim() || OPEN_LABEL[locale] || OPEN_LABEL.en,
  };
}

async function refreshBroadcastTotals(env: Env, broadcastId: number, now: string): Promise<number> {
  const totals = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status IN ('queued', 'retry') THEN 1 ELSE 0 END) AS pending
    FROM broadcast_recipients
    WHERE broadcast_id = ?
  `).bind(broadcastId).first<{ sent: number | null; failed: number | null; pending: number | null }>();

  const sent = Number(totals?.sent ?? 0);
  const failed = Number(totals?.failed ?? 0);
  const pending = Number(totals?.pending ?? 0);
  await env.DB.prepare(`
    UPDATE broadcasts
    SET sent_count = ?, failed_count = ?, status = ?, completed_at = ?
    WHERE id = ?
  `).bind(
    sent,
    failed,
    pending === 0 ? 'completed' : 'running',
    pending === 0 ? now : null,
    broadcastId,
  ).run();
  return pending;
}

function preferenceEnabled(recipient: BroadcastRecipient, preference: BroadcastPreference): boolean {
  return Number(recipient[preference] ?? 1) === 1;
}

function resolveMiniAppActionUrl(env: Env, actionUrl: string | null): string {
  const configured = String((env as unknown as { MINI_APP_URL?: string }).MINI_APP_URL || 'https://t.me/dollartlbot');
  if (!actionUrl) return configured;
  if (/^https:\/\//i.test(actionUrl)) return actionUrl;
  try {
    return new URL(actionUrl, configured).toString();
  } catch {
    return configured;
  }
}

function isRetryableBroadcastError(error: unknown): boolean {
  if (!(error instanceof TelegramApiError)) return true;
  if (error.retryAfter !== undefined || error.code === 429 || error.httpStatus === 429) return true;
  if ((error.httpStatus ?? 0) >= 500 || (error.code ?? 0) >= 500) return true;
  if (error.code === undefined && error.httpStatus === undefined) return true;
  return false;
}

function broadcastRetryAt(now: Date, attempts: number, error: unknown): string {
  const retryAfter = error instanceof TelegramApiError ? error.retryAfter : undefined;
  const seconds = retryAfter !== undefined
    ? Math.max(1, Math.min(3600, retryAfter))
    : Math.min(3600, 60 * (2 ** Math.max(0, attempts - 1)));
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function shorten(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
