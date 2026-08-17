import { getRuntimeSetting, runtimeFlag } from './runtime-settings';

export type ReaderGrantSource = 'telegram' | 'miniapp';

export async function createReaderDownloadGrant(
  env: Env,
  input: {
    userId: number;
    submissionId: number;
    publicationId: number;
    source: ReaderGrantSource;
  },
): Promise<{ id: number; expiresAt: string }> {
  const ttlMinutes = boundedNumber(await getRuntimeSetting(env, 'reader_download_grant_minutes', '15'), 15, 1, 120);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000).toISOString();

  // Re-clicking Thank you refreshes the user's short-lived entitlement instead
  // of accumulating an unbounded number of active grants for the same release.
  await env.DB.prepare(`
    DELETE FROM reader_download_grants
    WHERE user_id=? AND publication_id=? AND source=? AND expires_at>?
  `).bind(input.userId, input.publicationId, input.source, now.toISOString()).run();

  const result = await env.DB.prepare(`
    INSERT INTO reader_download_grants(
      user_id,submission_id,publication_id,source,granted_at,expires_at,consumed_at
    ) VALUES (?,?,?,?,?,?,NULL)
  `).bind(
    input.userId,input.submissionId,input.publicationId,input.source,now.toISOString(),expiresAt,
  ).run();
  return { id:Number(result.meta.last_row_id || 0), expiresAt };
}

export async function activeReaderDownloadGrant(
  env: Env,
  userId: number,
  publicationId: number,
): Promise<{ id: number; source: ReaderGrantSource; expiresAt: string } | null> {
  if (!(await runtimeFlag(env, 'reader_thank_you_enforcement', true))) {
    return { id:0, source:'telegram', expiresAt:'9999-12-31T23:59:59.999Z' };
  }
  const now = new Date().toISOString();
  const row = await env.DB.prepare(`
    SELECT id,source,expires_at
    FROM reader_download_grants
    WHERE user_id=? AND publication_id=? AND expires_at>?
    ORDER BY granted_at DESC,id DESC LIMIT 1
  `).bind(userId,publicationId,now).first<{ id:number; source:ReaderGrantSource; expires_at:string }>();
  return row ? { id:Number(row.id), source:row.source, expiresAt:row.expires_at } : null;
}

export async function markReaderDownloadGrantUsed(env: Env, grantId: number): Promise<void> {
  if (!grantId) return;
  await env.DB.prepare(`
    UPDATE reader_download_grants SET consumed_at=COALESCE(consumed_at,?) WHERE id=?
  `).bind(new Date().toISOString(),grantId).run().catch(() => undefined);
}

function boundedNumber(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min,Math.min(max,Math.round(parsed))) : fallback;
}
