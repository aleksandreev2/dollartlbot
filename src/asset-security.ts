import { safeSecretEqual } from './db';
import { miniAppJson, miniAppJsonError } from './miniapp-auth';
import { getRuntimeSetting } from './runtime-settings';

const MAX_SCAN_RESULT_BYTES = 16 * 1024;
const MAX_CLAIM_BATCH = 5;
const SCAN_RESULT_PATH = '/internal/asset-scan/result';
const SCAN_PENDING_PATH = '/internal/asset-scan/pending';
const SCAN_HEARTBEAT_PATH = '/internal/asset-scan/heartbeat';
const SCAN_CONTENT_RE = /^\/internal\/asset-scan\/assets\/(\d+)$/;

type ScannerEnv = Env & { ASSET_SCANNER_TOKEN?: string };

type ScanCacheRow = {
  verdict: string;
  detected_mime: string | null;
  engine: string;
  engine_version: string | null;
  signatures_version: string | null;
  threat_name: string | null;
  scanned_at: string;
  expires_at: string | null;
};

type ScannerResult = {
  asset_id?: unknown;
  sha256?: unknown;
  verdict?: unknown;
  detected_mime?: unknown;
  engine?: unknown;
  engine_version?: unknown;
  signatures_version?: unknown;
  threat_name?: unknown;
  scanned_at?: unknown;
  error?: unknown;
};

type ScannerHeartbeat = {
  scanner_id?: unknown;
  ready?: unknown;
  engine?: unknown;
  engine_version?: unknown;
  signatures_version?: unknown;
  last_scan_at?: unknown;
  error?: unknown;
};

type StoredAsset = {
  id: number;
  file_name: string;
  mime_type: string | null;
  r2_key: string;
  sha256: string | null;
};

type ClaimedAsset = {
  id: number;
  publication_id: number;
  file_name: string;
  mime_type: string | null;
  size_bytes: number;
  sha256: string | null;
  scan_attempts: number;
};

export async function capturePublicationAssetSecurity(
  response: Response,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  if (!response.ok) return;
  let responseData: any;
  try {
    responseData = await response.clone().json();
  } catch {
    return;
  }
  const publicationId = positiveInteger(
    responseData?.publication?.publication?.id
      ?? responseData?.publication?.id
      ?? responseData?.id,
  );
  if (!publicationId) return;
  ctx.waitUntil(hashStoredAssets(publicationId, env));
}

export async function handleAssetScannerRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const contentMatch = SCAN_CONTENT_RE.exec(url.pathname);
  const knownPath = Boolean(
    contentMatch
    || url.pathname === SCAN_RESULT_PATH
    || url.pathname === SCAN_PENDING_PATH
    || url.pathname === SCAN_HEARTBEAT_PATH,
  );
  if (!knownPath) return null;

  if (!(await scannerAuthorized(request, env as ScannerEnv))) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (url.pathname === SCAN_PENDING_PATH && request.method === 'GET') {
    const limit = clampInteger(url.searchParams.get('limit'), 1, 1, MAX_CLAIM_BATCH);
    const claimed: ClaimedAsset[] = [];
    for (let i = 0; i < limit; i += 1) {
      const asset = await claimNextAsset(env);
      if (!asset) break;
      claimed.push(asset);
    }
    return miniAppJson({ assets: claimed });
  }

  if (contentMatch && request.method === 'GET') {
    const assetId = Number(contentMatch[1]);
    const asset = await env.DB.prepare(`
      SELECT id,file_name,mime_type,r2_key,size_bytes,sha256,scan_status,quarantined_at
      FROM publication_assets WHERE id=?
    `).bind(assetId).first<Record<string, unknown>>();
    if (!asset) return new Response('Not found', { status: 404 });
    const object = await env.COVERS.get(String(asset.r2_key || ''));
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    headers.set('content-type', String(asset.mime_type || 'application/octet-stream'));
    headers.set('content-disposition', `attachment; filename="${safeHeaderName(String(asset.file_name || 'asset.bin'))}"`);
    headers.set('x-dollar-asset-id', String(assetId));
    if (asset.sha256) headers.set('x-dollar-sha256', String(asset.sha256));
    const objectSize = Number((object as R2ObjectBody & { size?: number }).size || asset.size_bytes || 0);
    if (Number.isFinite(objectSize) && objectSize > 0) headers.set('content-length', String(objectSize));
    headers.set('cache-control', 'private, no-store');
    return new Response(object.body, { headers });
  }

  if (url.pathname === SCAN_HEARTBEAT_PATH && request.method === 'POST') {
    const size = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(size) && size > MAX_SCAN_RESULT_BYTES) {
      return miniAppJsonError('heartbeat_too_large', 'Scanner heartbeat is too large.', 413);
    }
    let body: ScannerHeartbeat;
    try {
      body = await request.json<ScannerHeartbeat>();
    } catch {
      return miniAppJsonError('invalid_heartbeat', 'Scanner heartbeat must be JSON.', 400);
    }
    const heartbeat = normalizeHeartbeat(body);
    if (!heartbeat) return miniAppJsonError('invalid_heartbeat', 'Invalid scanner heartbeat.', 400);
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO asset_scanner_health(
        scanner_id,ready,engine,engine_version,signatures_version,last_seen_at,last_scan_at,last_error,metadata_json
      ) VALUES (?,?,?,?,?,?,?,?,NULL)
      ON CONFLICT(scanner_id) DO UPDATE SET
        ready=excluded.ready,
        engine=excluded.engine,
        engine_version=excluded.engine_version,
        signatures_version=excluded.signatures_version,
        last_seen_at=excluded.last_seen_at,
        last_scan_at=COALESCE(excluded.last_scan_at,asset_scanner_health.last_scan_at),
        last_error=excluded.last_error,
        metadata_json=NULL
    `).bind(
      heartbeat.scannerId,
      heartbeat.ready ? 1 : 0,
      heartbeat.engine,
      heartbeat.engineVersion,
      heartbeat.signaturesVersion,
      now,
      heartbeat.lastScanAt,
      heartbeat.error,
    ).run();
    return miniAppJson({ ok: true, scanner_id: heartbeat.scannerId, ready: heartbeat.ready, recorded_at: now });
  }

  if (url.pathname === SCAN_RESULT_PATH && request.method === 'POST') {
    const size = Number(request.headers.get('content-length') || 0);
    if (Number.isFinite(size) && size > MAX_SCAN_RESULT_BYTES) {
      return miniAppJsonError('scan_result_too_large', 'Scan result is too large.', 413);
    }
    let body: ScannerResult;
    try {
      body = await request.json<ScannerResult>();
    } catch {
      return miniAppJsonError('invalid_scan_result', 'Scan result must be JSON.', 400);
    }
    const result = normalizeScannerResult(body);
    if (!result) return miniAppJsonError('invalid_scan_result', 'Invalid scanner result.', 400);

    const asset = await env.DB.prepare(`
      SELECT id,sha256,scan_attempts FROM publication_assets WHERE id=?
    `).bind(result.assetId).first<{ id: number; sha256: string | null; scan_attempts: number }>();
    if (!asset) return miniAppJsonError('not_found', 'Asset not found.', 404);

    if (result.verdict === 'failed') {
      const retryAt = retryAtForAttempt(asset.scan_attempts || 1);
      await env.DB.prepare(`
        UPDATE publication_assets SET
          scan_status='failed',scan_claimed_at=NULL,scan_next_attempt_at=?,scan_error=?
        WHERE id=?
      `).bind(retryAt, result.error || 'Scanner failed without an error message.', result.assetId).run();
      return miniAppJson({ ok: true, asset_id: result.assetId, verdict: 'failed', retry_at: retryAt });
    }

    if (!result.sha256) return miniAppJsonError('sha256_required', 'Successful scanner verdict requires sha256.', 400);
    if (asset.sha256 && asset.sha256.toLowerCase() !== result.sha256) {
      return miniAppJsonError('sha256_mismatch', 'Scanner result does not match the current asset hash.', 409);
    }

    const now = result.scannedAt;
    const ttlDays = clampInteger(await getRuntimeSetting(env, 'asset_scan_cache_ttl_days', '7'), 7, 1, 90);
    const expiry = new Date(Date.parse(now) + ttlDays * 86_400_000).toISOString();
    const quarantined = result.verdict === 'infected' || result.verdict === 'suspicious';
    const quarantineReason = quarantined
      ? (result.threatName || `Scanner verdict: ${result.verdict}`)
      : null;

    const statements = [];
    if (!asset.sha256) {
      statements.push(env.DB.prepare(`
        UPDATE publication_assets SET sha256=? WHERE id=? AND sha256 IS NULL
      `).bind(result.sha256, result.assetId));
    }
    statements.push(
      env.DB.prepare(`
        INSERT INTO file_scan_cache(
          sha256,verdict,detected_mime,engine,engine_version,signatures_version,
          threat_name,scanned_at,expires_at,metadata_json
        ) VALUES (?,?,?,?,?,?,?,?,?,NULL)
        ON CONFLICT(sha256) DO UPDATE SET
          verdict=excluded.verdict,
          detected_mime=excluded.detected_mime,
          engine=excluded.engine,
          engine_version=excluded.engine_version,
          signatures_version=excluded.signatures_version,
          threat_name=excluded.threat_name,
          scanned_at=excluded.scanned_at,
          expires_at=excluded.expires_at,
          metadata_json=NULL
      `).bind(
        result.sha256,result.verdict,result.detectedMime,result.engine,result.engineVersion,
        result.signaturesVersion,result.threatName,now,expiry,
      ),
      env.DB.prepare(`
        UPDATE publication_assets SET
          sha256=COALESCE(sha256,?),detected_mime=?,scan_status=?,scan_engine=?,scan_engine_version=?,
          scan_signatures_version=?,scan_threat_name=?,scanned_at=?,scan_error=NULL,
          scan_claimed_at=NULL,scan_next_attempt_at=NULL,
          quarantined_at=?,quarantine_reason=?
        WHERE sha256=? OR id=?
      `).bind(
        result.sha256,
        result.detectedMime,
        result.verdict,
        result.engine,
        result.engineVersion,
        result.signaturesVersion,
        result.threatName,
        now,
        quarantined ? now : null,
        quarantineReason,
        result.sha256,
        result.assetId,
      ),
    );
    await env.DB.batch(statements);
    return miniAppJson({
      ok: true,
      asset_id: result.assetId,
      verdict: result.verdict,
      quarantined,
      cache_ttl_days: ttlDays,
    });
  }

  return new Response('Method not allowed', { status: 405 });
}

export async function scannerHealth(env: Env): Promise<{
  ready: boolean;
  stale: boolean;
  scanner: Record<string, unknown> | null;
}> {
  const scanner = await env.DB.prepare(`
    SELECT scanner_id,ready,engine,engine_version,signatures_version,last_seen_at,last_scan_at,last_error
    FROM asset_scanner_health
    ORDER BY last_seen_at DESC LIMIT 1
  `).first<Record<string, unknown>>();
  const staleSeconds = clampInteger(
    await getRuntimeSetting(env, 'asset_scan_scanner_stale_seconds', '300'),
    300,
    60,
    3600,
  );
  const lastSeen = scanner?.last_seen_at ? Date.parse(String(scanner.last_seen_at)) : 0;
  const stale = !lastSeen || lastSeen < Date.now() - staleSeconds * 1000;
  return { ready: Boolean(scanner && Number(scanner.ready) === 1 && !stale), stale, scanner: scanner || null };
}

async function claimNextAsset(env: Env): Promise<ClaimedAsset | null> {
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const claimTimeoutSeconds = clampInteger(
    await getRuntimeSetting(env, 'asset_scan_claim_timeout_seconds', '900'),
    900,
    60,
    7200,
  );
  const maxAttempts = clampInteger(await getRuntimeSetting(env, 'asset_scan_max_attempts', '5'), 5, 1, 20);
  const staleCutoff = new Date(nowMs - claimTimeoutSeconds * 1000).toISOString();

  return env.DB.prepare(`
    UPDATE publication_assets SET
      scan_status='scanning',
      scan_claimed_at=?,
      scan_last_attempt_at=?,
      scan_attempts=scan_attempts+1,
      scan_error=NULL
    WHERE id=(
      SELECT id FROM publication_assets
      WHERE
        quarantined_at IS NULL
        AND scan_attempts<?
        AND (
          scan_status IN ('pending','legacy_unscanned')
          OR (scan_status='failed' AND (scan_next_attempt_at IS NULL OR scan_next_attempt_at<=?))
          OR (scan_status='scanning' AND scan_claimed_at IS NOT NULL AND scan_claimed_at<=?)
        )
      ORDER BY
        CASE scan_status WHEN 'pending' THEN 0 WHEN 'legacy_unscanned' THEN 1 WHEN 'failed' THEN 2 ELSE 3 END,
        id
      LIMIT 1
    )
    RETURNING id,publication_id,file_name,mime_type,size_bytes,sha256,scan_attempts
  `).bind(now, now, maxAttempts, now, staleCutoff).first<ClaimedAsset>();
}

async function hashStoredAssets(publicationId: number, env: Env): Promise<void> {
  const assets = await env.DB.prepare(`
    SELECT id,file_name,mime_type,r2_key,sha256
    FROM publication_assets
    WHERE publication_id=?
    ORDER BY sort_order,id
  `).bind(publicationId).all<StoredAsset>();
  if (!assets.results.length) return;
  const now = new Date().toISOString();

  for (const asset of assets.results) {
    if (asset.sha256 && /^[a-f0-9]{64}$/i.test(asset.sha256)) {
      await env.DB.prepare(`
        UPDATE publication_assets SET scan_status=CASE
          WHEN scan_status='legacy_unscanned' THEN 'pending' ELSE scan_status END
        WHERE id=?
      `).bind(asset.id).run();
      continue;
    }
    try {
      const object = await env.COVERS.get(asset.r2_key);
      if (!object) throw new Error(`R2 object missing: ${asset.r2_key}`);
      const bytes = new Uint8Array(await object.arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      const detectedMime = detectMime(bytes, asset.mime_type || '', asset.file_name);
      const cached = await validCachedVerdict(env, sha256, now);
      const status = cached?.verdict || 'pending';
      const quarantined = status === 'infected' || status === 'suspicious';
      await env.DB.prepare(`
        UPDATE publication_assets SET
          sha256=?,detected_mime=?,scan_status=?,scan_engine=?,scan_engine_version=?,
          scan_signatures_version=?,scan_threat_name=?,scanned_at=?,scan_error=NULL,
          scan_claimed_at=NULL,scan_next_attempt_at=NULL,
          quarantined_at=?,quarantine_reason=?
        WHERE id=?
      `).bind(
        sha256,
        cached?.detected_mime || detectedMime,
        status,
        cached?.engine || null,
        cached?.engine_version || null,
        cached?.signatures_version || null,
        cached?.threat_name || null,
        cached?.scanned_at || null,
        quarantined ? now : null,
        quarantined ? (cached?.threat_name || `Cached scanner verdict: ${status}`) : null,
        asset.id,
      ).run();
    } catch (error) {
      await env.DB.prepare(`
        UPDATE publication_assets SET scan_status='pending',scan_error=? WHERE id=?
      `).bind(String(error).slice(0, 1000), asset.id).run().catch(() => undefined);
    }
  }
}

async function validCachedVerdict(env: Env, sha256: string, nowIso: string): Promise<ScanCacheRow | null> {
  return env.DB.prepare(`
    SELECT verdict,detected_mime,engine,engine_version,signatures_version,threat_name,scanned_at,expires_at
    FROM file_scan_cache
    WHERE sha256=? AND verdict IN ('clean','infected','suspicious') AND (expires_at IS NULL OR expires_at>?)
    LIMIT 1
  `).bind(sha256, nowIso).first<ScanCacheRow>();
}

async function scannerAuthorized(request: Request, env: ScannerEnv): Promise<boolean> {
  const expected = String(env.ASSET_SCANNER_TOKEN || '').trim();
  if (!expected) return false;
  const supplied = request.headers.get('authorization') || '';
  return safeSecretEqual(supplied, `Bearer ${expected}`);
}

function normalizeScannerResult(body: ScannerResult) {
  const assetId = positiveInteger(body.asset_id);
  const shaRaw = String(body.sha256 || '').trim().toLowerCase();
  const verdictRaw = String(body.verdict || '').trim().toLowerCase();
  const verdict = verdictRaw === 'clean' ? 'clean'
    : verdictRaw === 'infected' ? 'infected'
      : verdictRaw === 'suspicious' ? 'suspicious'
        : verdictRaw === 'failed' ? 'failed'
          : '';
  const engine = clean(body.engine, 80) || (verdict === 'failed' ? 'scanner' : '');
  const sha256 = /^[a-f0-9]{64}$/.test(shaRaw) ? shaRaw : null;
  if (!assetId || !verdict || !engine || (verdict !== 'failed' && !sha256)) return null;
  const date = body.scanned_at ? new Date(String(body.scanned_at)) : new Date();
  if (!Number.isFinite(date.getTime())) return null;
  return {
    assetId,
    sha256,
    verdict,
    detectedMime: clean(body.detected_mime, 120) || null,
    engine,
    engineVersion: clean(body.engine_version, 120) || null,
    signaturesVersion: clean(body.signatures_version, 120) || null,
    threatName: clean(body.threat_name, 240) || null,
    error: clean(body.error, 1000) || null,
    scannedAt: date.toISOString(),
  };
}

function normalizeHeartbeat(body: ScannerHeartbeat) {
  const scannerId = clean(body.scanner_id, 80);
  const engine = clean(body.engine, 80) || null;
  if (!scannerId) return null;
  const lastScanDate = body.last_scan_at ? new Date(String(body.last_scan_at)) : null;
  return {
    scannerId,
    ready: body.ready === true || String(body.ready).toLowerCase() === 'true' || String(body.ready) === '1',
    engine,
    engineVersion: clean(body.engine_version, 120) || null,
    signaturesVersion: clean(body.signatures_version, 120) || null,
    lastScanAt: lastScanDate && Number.isFinite(lastScanDate.getTime()) ? lastScanDate.toISOString() : null,
    error: clean(body.error, 1000) || null,
  };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = Uint8Array.from(bytes).buffer;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function detectMime(bytes: Uint8Array, declared: string, name: string): string {
  if (starts(bytes, [0x25,0x50,0x44,0x46,0x2d])) return 'application/pdf';
  if (starts(bytes, [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) return 'image/png';
  if (starts(bytes, [0xff,0xd8,0xff])) return 'image/jpeg';
  if (starts(bytes, [0x50,0x4b,0x03,0x04]) || starts(bytes, [0x50,0x4b,0x05,0x06]) || starts(bytes, [0x50,0x4b,0x07,0x08])) {
    const lower = name.toLowerCase();
    if (lower.endsWith('.epub')) return 'application/epub+zip';
    if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    return 'application/zip';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  return clean(declared, 120) || 'application/octet-stream';
}

function starts(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function retryAtForAttempt(attempt: number): string {
  const delays = [60, 5 * 60, 15 * 60, 60 * 60, 6 * 60 * 60];
  const seconds = delays[Math.max(0, Math.min(delays.length - 1, attempt - 1))];
  return new Date(Date.now() + seconds * 1000).toISOString();
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

function safeHeaderName(value: string): string {
  return value.replace(/["\\\r\n]/g, '_').slice(0, 180) || 'asset.bin';
}
