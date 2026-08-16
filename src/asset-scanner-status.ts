import { safeSecretEqual } from './db';
import { miniAppJson } from './miniapp-auth';
import { getRuntimeSetting } from './runtime-settings';

const PATH = '/internal/asset-scan/status';
type ScannerEnv = Env & { ASSET_SCANNER_TOKEN?: string };

export async function handleAssetScannerStatusRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return null;
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });

  const expected = String((env as ScannerEnv).ASSET_SCANNER_TOKEN || '').trim();
  const supplied = request.headers.get('authorization') || '';
  if (!expected || !(await safeSecretEqual(supplied, `Bearer ${expected}`))) {
    return new Response('Unauthorized', { status: 401 });
  }

  const maxAttempts = bounded(await getRuntimeSetting(env, 'asset_scan_max_attempts', '5'), 5, 1, 20);
  const claimTimeout = bounded(await getRuntimeSetting(env, 'asset_scan_claim_timeout_seconds', '900'), 900, 60, 7200);
  const now = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - claimTimeout * 1000).toISOString();
  const row = await env.DB.prepare(`
    SELECT
      COUNT(*) AS runnable,
      SUM(CASE WHEN scan_status IN ('pending','legacy_unscanned') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN scan_status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN scan_status='scanning' THEN 1 ELSE 0 END) AS scanning
    FROM publication_assets
    WHERE
      quarantined_at IS NULL
      AND scan_attempts<?
      AND (
        scan_status IN ('pending','legacy_unscanned')
        OR (scan_status='failed' AND (scan_next_attempt_at IS NULL OR scan_next_attempt_at<=?))
        OR (scan_status='scanning' AND scan_claimed_at IS NOT NULL AND scan_claimed_at<=?)
      )
  `).bind(maxAttempts, now, staleCutoff).first<Record<string, number>>();

  return miniAppJson({
    runnable: Number(row?.runnable || 0),
    pending: Number(row?.pending || 0),
    failed: Number(row?.failed || 0),
    scanning: Number(row?.scanning || 0),
  });
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}
