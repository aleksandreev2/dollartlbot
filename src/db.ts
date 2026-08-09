import type { TelegramUser } from './telegram';
import {
  ABSOLUTE_MAX_CHAPTERS,
  type FormStep,
  type SessionRow,
  type SubmissionDraft,
  type SubmissionRow,
  type UserRow,
} from './domain';

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

export async function upsertUser(env: Env, user: TelegramUser): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO users (telegram_id, username, first_name, language, language_selected, created_at, updated_at)
    VALUES (?, ?, ?, 'en', 0, ?, ?)
    ON CONFLICT(telegram_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name,
      updated_at = excluded.updated_at
  `)
    .bind(user.id, user.username ?? null, user.first_name ?? null, now, now)
    .run();
}

export function getUser(env: Env, userId: number): Promise<UserRow | null> {
  return env.DB.prepare(`
    SELECT telegram_id, username, first_name, language, language_selected,
           last_limit_reset_notified_month, last_promo_at, promo_opt_out
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
           queued_at, started_at, completed_at
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
      draft.chapter_count <= ABSOLUTE_MAX_CHAPTERS &&
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
