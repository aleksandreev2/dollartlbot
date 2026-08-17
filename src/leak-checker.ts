import { extractEpubFingerprint, sha256Hex } from './fingerprint/epub';

export type LeakMatch = {
  matched: boolean;
  confidence: 'unknown'|'high'|'very_high';
  evidenceSha256: string;
  distributionId: string | null;
  userId: number | null;
  username: string | null;
  assetId: number | null;
  publicationId: number | null;
  submissionId: number | null;
  title: string | null;
  deliveredAt: string | null;
  plan: string | null;
};

type MatchRow = {
  distribution_id: string;
  user_id: number;
  username: string | null;
  asset_id: number;
  publication_id: number;
  submission_id: number | null;
  title: string | null;
  delivered_at: string | null;
  plan_snapshot: string | null;
};

export async function identifyLeakedEpub(env: Env, source: ArrayBuffer | Uint8Array): Promise<LeakMatch> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const evidenceSha256 = await sha256Hex(bytes);
  let distributionId: string | null = null;
  try { distributionId = extractEpubFingerprint(bytes); } catch { /* malformed candidate can still match by SHA */ }

  let row: MatchRow | null = null;
  if (distributionId) {
    row = await env.DB.prepare(`
      SELECT
        i.distribution_id,i.user_id,u.username,
        pa.asset_id,a.publication_id,p.submission_id,s.title,
        d.delivered_at,dt.plan_snapshot
      FROM distribution_identities i
      LEFT JOIN users u ON u.telegram_id=i.user_id
      LEFT JOIN reader_personalized_assets pa ON pa.distribution_id=i.distribution_id
      LEFT JOIN publication_assets a ON a.id=pa.asset_id
      LEFT JOIN publications p ON p.id=a.publication_id
      LEFT JOIN submissions s ON s.id=p.submission_id
      LEFT JOIN publication_deliveries d ON d.asset_id=pa.asset_id AND d.user_id=i.user_id AND d.publication_id=a.publication_id
      LEFT JOIN reader_daily_titles dt ON dt.user_id=i.user_id AND dt.submission_id=p.submission_id
      WHERE i.distribution_id=?
      ORDER BY d.delivered_at DESC,dt.first_delivered_at DESC,pa.updated_at DESC LIMIT 1
    `).bind(distributionId).first<MatchRow>();
  }

  if (!row) {
    row = await env.DB.prepare(`
      SELECT
        pa.distribution_id,pa.user_id,u.username,
        pa.asset_id,a.publication_id,p.submission_id,s.title,
        d.delivered_at,dt.plan_snapshot
      FROM reader_personalized_assets pa
      LEFT JOIN users u ON u.telegram_id=pa.user_id
      JOIN publication_assets a ON a.id=pa.asset_id
      JOIN publications p ON p.id=a.publication_id
      LEFT JOIN submissions s ON s.id=p.submission_id
      LEFT JOIN publication_deliveries d ON d.asset_id=pa.asset_id AND d.user_id=pa.user_id AND d.publication_id=a.publication_id
      LEFT JOIN reader_daily_titles dt ON dt.user_id=pa.user_id AND dt.submission_id=p.submission_id
      WHERE pa.personalized_sha256=?
      ORDER BY d.delivered_at DESC,pa.updated_at DESC LIMIT 1
    `).bind(evidenceSha256).first<MatchRow>();
  }

  return {
    matched:Boolean(row),
    confidence:row ? (distributionId ? 'very_high' : 'high') : 'unknown',
    evidenceSha256,
    distributionId:row?.distribution_id || distributionId,
    userId:row ? Number(row.user_id) : null,
    username:row?.username || null,
    assetId:row ? Number(row.asset_id) : null,
    publicationId:row ? Number(row.publication_id) : null,
    submissionId:row?.submission_id === null || row?.submission_id === undefined ? null : Number(row.submission_id),
    title:row?.title || null,
    deliveredAt:row?.delivered_at || null,
    plan:row?.plan_snapshot || null,
  };
}

export async function recordLeakIncident(
  env: Env,
  match: LeakMatch,
  input: { sourceUrl?: string | null; reviewedBy?: number | null; notes?: string | null } = {},
): Promise<number> {
  const url = String(input.sourceUrl || '').trim().slice(0,2000) || null;
  let domain: string | null = null;
  if (url) { try { domain = new URL(url).hostname.toLowerCase().slice(0,255); } catch { domain = null; } }
  const result = await env.DB.prepare(`
    INSERT INTO leak_incidents(
      submission_id,publication_id,asset_id,distribution_id,matched_user_id,
      source_url,source_domain,evidence_sha256,confidence,status,discovered_at,reviewed_by,notes
    ) VALUES (?,?,?,?,?,?,?,?,?,'new',?,?,?)
  `).bind(
    match.submissionId,match.publicationId,match.assetId,match.distributionId,match.userId,
    url,domain,match.evidenceSha256,match.confidence,new Date().toISOString(),input.reviewedBy || null,String(input.notes || '').slice(0,2000) || null,
  ).run();
  return Number(result.meta.last_row_id || 0);
}
