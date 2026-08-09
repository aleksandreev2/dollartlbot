import { currentMonthKey } from './db';

export const REFERRAL_MONTHLY_SLOT_CAP = 3;
const SUBMISSION_RESERVATION_TTL_MS = 30 * 60 * 1000;

export type QuotaState = {
  baseLimit: number;
  adminAdjustment: number;
  effectiveBaseLimit: number;
  baseUsed: number;
  referralUsed: number;
  referralAvailable: number;
  referralBonus: number;
  used: number;
  limit: number;
  remaining: number;
  unlimited: boolean;
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

export type SubmissionQuotaReservation = {
  id: number;
  requestId: string;
  quotaSource: 'base' | 'referral';
  referralId: number | null;
  rawFileId: string | null;
  rawFileName: string | null;
  rawFileMime: string | null;
  expiresAt: string;
};

export type SubmissionReservationResult =
  | { status: 'reserved'; reservation: SubmissionQuotaReservation }
  | { status: 'committed'; submissionId: number }
  | { status: 'in_progress' }
  | { status: 'payload_mismatch' }
  | null;

type AdminQuotaConfig = {
  unlimited: boolean;
  adjustment: number;
};

type ReservationRow = {
  id: number;
  request_id: string;
  payload_fingerprint: string;
  quota_source: 'base' | 'referral';
  referral_id: number | null;
  state: 'reserved' | 'committed' | 'failed';
  raw_file_id: string | null;
  raw_file_name: string | null;
  raw_file_mime: string | null;
  submission_id: number | null;
  expires_at: string;
};

export async function getQuotaState(
  env: Env,
  userId: number,
  baseLimit: number,
  date = new Date(),
): Promise<QuotaState> {
  const monthKey = currentMonthKey(date);
  const now = date.toISOString();

  const [usage, rewards, admin] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COALESCE((
          SELECT SUM(CASE WHEN quota_source = 'base' AND slot_returned = 0 THEN 1 ELSE 0 END)
          FROM submissions
          WHERE user_id = ? AND month_key = ?
        ), 0) + COALESCE((
          SELECT COUNT(*)
          FROM submission_intake_reservations
          WHERE user_id = ? AND month_key = ? AND quota_source = 'base'
            AND state = 'reserved' AND expires_at > ?
        ), 0) AS base_used,
        COALESCE((
          SELECT SUM(CASE WHEN quota_source = 'referral' AND slot_returned = 0 THEN 1 ELSE 0 END)
          FROM submissions
          WHERE user_id = ? AND month_key = ?
        ), 0) + COALESCE((
          SELECT COUNT(*)
          FROM submission_intake_reservations
          WHERE user_id = ? AND month_key = ? AND quota_source = 'referral'
            AND state = 'reserved' AND expires_at > ?
        ), 0) AS referral_used
    `).bind(
      userId,
      monthKey,
      userId,
      monthKey,
      now,
      userId,
      monthKey,
      userId,
      monthKey,
      now,
    ).first<{ base_used: number | null; referral_used: number | null }>(),
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
        AND NOT EXISTS (
          SELECT 1 FROM submission_intake_reservations sr
          WHERE sr.referral_id = r.id
            AND sr.state = 'reserved'
            AND sr.expires_at > ?
        )
        AND (
          r.reward_expires_at >= ?
          OR EXISTS (
            SELECT 1 FROM submissions returned
            WHERE returned.referral_id = r.id AND returned.slot_returned = 1
          )
        )
    `).bind(userId, now, now).first<{ count: number }>(),
    getAdminQuotaConfig(env, userId, monthKey),
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
  const effectiveBaseLimit = Math.max(0, baseLimit + admin.adjustment);
  const used = baseUsed + referralUsed;
  const limit = effectiveBaseLimit + referralBonus;

  return {
    baseLimit,
    adminAdjustment: admin.adjustment,
    effectiveBaseLimit,
    baseUsed,
    referralUsed,
    referralAvailable,
    referralBonus,
    used,
    limit,
    remaining: admin.unlimited ? 999 : Math.max(0, limit - used),
    unlimited: admin.unlimited,
  };
}

export async function reserveSubmissionQuota(
  env: Env,
  input: {
    userId: number;
    requestId: string;
    payloadFingerprint: string;
    monthKey: string;
    baseLimit: number;
    now: string;
  },
): Promise<SubmissionReservationResult> {
  const alreadyCommitted = await env.DB.prepare(`
    SELECT id
    FROM submissions
    WHERE user_id = ? AND client_request_id = ?
    LIMIT 1
  `).bind(input.userId, input.requestId).first<{ id: number }>();
  if (alreadyCommitted?.id) return { status: 'committed', submissionId: Number(alreadyCommitted.id) };

  const existing = await getReservationByRequest(env, input.userId, input.requestId);
  if (existing) {
    if (existing.payload_fingerprint !== input.payloadFingerprint) return { status: 'payload_mismatch' };
    if (existing.state === 'committed' && existing.submission_id) {
      return { status: 'committed', submissionId: Number(existing.submission_id) };
    }
    if (existing.state === 'reserved' && existing.expires_at > input.now) {
      if (existing.raw_file_id) return { status: 'reserved', reservation: toReservation(existing) };
      return { status: 'in_progress' };
    }
    await env.DB.prepare(`
      DELETE FROM submission_intake_reservations
      WHERE id = ? AND state <> 'committed'
    `).bind(existing.id).run();
  }

  const expiresAt = new Date(new Date(input.now).getTime() + SUBMISSION_RESERVATION_TTL_MS).toISOString();
  const admin = await getAdminQuotaConfig(env, input.userId, input.monthKey);
  const effectiveBaseLimit = Math.max(0, input.baseLimit + admin.adjustment);

  const baseReservation = admin.unlimited
    ? await env.DB.prepare(`
        INSERT OR IGNORE INTO submission_intake_reservations (
          user_id, request_id, payload_fingerprint, month_key, quota_source,
          referral_id, state, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'base', NULL, 'reserved', ?, ?, ?)
      `).bind(
        input.userId,
        input.requestId,
        input.payloadFingerprint,
        input.monthKey,
        expiresAt,
        input.now,
        input.now,
      ).run()
    : await env.DB.prepare(`
        INSERT INTO submission_intake_reservations (
          user_id, request_id, payload_fingerprint, month_key, quota_source,
          referral_id, state, expires_at, created_at, updated_at
        )
        SELECT ?, ?, ?, ?, 'base', NULL, 'reserved', ?, ?, ?
        WHERE (
          SELECT COUNT(*)
          FROM submissions
          WHERE user_id = ? AND month_key = ? AND quota_source = 'base' AND slot_returned = 0
        ) + (
          SELECT COUNT(*)
          FROM submission_intake_reservations
          WHERE user_id = ? AND month_key = ? AND quota_source = 'base'
            AND state = 'reserved' AND expires_at > ?
        ) < ?
      `).bind(
        input.userId,
        input.requestId,
        input.payloadFingerprint,
        input.monthKey,
        expiresAt,
        input.now,
        input.now,
        input.userId,
        input.monthKey,
        input.userId,
        input.monthKey,
        input.now,
        effectiveBaseLimit,
      ).run();

  if (Number(baseReservation.meta.changes ?? 0) === 1) {
    const row = await getReservationByRequest(env, input.userId, input.requestId);
    return row ? { status: 'reserved', reservation: toReservation(row) } : null;
  }

  let referralReservation: D1Result<unknown>;
  try {
    referralReservation = await env.DB.prepare(`
      INSERT INTO submission_intake_reservations (
        user_id, request_id, payload_fingerprint, month_key, quota_source,
        referral_id, state, expires_at, created_at, updated_at
      )
      SELECT ?, ?, ?, ?, 'referral', r.id, 'reserved', ?, ?, ?
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
        AND NOT EXISTS (
          SELECT 1 FROM submission_intake_reservations active
          WHERE active.referral_id = r.id
            AND active.state = 'reserved'
            AND active.expires_at > ?
        )
        AND (
          SELECT COUNT(*)
          FROM submissions
          WHERE user_id = ? AND month_key = ? AND quota_source = 'referral' AND slot_returned = 0
        ) + (
          SELECT COUNT(*)
          FROM submission_intake_reservations
          WHERE user_id = ? AND month_key = ? AND quota_source = 'referral'
            AND state = 'reserved' AND expires_at > ?
        ) < ?
      ORDER BY r.reward_expires_at ASC, r.id ASC
      LIMIT 1
    `).bind(
      input.userId,
      input.requestId,
      input.payloadFingerprint,
      input.monthKey,
      expiresAt,
      input.now,
      input.now,
      input.userId,
      input.now,
      input.now,
      input.userId,
      input.monthKey,
      input.userId,
      input.monthKey,
      input.now,
      REFERRAL_MONTHLY_SLOT_CAP,
    ).run();
  } catch {
    return null;
  }

  if (Number(referralReservation.meta.changes ?? 0) !== 1) return null;
  const row = await getReservationByRequest(env, input.userId, input.requestId);
  return row ? { status: 'reserved', reservation: toReservation(row) } : null;
}

export async function attachFileToSubmissionReservation(
  env: Env,
  reservationId: number,
  file: { id: string; name: string | null; mime: string | null },
): Promise<boolean> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SUBMISSION_RESERVATION_TTL_MS).toISOString();
  const result = await env.DB.prepare(`
    UPDATE submission_intake_reservations
    SET raw_file_id = ?, raw_file_name = ?, raw_file_mime = ?,
        expires_at = ?, last_error = NULL, updated_at = ?
    WHERE id = ? AND state = 'reserved'
  `).bind(file.id, file.name, file.mime, expiresAt, now, reservationId).run();
  return Number(result.meta.changes ?? 0) === 1;
}

export async function failSubmissionReservation(
  env: Env,
  reservationId: number,
  error: string,
): Promise<void> {
  await env.DB.prepare(`
    UPDATE submission_intake_reservations
    SET state = 'failed', last_error = ?, updated_at = ?
    WHERE id = ? AND state = 'reserved' AND raw_file_id IS NULL
  `).bind(error.slice(0, 1000), new Date().toISOString(), reservationId).run();
}

export async function commitSubmissionReservation(
  env: Env,
  reservationId: number,
  requestId: string,
  payloadFingerprint: string,
  input: Omit<SubmissionInsertInput, 'rawFileId' | 'rawFileName' | 'rawFileMime'>,
): Promise<SubmissionInsertResult> {
  const existing = await env.DB.prepare(`
    SELECT id, quota_source, referral_id
    FROM submissions
    WHERE user_id = ? AND client_request_id = ?
    LIMIT 1
  `).bind(input.userId, requestId).first<{ id: number; quota_source: 'base' | 'referral'; referral_id: number | null }>();
  if (existing?.id) {
    return {
      submissionId: Number(existing.id),
      quotaSource: existing.quota_source,
      referralId: existing.referral_id == null ? null : Number(existing.referral_id),
    };
  }

  const reservation = await env.DB.prepare(`
    SELECT id, quota_source, referral_id, raw_file_id, raw_file_name, raw_file_mime
    FROM submission_intake_reservations
    WHERE id = ? AND user_id = ? AND request_id = ? AND payload_fingerprint = ?
      AND state = 'reserved' AND raw_file_id IS NOT NULL
    LIMIT 1
  `).bind(
    reservationId,
    input.userId,
    requestId,
    payloadFingerprint,
  ).first<{
    id: number;
    quota_source: 'base' | 'referral';
    referral_id: number | null;
    raw_file_id: string;
    raw_file_name: string | null;
    raw_file_mime: string | null;
  }>();
  if (!reservation) throw new Error('Submission reservation is not ready to commit.');

  const sourceUrl = safeHttpUrl(input.sourceUrl);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO submissions (
        user_id, username_snapshot, language, month_key, title, original_language,
        chapter_count, publication_status, source_url, raw_file_id, raw_file_name,
        raw_file_mime, genres_tags, sexual_content, sensitive_content, notes,
        plan, status, slot_returned, admin_summary_sent, admin_file_sent,
        quota_source, referral_id, client_request_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, 1, ?, ?, ?, ?, ?)
    `).bind(
      input.userId,
      input.username,
      input.locale,
      input.monthKey,
      input.title,
      input.originalLanguage,
      input.chapterCount,
      input.publicationStatus,
      sourceUrl,
      reservation.raw_file_id,
      reservation.raw_file_name,
      reservation.raw_file_mime,
      input.genresTags,
      input.sexualContent,
      input.sensitiveContent,
      input.notes,
      input.plan,
      reservation.quota_source,
      reservation.referral_id,
      requestId,
      input.now,
      input.now,
    ),
    env.DB.prepare(`
      UPDATE submission_intake_reservations
      SET state = 'committed',
          submission_id = (
            SELECT id FROM submissions WHERE user_id = ? AND client_request_id = ? LIMIT 1
          ),
          expires_at = ?, last_error = NULL, updated_at = ?
      WHERE id = ? AND user_id = ? AND request_id = ? AND state = 'reserved'
        AND EXISTS (
          SELECT 1 FROM submissions WHERE user_id = ? AND client_request_id = ?
        )
    `).bind(
      input.userId,
      requestId,
      input.now,
      input.now,
      reservationId,
      input.userId,
      requestId,
      input.userId,
      requestId,
    ),
  ]);

  const committed = await env.DB.prepare(`
    SELECT id, quota_source, referral_id
    FROM submissions
    WHERE user_id = ? AND client_request_id = ?
    LIMIT 1
  `).bind(input.userId, requestId).first<{ id: number; quota_source: 'base' | 'referral'; referral_id: number | null }>();
  if (!committed?.id) throw new Error('Submission reservation commit did not create a submission.');

  return {
    submissionId: Number(committed.id),
    quotaSource: committed.quota_source,
    referralId: committed.referral_id == null ? null : Number(committed.referral_id),
  };
}

export async function cleanupExpiredSubmissionReservations(env: Env, date = new Date()): Promise<void> {
  const now = date.toISOString();
  await env.DB.prepare(`
    UPDATE submission_intake_reservations
    SET state = 'failed', last_error = COALESCE(last_error, 'reservation_expired'), updated_at = ?
    WHERE state = 'reserved' AND expires_at <= ?
  `).bind(now, now).run();
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
    safeHttpUrl(input.sourceUrl),
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

  const admin = await getAdminQuotaConfig(env, input.userId, input.monthKey);
  const effectiveBaseLimit = Math.max(0, baseLimit + admin.adjustment);

  const baseInsert = admin.unlimited
    ? await env.DB.prepare(`
        INSERT INTO submissions (${commonColumns})
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, 'base', NULL, ?, ?)
      `).bind(...commonValues, input.now, input.now).run()
    : await env.DB.prepare(`
        INSERT INTO submissions (${commonColumns})
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, 'base', NULL, ?, ?
        WHERE (
          SELECT COUNT(*) FROM submissions
          WHERE user_id = ? AND month_key = ? AND quota_source = 'base' AND slot_returned = 0
        ) + (
          SELECT COUNT(*) FROM submission_intake_reservations
          WHERE user_id = ? AND month_key = ? AND quota_source = 'base'
            AND state = 'reserved' AND expires_at > ?
        ) < ?
      `).bind(
        ...commonValues,
        input.now,
        input.now,
        input.userId,
        input.monthKey,
        input.userId,
        input.monthKey,
        input.now,
        effectiveBaseLimit,
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
    ) + (
      SELECT COUNT(*) FROM submission_intake_reservations
      WHERE user_id = ? AND month_key = ? AND quota_source = 'referral'
        AND state = 'reserved' AND expires_at > ?
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
          AND NOT EXISTS (
            SELECT 1 FROM submission_intake_reservations active
            WHERE active.referral_id = r.id
              AND active.state = 'reserved'
              AND active.expires_at > ?
          )
      )
  `).bind(
    ...commonValues,
    referral.id,
    input.now,
    input.now,
    input.userId,
    input.monthKey,
    input.userId,
    input.monthKey,
    input.now,
    REFERRAL_MONTHLY_SLOT_CAP,
    referral.id,
    input.userId,
    input.now,
    input.now,
  ).run();

  if ((referralInsert.meta.changes ?? 0) === 0) return null;
  return {
    submissionId: Number(referralInsert.meta.last_row_id),
    quotaSource: 'referral',
    referralId: referral.id,
  };
}

async function getAdminQuotaConfig(env: Env, userId: number, monthKey: string): Promise<AdminQuotaConfig> {
  const row = await env.DB.prepare(`
    SELECT
      COALESCE(u.quota_unlimited, 0) AS quota_unlimited,
      COALESCE((SELECT SUM(q.delta) FROM quota_events q WHERE q.user_id = u.telegram_id AND q.month_key = ?), 0) AS adjustment
    FROM users u
    WHERE u.telegram_id = ?
  `).bind(monthKey, userId).first<{ quota_unlimited: number; adjustment: number | null }>();
  return {
    unlimited: Number(row?.quota_unlimited ?? 0) === 1,
    adjustment: Number(row?.adjustment ?? 0),
  };
}

async function findAvailableReferral(
  env: Env,
  userId: number,
  monthKey: string,
  now: string,
): Promise<{ id: number } | null> {
  const monthlyUsed = await env.DB.prepare(`
    SELECT (
      SELECT COUNT(*)
      FROM submissions
      WHERE user_id = ? AND month_key = ? AND quota_source = 'referral' AND slot_returned = 0
    ) + (
      SELECT COUNT(*)
      FROM submission_intake_reservations
      WHERE user_id = ? AND month_key = ? AND quota_source = 'referral'
        AND state = 'reserved' AND expires_at > ?
    ) AS count
  `).bind(userId, monthKey, userId, monthKey, now).first<{ count: number }>();
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
      AND NOT EXISTS (
        SELECT 1 FROM submission_intake_reservations active
        WHERE active.referral_id = r.id
          AND active.state = 'reserved'
          AND active.expires_at > ?
      )
    ORDER BY r.reward_expires_at ASC, r.id ASC
    LIMIT 1
  `).bind(userId, now, now).first<{ id: number }>();
}

async function getReservationByRequest(
  env: Env,
  userId: number,
  requestId: string,
): Promise<ReservationRow | null> {
  return env.DB.prepare(`
    SELECT id, request_id, payload_fingerprint, quota_source, referral_id, state,
           raw_file_id, raw_file_name, raw_file_mime, submission_id, expires_at
    FROM submission_intake_reservations
    WHERE user_id = ? AND request_id = ?
    LIMIT 1
  `).bind(userId, requestId).first<ReservationRow>();
}

function toReservation(row: ReservationRow): SubmissionQuotaReservation {
  return {
    id: Number(row.id),
    requestId: row.request_id,
    quotaSource: row.quota_source,
    referralId: row.referral_id == null ? null : Number(row.referral_id),
    rawFileId: row.raw_file_id,
    rawFileName: row.raw_file_name,
    rawFileMime: row.raw_file_mime,
    expiresAt: row.expires_at,
  };
}

function safeHttpUrl(value: string | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}
