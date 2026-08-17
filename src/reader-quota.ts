import { getRuntimeSettings, runtimeNumber } from './runtime-settings';

export type ReaderQuotaMode = 'off' | 'monitor' | 'enforce';

export type ReaderQuotaReservation = {
  allowed: boolean;
  wouldBlock: boolean;
  alreadyCounted: boolean;
  mode: ReaderQuotaMode;
  limit: number;
  used: number;
  reservationToken: string | null;
  dayKey: string;
};

const RESERVATION_TTL_MS = 5 * 60_000;

export async function reserveDailyNovel(
  env: Env,
  userId: number,
  submissionId: number,
  now = new Date(),
): Promise<ReaderQuotaReservation> {
  const settings = await getRuntimeSettings(env, ['reader_daily_quota_mode', 'reader_daily_quota_limit']);
  const mode = normalizeMode(settings.reader_daily_quota_mode);
  const limit = runtimeNumber(settings, 'reader_daily_quota_limit', 5, 1, 100);
  const dayKey = utcDayKey(now);
  const nowIso = now.toISOString();

  await env.DB.prepare(`
    DELETE FROM reader_daily_reservations
    WHERE user_id=? AND expires_at<=?
  `).bind(userId, nowIso).run().catch(() => undefined);

  const existing = await env.DB.prepare(`
    SELECT 1 AS ok FROM reader_daily_titles
    WHERE day_key=? AND user_id=? AND submission_id=?
    LIMIT 1
  `).bind(dayKey, userId, submissionId).first<{ ok: number }>();
  const used = await countUsed(env, dayKey, userId, nowIso);
  if (existing) {
    return { allowed: true, wouldBlock: false, alreadyCounted: true, mode, limit, used, reservationToken: null, dayKey };
  }

  const wouldBlock = used >= limit;
  if (mode !== 'enforce') {
    return { allowed: true, wouldBlock, alreadyCounted: false, mode, limit, used, reservationToken: null, dayKey };
  }
  if (wouldBlock) {
    return { allowed: false, wouldBlock: true, alreadyCounted: false, mode, limit, used, reservationToken: null, dayKey };
  }

  const token = randomToken();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MS).toISOString();
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO reader_daily_reservations(
      day_key,user_id,submission_id,reservation_token,reserved_at,expires_at
    )
    SELECT ?,?,?,?,?,?
    WHERE (
      SELECT COUNT(*) FROM (
        SELECT submission_id FROM reader_daily_titles
        WHERE day_key=? AND user_id=?
        UNION
        SELECT submission_id FROM reader_daily_reservations
        WHERE day_key=? AND user_id=? AND expires_at>?
      )
    ) < ?
  `).bind(
    dayKey,userId,submissionId,token,nowIso,expiresAt,
    dayKey,userId,dayKey,userId,nowIso,limit,
  ).run();

  if ((inserted.meta.changes ?? 0) > 0) {
    return { allowed: true, wouldBlock: false, alreadyCounted: false, mode, limit, used, reservationToken: token, dayKey };
  }

  const raced = await env.DB.prepare(`
    SELECT reservation_token FROM reader_daily_reservations
    WHERE day_key=? AND user_id=? AND submission_id=? AND expires_at>?
    LIMIT 1
  `).bind(dayKey, userId, submissionId, nowIso).first<{ reservation_token: string }>();
  if (raced?.reservation_token) {
    return { allowed: true, wouldBlock: false, alreadyCounted: false, mode, limit, used, reservationToken: raced.reservation_token, dayKey };
  }

  return { allowed: false, wouldBlock: true, alreadyCounted: false, mode, limit, used: await countUsed(env, dayKey, userId, nowIso), reservationToken: null, dayKey };
}

export async function commitDailyNovel(
  env: Env,
  input: {
    userId: number;
    submissionId: number;
    publicationId: number;
    assetId: number;
    plan: 'free' | 'boosty';
    reservationToken?: string | null;
    deliveredAt?: string;
  },
): Promise<void> {
  const deliveredAt = input.deliveredAt || new Date().toISOString();
  const dayKey = deliveredAt.slice(0, 10);
  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO reader_daily_titles(
        day_key,user_id,submission_id,first_publication_id,first_asset_id,first_delivered_at,plan_snapshot
      ) VALUES (?,?,?,?,?,?,?)
    `).bind(dayKey,input.userId,input.submissionId,input.publicationId,input.assetId,deliveredAt,input.plan),
    env.DB.prepare(`
      DELETE FROM reader_daily_reservations
      WHERE user_id=? AND submission_id=? AND (? IS NULL OR reservation_token=?)
    `).bind(input.userId,input.submissionId,input.reservationToken || null,input.reservationToken || null),
  ]);
}

export async function releaseDailyNovelReservation(
  env: Env,
  userId: number,
  submissionId: number,
  reservationToken: string | null | undefined,
): Promise<void> {
  if (!reservationToken) return;
  await env.DB.prepare(`
    DELETE FROM reader_daily_reservations
    WHERE user_id=? AND submission_id=? AND reservation_token=?
  `).bind(userId, submissionId, reservationToken).run().catch(() => undefined);
}

export async function dailyNovelUsage(env: Env, userId: number, now = new Date()): Promise<{ dayKey: string; used: number }> {
  const dayKey = utcDayKey(now);
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM reader_daily_titles WHERE day_key=? AND user_id=?
  `).bind(dayKey, userId).first<{ count: number }>();
  return { dayKey, used: Number(row?.count || 0) };
}

async function countUsed(env: Env, dayKey: string, userId: number, nowIso: string): Promise<number> {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS count FROM (
      SELECT submission_id FROM reader_daily_titles
      WHERE day_key=? AND user_id=?
      UNION
      SELECT submission_id FROM reader_daily_reservations
      WHERE day_key=? AND user_id=? AND expires_at>?
    )
  `).bind(dayKey, userId, dayKey, userId, nowIso).first<{ count: number }>();
  return Number(row?.count || 0);
}

function normalizeMode(value: string): ReaderQuotaMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'enforce' || normalized === 'off') return normalized;
  return 'monitor';
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function randomToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}
