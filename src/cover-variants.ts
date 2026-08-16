import { storeSubmissionCover, removeSubmissionCover } from './covers';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

const MAX_ORIGINAL_BYTES = 8 * 1024 * 1024;
const MAX_VARIANT_BYTES = 2 * 1024 * 1024;
const WIDTHS = [160, 320, 640] as const;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);
const VERSION_RE = /^[A-Za-z0-9_-]{8,64}$/;

export async function handleCoverVariantRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const media = /^\/media\/covers\/(\d+)\/([A-Za-z0-9_-]{8,64})\/(160|320|640)\.webp$/.exec(url.pathname);
  if (request.method === 'GET' && media) {
    const submissionId = Number(media[1]);
    const version = media[2];
    const width = Number(media[3]);
    if (!VERSION_RE.test(version) || !WIDTHS.includes(width as (typeof WIDTHS)[number])) return new Response('Not found', { status: 404 });
    const key = variantKey(submissionId, version, width);
    const object = await env.COVERS.get(key, { onlyIf: request.headers });
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('content-type', 'image/webp');
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    return new Response('body' in object ? object.body : undefined, {
      status: 'body' in object ? 200 : 304,
      headers,
    });
  }

  const admin = /^\/api\/app\/admin\/cover\/(\d+)$/.exec(url.pathname);
  if (!admin || !['POST', 'DELETE'].includes(request.method)) return null;
  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  const submissionId = Number(admin[1]);
  const exists = await env.DB.prepare('SELECT id FROM submissions WHERE id=?').bind(submissionId).first<{ id: number }>();
  if (!exists) return miniAppJsonError('not_found', 'Request not found.', 404);

  if (request.method === 'DELETE') {
    const variants = await env.DB.prepare(`SELECT r2_key FROM cover_variants WHERE submission_id=?`)
      .bind(submissionId).all<{ r2_key: string }>().catch(() => ({ results: [] } as D1Result<{ r2_key: string }>));
    await removeSubmissionCover(env, submissionId);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM cover_variants WHERE submission_id=?').bind(submissionId),
      env.DB.prepare('UPDATE submissions SET cover_version=NULL WHERE id=?').bind(submissionId),
    ]).catch(() => undefined);
    if (variants.results.length) await env.COVERS.delete(variants.results.map((row) => row.r2_key)).catch(() => undefined);
    return miniAppJson({ ok: true, cover_url: null, cover_version: null });
  }

  const form = await request.formData();
  const original = form.get('cover');
  if (!(original instanceof File) || original.size <= 0) {
    return miniAppJsonError('cover_required', 'Choose an image file.', 400);
  }
  if (original.size > MAX_ORIGINAL_BYTES) return miniAppJsonError('cover_too_large', 'Cover images must be 8 MB or smaller.', 413);
  const mime = normalizeMime(original.type, original.name);
  if (!IMAGE_TYPES.has(mime)) return miniAppJsonError('unsupported_cover', 'Use JPEG, PNG, WebP or AVIF.', 400);

  await storeSubmissionCover(env, submissionId, {
    bytes: new Uint8Array(await original.arrayBuffer()),
    mime,
    extension: extensionForMime(mime),
  }, 'admin');

  const generated: Array<{ width: number; file: File }> = [];
  for (const width of WIDTHS) {
    const file = form.get(`cover_${width}`);
    if (!(file instanceof File) || file.size <= 0) continue;
    if (file.size > MAX_VARIANT_BYTES || normalizeMime(file.type, file.name) !== 'image/webp') continue;
    generated.push({ width, file });
  }

  if (!generated.length) {
    await env.DB.prepare('UPDATE submissions SET cover_version=NULL WHERE id=?').bind(submissionId).run().catch(() => undefined);
    return miniAppJson({ ok: true, cover_url: `/media/covers/${submissionId}`, cover_version: null, variants: [] });
  }

  const previous = await env.DB.prepare(`SELECT r2_key FROM cover_variants WHERE submission_id=?`)
    .bind(submissionId).all<{ r2_key: string }>().catch(() => ({ results: [] } as D1Result<{ r2_key: string }>));
  const version = versionToken();
  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [
    env.DB.prepare('DELETE FROM cover_variants WHERE submission_id=?').bind(submissionId),
    env.DB.prepare('UPDATE submissions SET cover_version=?,updated_at=? WHERE id=?').bind(version, now, submissionId),
  ];

  for (const { width, file } of generated) {
    const key = variantKey(submissionId, version, width);
    const bytes = await file.arrayBuffer();
    await env.COVERS.put(key, bytes, {
      httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
      customMetadata: { submissionId: String(submissionId), coverVersion: version, width: String(width) },
    });
    statements.push(env.DB.prepare(`
      INSERT INTO cover_variants(submission_id,cover_version,width,format,r2_key,mime_type,byte_size,created_at)
      VALUES (?,? ,?,'webp',?,'image/webp',?,?)
    `).bind(submissionId, version, width, key, file.size, now));
  }
  await env.DB.batch(statements);
  if (previous.results.length) await env.COVERS.delete(previous.results.map((row) => row.r2_key)).catch(() => undefined);

  return miniAppJson({
    ok: true,
    cover_url: `/media/covers/${submissionId}/${version}/320.webp`,
    cover_version: version,
    variants: generated.map((item) => item.width),
  });
}

function variantKey(submissionId: number, version: string, width: number): string {
  return `covers/${submissionId}/variants/${version}/${width}.webp`;
}

function versionToken(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let value = '';
  for (const byte of bytes) value += byte.toString(16).padStart(2, '0');
  return value;
}

function normalizeMime(type: string, name: string): string {
  const value = String(type || '').toLowerCase().split(';')[0].trim();
  if (IMAGE_TYPES.has(value)) return value;
  const lower = String(name || '').toLowerCase();
  if (/\.jpe?g$/.test(lower)) return 'image/jpeg';
  if (/\.png$/.test(lower)) return 'image/png';
  if (/\.webp$/.test(lower)) return 'image/webp';
  if (/\.avif$/.test(lower)) return 'image/avif';
  return value;
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/avif') return 'avif';
  return 'jpg';
}
