import type { TelegramUser } from './telegram';
import type { FormStep, SessionRow, SubmissionDraft, SubmissionRow, UserRow } from './domain';

export async function monthlySubmissionCount(env: Env, userId: number): Promise<number> {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM submissions
    WHERE user_id = ? AND month_key = ? AND slot_returned = 0
  `)
    .bind(userId, currentMonthKey())
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export function currentMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function localeFromTelegramLanguageCode(languageCode?: string | null): string {
  const raw = String(languageCode ?? '').trim().toLowerCase();
  const base = raw.split(/[-_]/)[0];
  switch (base) {
    case 'ru': return 'ru';
    case 'es': return 'es';
    case 'fil':
    case 'tl': return 'fil';
    case 'hi': return 'hi';
    case 'pt': return 'pt';
    case 'id': return 'id';
    case 'vi': return 'vi';
    case 'fr': return 'fr';
    case 'de': return 'de';
    default: return 'en';
  }
}

export async function upsertUser(env: Env, user: TelegramUser): Promise<void> {
  const now = new Date().toISOString();
  const initialLanguage = localeFromTelegramLanguageCode(user.language_code);
  const photoUrl = normalizeTelegramPhotoUrl(user.photo_url);

  try {
    await env.DB.prepare(`
      INSERT INTO users (
        telegram_id, username, first_name, language, language_selected,
        created_at, updated_at, last_seen_at, telegram_photo_url, telegram_photo_updated_at
      )
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        language = CASE WHEN users.language_selected = 0 THEN excluded.language ELSE users.language END,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at,
        telegram_photo_url = CASE
          WHEN excluded.telegram_photo_url IS NOT NULL THEN excluded.telegram_photo_url
          ELSE users.telegram_photo_url
        END,
        telegram_photo_updated_at = CASE
          WHEN excluded.telegram_photo_url IS NOT NULL THEN excluded.telegram_photo_updated_at
          ELSE users.telegram_photo_updated_at
        END
    `)
      .bind(
        user.id,
        user.username ?? null,
        user.first_name ?? null,
        initialLanguage,
        now,
        now,
        now,
        photoUrl,
        photoUrl ? now : null,
      )
      .run();
    return;
  } catch (error) {
    if (!isTelegramPhotoSchemaMissing(error) && !isAdminEventsSchemaMissing(error)) throw error;
  }

  // Profile-photo persistence is deliberately fail-open during a migration race.
  // The public bot/Mini App must keep working even if Worker code reaches an
  // older D1 schema for a short period during deployment.
  await upsertUserWithoutPhoto(env, user, initialLanguage, now);
}

async function upsertUserWithoutPhoto(
  env: Env,
  user: TelegramUser,
  initialLanguage: string,
  now: string,
): Promise<void> {
  try {
    await env.DB.prepare(`
      INSERT INTO users (
        telegram_id, username, first_name, language, language_selected,
        created_at, updated_at, last_seen_at
      )
      VALUES (?, ?, ?, ?, 0, ?, ?, ?)
      ON CONFLICT(telegram_id) DO UPDATE SET
        username = excluded.username,
        first_name = excluded.first_name,
        language = CASE WHEN users.language_selected = 0 THEN excluded.language ELSE users.language END,
        updated_at = excluded.updated_at,
        last_seen_at = excluded.last_seen_at
    `)
      .bind(user.id, user.username ?? null, user.first_name ?? null, initialLanguage, now, now, now)
      .run();
    return;
  } catch (error) {
    if (!isAdminEventsSchemaMissing(error)) throw error;
  }

  // Migration 0019 must not become a hard dependency for the public bot/Mini App.
  // If a deployment races ahead of the remote D1 migration, preserve the legacy
  // user flow and let the admin-event feature remain temporarily unavailable.
  await env.DB.prepare(`
    INSERT INTO users (
      telegram_id, username, first_name, language, language_selected,
      created_at, updated_at
    )
    VALUES (?, ?, ?, ?, 0, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      language = CASE WHEN users.language_selected = 0 THEN excluded.language ELSE users.language END,
      updated_at = excluded.updated_at
  `)
    .bind(user.id, user.username ?? null, user.first_name ?? null, initialLanguage, now, now)
    .run();
}

function normalizeTelegramPhotoUrl(value?: string | null): string | null {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function getUser(env: Env, userId: number): Promise<UserRow | null> {
  try {
    return await env.DB.prepare(`
      SELECT telegram_id, username, first_name, language, language_selected,
             created_at, updated_at, activated_at, activated_via, last_seen_at,
             last_limit_reset_notified_month, last_promo_at, promo_opt_out,
             miniapp_onboarded_at, adult_confirmed_at
      FROM users WHERE telegram_id = ?
    `)
      .bind(userId)
      .first<UserRow>();
  } catch (error) {
    if (!isAdminEventsSchemaMissing(error)) throw error;
  }

  return env.DB.prepare(`
    SELECT telegram_id, username, first_name, language, language_selected,
           created_at, updated_at,
           last_limit_reset_notified_month, last_promo_at, promo_opt_out,
           miniapp_onboarded_at, adult_confirmed_at
    FROM users WHERE telegram_id = ?
  `)
    .bind(userId)
    .first<UserRow>();
}

export function getSession(env: Env, userId: number): Promise<SessionRow | null> {
  return env.DB.prepare('SELECT step, data FROM sessions WHERE user_id = ?')
    .bind(userId)
    .first<SessionRow>();
}

export async function saveSession(
  env: Env,
  userId: number,
  step: FormStep,
  data: SubmissionDraft,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO sessions (user_id, step, data, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      step = excluded.step,
      data = excluded.data,
      updated_at = excluded.updated_at
  `)
    .bind(userId, step, JSON.stringify(data), new Date().toISOString())
    .run();
}

export async function clearSession(env: Env, userId: number): Promise<void> {
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
}

export async function clearAdminSession(env: Env, userId: number): Promise<void> {
  await env.DB.prepare('DELETE FROM admin_sessions WHERE admin_user_id = ?').bind(userId).run();
}

export function getSubmission(env: Env, id: number): Promise<SubmissionRow | null> {
  return env.DB.prepare(`
    SELECT id, user_id, language, title, original_language, chapter_count,
           publication_status, source_url, raw_file_id, raw_file_name, raw_file_mime,
           genres_tags, sexual_content, sensitive_content, notes, plan, status, slot_returned,
           admin_summary_sent, admin_file_sent, queue_status, queue_position,
           queued_at, started_at, completed_at, current_chapter, progress_updated_at
    FROM submissions WHERE id = ?
  `)
    .bind(id)
    .first<SubmissionRow>();
}

export function parseDraft(data: string): SubmissionDraft {
  try {
    return JSON.parse(data) as SubmissionDraft;
  } catch {
    return {};
  }
}

export function isCompleteDraft(draft: SubmissionDraft): draft is Required<
  Pick<
    SubmissionDraft,
    | 'title'
    | 'original_language'
    | 'chapter_count'
    | 'publication_status'
    | 'raw_file_id'
    | 'genres_tags'
    | 'sexual_content'
    | 'sensitive_content'
  >
> & SubmissionDraft {
  return Boolean(
    draft.title &&
      draft.original_language &&
      draft.chapter_count &&
      draft.publication_status &&
      draft.raw_file_id &&
      draft.genres_tags &&
      draft.sexual_content &&
      draft.sensitive_content,
  );
}

export function isAdmin(userId: number, env: Env): boolean {
  return String(userId) === String(env.ADMIN_TELEGRAM_ID);
}

export async function safeSecretEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const av = new Uint8Array(a);
  const bv = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < av.length; i += 1) diff |= av[i] ^ bv[i];
  return diff === 0;
}

export function errorText(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function isTelegramPhotoSchemaMissing(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  const missingSchema = text.includes('no such column') || text.includes('has no column named');
  return missingSchema && (text.includes('telegram_photo_url') || text.includes('telegram_photo_updated_at'));
}

export function isAdminEventsSchemaMissing(error: unknown): boolean {
  const text = errorText(error).toLowerCase();
  const missingSchema = text.includes('no such column')
    || text.includes('no such table')
    || text.includes('has no column named');
  if (!missingSchema) return false;
  return text.includes('activated_at')
    || text.includes('activated_via')
    || text.includes('last_seen_at')
    || text.includes('admin_events');
}
