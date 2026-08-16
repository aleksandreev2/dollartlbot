import { scannerHealth } from './asset-security';
import { authenticateMiniAppRequest, miniAppJsonError } from './miniapp-auth';

const CONFIG_PATH = '/api/app/admin/security/config';
const MAX_CONFIG_BYTES = 64 * 1024;

export async function guardAssetScanEnforcementConfig(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== CONFIG_PATH) return null;

  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_CONFIG_BYTES) {
    return miniAppJsonError('config_too_large', 'Security configuration payload is too large.', 413);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.clone().json<Record<string, unknown>>();
  } catch {
    return null;
  }
  if (!('asset_scan_enforcement' in body) || !truthy(body.asset_scan_enforcement)) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  const health = await scannerHealth(env);
  if (!health.ready) {
    return miniAppJsonError(
      'scanner_not_ready',
      'AV enforcement cannot be enabled until the ClamAV scanner is healthy and reporting fresh heartbeats.',
      409,
      { scanner: health.scanner, stale: health.stale },
    );
  }

  const backlog = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM publication_assets a
    JOIN publications p ON p.id=a.publication_id
    WHERE p.status='published'
      AND p.telegram_deleted_at IS NULL
      AND COALESCE(p.download_gate_status,'disabled')<>'legacy'
      AND a.scan_status NOT IN ('clean','infected','suspicious')
  `).first<{ n: number }>();
  const pending = Number(backlog?.n || 0);
  if (pending > 0) {
    return miniAppJsonError(
      'scanner_backfill_incomplete',
      `AV enforcement cannot be enabled yet: ${pending} protected file(s) still need a final scan verdict.`,
      409,
      { pending_files: pending },
    );
  }

  return null;
}

function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return ['1','true','yes','on'].includes(String(value ?? '').trim().toLowerCase());
}
