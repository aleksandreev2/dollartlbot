import { miniAppJson, miniAppJsonError } from './miniapp-auth';

const MAX_SCAN_RESULT_BYTES = 16 * 1024;
const SCAN_RESULT_PATH = '/internal/asset-scan/result';
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
};

export async function capturePublicationAssetSecurity(
  request: Request<any, any>,
  response: Response,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/api/app/admin/publications' || !response.ok) return;

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

  const body = request.clone();
  ctx.waitUntil(hashUploadedFiles(body, publicationId, env));
}

export async function handleAssetScannerRequest(request: Request<any, any>, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const contentMatch = SCAN_CONTENT_RE.exec(url.pathname);
  if (!contentMatch && url.pathname !== SCAN_RESULT_PATH) return null;

  if (!scannerAuthorized(request, env as ScannerEnv)) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (contentMatch && request.method === 'GET') {
    const assetId = Number(contentMatch[1]);
    const asset = await env.DB.prepare(`
      SELECT id,file_name,mime_type,r2_key,size_bytes,sha256,scan_status
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
    headers.set('cache-control', 'private, no-store');
    return new Response(object.body, { headers });
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

    const asset = await env.DB.prepare(`SELECT id,sha256 FROM publication_assets WHERE id=?`)
      .bind(result.assetId).first<{ id: number; sha256: string | null }>();
    if (!asset) return miniAppJsonError('not_found', 'Asset not found.', 404);
    if (!asset.sha256 || asset.sha256.toLowerCase() !== result.sha256) {
      return miniAppJsonError('sha256_mismatch', 'Scanner result does not match the current asset hash.', 409);
    }

    const now = result.scannedAt;
    const expiry = new Date(Date.parse(now) + 7 * 86_400_000).toISOString();
    await env.DB.batch([
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
          detected_mime=?,scan_status=?,scan_engine=?,scan_engine_version=?,scan_signatures_version=?,
          scan_threat_name=?,scanned_at=?,scan_error=NULL
        WHERE sha256=?
      `).bind(
        result.detectedMime,result.verdict,result.engine,result.engineVersion,result.signaturesVersion,
        result.threatName,now,result.sha256,
      ),
    ]);
    return miniAppJson({ ok: true, asset_id: result.assetId, verdict: result.verdict });
  }

  return new Response('Method not allowed', { status: 405 });
}

async function hashUploadedFiles(request: Request<any, any>, publicationId: number, env: Env): Promise<void> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch (error) {
    console.warn(JSON.stringify({ event: 'asset_hash_form_failed', publication_id: publicationId, error: String(error) }));
    return;
  }
  const files = form.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return;

  const assets = await env.DB.prepare(`
    SELECT id,file_name,sort_order FROM publication_assets WHERE publication_id=? ORDER BY sort_order,id
  `).bind(publicationId).all<{ id: number; file_name: string; sort_order: number }>();
  const now = new Date().toISOString();

  for (let index = 0; index < Math.min(files.length, assets.results.length); index += 1) {
    const file = files[index];
    const asset = assets.results[index];
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const sha256 = await sha256Hex(bytes);
      const detectedMime = detectMime(bytes, file.type, file.name);
      const cached = await validCachedVerdict(env, sha256, now);
      const status = cached?.verdict || 'pending';
      await env.DB.prepare(`
        UPDATE publication_assets SET
          sha256=?,detected_mime=?,scan_status=?,scan_engine=?,scan_engine_version=?,
          scan_signatures_version=?,scan_threat_name=?,scanned_at=?,scan_error=NULL
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
        asset.id,
      ).run();
    } catch (error) {
      await env.DB.prepare(`
        UPDATE publication_assets SET scan_status='failed',scan_error=? WHERE id=?
      `).bind(String(error).slice(0, 1000), asset.id).run().catch(() => undefined);
    }
  }
}

async function validCachedVerdict(env: Env, sha256: string, nowIso: string): Promise<ScanCacheRow | null> {
  return env.DB.prepare(`
    SELECT verdict,detected_mime,engine,engine_version,signatures_version,threat_name,scanned_at,expires_at
    FROM file_scan_cache
    WHERE sha256=? AND (expires_at IS NULL OR expires_at>?)
    LIMIT 1
  `).bind(sha256, nowIso).first<ScanCacheRow>();
}

function scannerAuthorized(request: Request<any, any>, env: ScannerEnv): boolean {
  const expected = String(env.ASSET_SCANNER_TOKEN || '').trim();
  if (!expected) return false;
  const auth = request.headers.get('authorization') || '';
  return auth === `Bearer ${expected}`;
}

function normalizeScannerResult(body: ScannerResult) {
  const assetId = positiveInteger(body.asset_id);
  const sha256 = String(body.sha256 || '').trim().toLowerCase();
  const verdictRaw = String(body.verdict || '').trim().toLowerCase();
  const verdict = verdictRaw === 'clean' ? 'clean'
    : verdictRaw === 'infected' ? 'infected'
      : verdictRaw === 'suspicious' ? 'suspicious'
        : verdictRaw === 'failed' ? 'failed'
          : '';
  const engine = clean(body.engine, 80);
  if (!assetId || !/^[a-f0-9]{64}$/.test(sha256) || !verdict || !engine) return null;
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
    scannedAt: date.toISOString(),
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

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function safeHeaderName(value: string): string {
  return value.replace(/["\\\r\n]/g, '_').slice(0, 180) || 'asset.bin';
}
