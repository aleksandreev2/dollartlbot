import { currentMonthKey } from './db';

export const REFERRAL_MONTHLY_SLOT_CAP = 3;

export type QuotaState = {
  baseLimit: number;
  baseUsed: number;
  referralUsed: number;
  referralAvailable: number;
  referralBonus: number;
  used: number;
  limit: number;
  remaining: number;
};

export type SubmissionInsertInput = {
  userId: number;
  username: string | null;
  locale: string;
  monthKey: string;
  title: string;
  originalLanguage: string;
  chapterCount: number;
  publicationStatus: string;
  sourceUrl: string | null;
  rawFileId: string;
  rawFileName: string | null;
  rawFileMime: string | null;
  genresTags: string;
  sexualContent: string;
  sensitiveContent: string;
  notes: string | null;
  plan: 'free' | 'subscriber';
  adminSummarySent?: number;
  adminFileSent?: number;
  now: string;
};

export type SubmissionInsertResult = {
  submissionId: number;
  quotaSource: 'base' | 'referral';
  referralId: number | null;
};

export async function getQuotaState(
  env: Env,
  userId: number,
  baseLimit: number,
  date = new Date(),
): Promise<QuotaState> {
  const monthKey = currentMonthKey(date);
  const now = date.toISOString();

  const [usage, rewards] = await Promise.all([
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN quota_source = 'base' AND slot_returned = 0 THEN 1 ELSE 0 END) AS base_used,
        SUM(CASE WHEN quota_source = 'referral' AND slot_returned = 0 THEN 1 ELSE 0 END) AS referral_used
      FROM submissions
      WHERE user_id = ? AND month_key = ?
    `).bind(userId, monthKey).first<{ base_used: number | null; referral_used: number | null }>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM referrals r
      WHERE r.referrer_user_id = ?
        AND r.status = 'qualified'
        AND r.reward_granted = 1
        AND NOT EXISTS (
          SELECT 1 FROM submissions s
          WHERE s.referral_id = r.id AND s.slot_returned = 0
        )
        AND (
          r.reward_expires_at >= ?
          OR EXISTS (
            SELECT 1 FROM submissions returned
            WHERE returned.referral_id = r.id AND returned.slot_returned = 1
          )
        )
    `).bind(userId, now).first<{ count: number }>(),
  ]);

  const baseUsed = Number(usage?.base_used ?? 0);
  const referralUsed = Number(usage?.referral_used ?? 0);
  const availableRaw = Number(rewards?.count ?? 0);
  const referralAvailable = Math.max(
    0,
    Math.min(availableRaw, REFERRAL_MONTHLY_SLOT_CAP - referralUsed),
  );
  const referralBonus = Math.min(
    REFERRAL_MONTHLY_SLOT_CAP,
    referralUsed + referralAvailable,
  );
  const used = baseUsed + referralUsed;
  const limit = baseLimit + referralBonus;

  return {
    baseLimit,
    baseUsed,
    referralUsed,
    referralAvailable,
    referralBonus,
    used,
    limit,
    remaining: Math.max(0, limit - used),
  };
}

export async function insertSubmissionWithQuota(
  env: Env,
  input: SubmissionInsertInput,
  baseLimit: number,
): Promise<SubmissionInsertResult | null> {
  const commonColumns = `
    user_id, username_snapshot, language, month_key, title, original_language,
    chapter_count, publication_status, source_url, raw_file_id, raw_file_name,
    raw_file_mime, genres_tags, sexual_content, sensitive_content, notes,
    plan, status, slot_returned, admin_summary_sent, admin_file_sent,
    quota_source, referral_id, created_at, updated_at
  `;

  const commonValues = [
    input.userId,
    input.username,
    input.locale,
    input.monthKey,
    input.title,
    input.originalLanguage,
    input.chapterCount,
    input.publicationStatus,
    input.sourceUrl,
    input.rawFileId,
    input.rawFileName,
    input.rawFileMime,
    input.genresTags,
    input.sexualContent,
    input.sensitiveContent,
    input.notes,
    input.plan,
    input.adminSummarySent ?? 0,
    input.adminFileSent ?? 0,
  ];

  const baseInsert = await env.DB.prepare(`
    INSERT INTO submissions (${commonColumns})
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, 'base', NULL, ?, ?
    WHERE (
      SELECT COUNT(*) FROM submissions
      WHERE user_id = ? AND month_key = ? AND quota_source = 'base' AND slot_returned = 0
    ) < ?
  `).bind(
    ...commonValues,
    input.now,
    input.now,
    input.userId,
    input.monthKey,
    baseLimit,
  ).run();

  if ((baseInsert.meta.changes ?? 0) > 0) {
    return {
      submissionId: Number(baseInsert.meta.last_row_id),
      quotaSource: 'base',
      referralId: null,
    };
  }

  const referral = await findAvailableReferral(env, input.userId, input.monthKey, input.now);
  if (!referral) return null;

  const referralInsert = await env.DB.prepare(`
    INSERT INTO submissions (${commonColumns})
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, 'referral', ?, ?, ?
    WHERE (
      SELECT COUNT(*) FROM submissions
      WHERE user_id = ? AND month_key = ? AND quota_source = 'referral' AND slot_returned = 0
    ) < ?
      AND EXISTS (
        SELECT 1 FROM referrals r
        WHERE r.id = ?
          AND r.referrer_user_id = ?
          AND r.status = 'qualified'
          AND r.reward_granted = 1
          AND (
            r.reward_expires_at >= ?
            OR EXISTS (
              SELECT 1 FROM submissions returned
              WHERE returned.referral_id = r.id AND returned.slot_returned = 1
            )
          )
          AND NOT EXISTS (
            SELECT 1 FROM submissions used
            WHERE used.referral_id = r.id AND used.slot_returned = 0
          )
      )
  `).bind(
    ...commonValues,
    referral.id,
    input.now,
    input.now,
    input.userId,
    input.monthKey,
    REFERRAL_MONTHLY_SLOT_CAP,
    referral.id,
    input.userId,
    input.now,
  ).run();

  if ((referralInsert.meta.changes ?? 0) === 0) return null;
  return {
    submissionId: Number(referralInsert.meta.last_row_id),
    quotaSource: 'referral',
    referralId: referral.id,
  };
}

async function findAvailableReferral(
  env: Env,
  userId: number,
  monthKey: string,
  now: string,
): Promise<{ id: number } | null> {
  const monthlyUsed = await env.DB.prepare(`
    SELECT COUNT(*) AS count
    FROM submissions
    WHERE user_id = ? AND month_key = ? AND quota_source = 'referral' AND slot_returned = 0
  `).bind(userId, monthKey).first<{ count: number }>();
  if (Number(monthlyUsed?.count ?? 0) >= REFERRAL_MONTHLY_SLOT_CAP) return null;

  return env.DB.prepare(`
    SELECT r.id
    FROM referrals r
    WHERE r.referrer_user_id = ?
      AND r.status = 'qualified'
      AND r.reward_granted = 1
      AND (
        r.reward_expires_at >= ?
        OR EXISTS (
          SELECT 1 FROM submissions returned
          WHERE returned.referral_id = r.id AND returned.slot_returned = 1
        )
      )
      AND NOT EXISTS (
        SELECT 1 FROM submissions used
        WHERE used.referral_id = r.id AND used.slot_returned = 0
      )
    ORDER BY r.reward_expires_at ASC, r.id ASC
    LIMIT 1
  `).bind(userId, now).first<{ id: number }>();
}
