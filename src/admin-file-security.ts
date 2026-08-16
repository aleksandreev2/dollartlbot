import { scannerHealth } from './asset-security';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

const PATH = '/api/app/admin/security/scanner';
const MAX_BODY_BYTES = 16 * 1024;

export async function handleAdminFileSecurityRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== PATH || !['GET','POST'].includes(request.method)) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (request.method === 'GET') return report(env);

  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return miniAppJsonError('payload_too_large', 'Scanner action payload is too large.', 413);
  }
  let body: Record<string, unknown>;
  try {
    body = await request.json<Record<string, unknown>>();
  } catch {
    return miniAppJsonError('invalid_json', 'Request body must be JSON.', 400);
  }

  const action = String(body.action || '').trim();
  if (action === 'retry_failed') {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`
      UPDATE publication_assets SET
        scan_status='pending',scan_attempts=0,scan_claimed_at=NULL,scan_next_attempt_at=?,scan_error=NULL
      WHERE scan_status='failed'
    `).bind(now).run();
    return miniAppJson({ ok: true, action, changed: Number(result.meta.changes || 0) });
  }

  if (action === 'rescan_asset') {
    const assetId = positiveInteger(body.asset_id);
    if (!assetId) return miniAppJsonError('invalid_asset', 'Valid asset_id is required.', 400);
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`
      UPDATE publication_assets SET
        scan_status='pending',scan_attempts=0,scan_claimed_at=NULL,scan_next_attempt_at=?,scan_error=NULL
      WHERE id=?
    `).bind(now, assetId).run();
    if ((result.meta.changes || 0) !== 1) return miniAppJsonError('not_found', 'Asset not found.', 404);
    return miniAppJson({ ok: true, action, asset_id: assetId });
  }

  if (action === 'backfill') {
    const now = new Date().toISOString();
    const result = await env.DB.prepare(`
      UPDATE publication_assets SET
        scan_status='pending',scan_attempts=0,scan_claimed_at=NULL,scan_next_attempt_at=?,scan_error=NULL
      WHERE scan_status IN ('legacy_unscanned','failed')
    `).bind(now).run();
    return miniAppJson({ ok: true, action, changed: Number(result.meta.changes || 0) });
  }

  return miniAppJsonError('invalid_action', 'Use retry_failed, rescan_asset or backfill.', 400);
}

async function report(env: Env): Promise<Response> {
  const [health, summary, queue, quarantine, recent] = await Promise.all([
    scannerHealth(env),
    env.DB.prepare(`
      SELECT scan_status,COUNT(*) AS count,COALESCE(SUM(size_bytes),0) AS bytes
      FROM publication_assets GROUP BY scan_status ORDER BY count DESC
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN scan_status IN ('pending','legacy_unscanned') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN scan_status='scanning' THEN 1 ELSE 0 END) AS scanning,
        SUM(CASE WHEN scan_status='failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN scan_status='clean' THEN 1 ELSE 0 END) AS clean
      FROM publication_assets
    `).first<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS count
      FROM publication_assets
      WHERE quarantined_at IS NOT NULL OR scan_status IN ('infected','suspicious')
    `).first<{ count: number }>(),
    env.DB.prepare(`
      SELECT a.id,a.publication_id,a.file_name,a.size_bytes,a.sha256,a.scan_status,a.scan_attempts,
             a.scan_engine,a.scan_engine_version,a.scan_signatures_version,a.scan_threat_name,
             a.scanned_at,a.scan_error,a.scan_claimed_at,a.scan_next_attempt_at,
             a.quarantined_at,a.quarantine_reason,
             COALESCE(NULLIF(s.title,''),NULLIF(p.internal_title,''),'Release #'||p.id) AS publication_title
      FROM publication_assets a
      JOIN publications p ON p.id=a.publication_id
      LEFT JOIN submissions s ON s.id=p.submission_id
      ORDER BY COALESCE(a.scanned_at,a.scan_last_attempt_at,a.created_at) DESC,a.id DESC
      LIMIT 80
    `).all<Record<string, unknown>>(),
  ]);

  return miniAppJson({
    health,
    summary: summary.results,
    queue: {
      pending: Number(queue?.pending || 0),
      scanning: Number(queue?.scanning || 0),
      failed: Number(queue?.failed || 0),
      clean: Number(queue?.clean || 0),
      quarantined: Number(quarantine?.count || 0),
    },
    recent: recent.results,
  });
}

function positiveInteger(value: unknown): number | null {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
