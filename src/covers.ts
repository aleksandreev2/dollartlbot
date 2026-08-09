import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

const MAX_ADMIN_COVER_BYTES = 8 * 1024 * 1024;
const MAX_AUTO_EXTRACT_EPUB_BYTES = 20 * 1024 * 1024;
const MAX_EPUB_METADATA_BYTES = 1024 * 1024;
const MAX_EPUB_ZIP_ENTRIES = 5_000;
const MAX_EPUB_ENTRY_NAME_BYTES = 4_096;
const MAX_EPUB_COMPRESSION_RATIO = 100;
const ALLOWED_COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

type CoverVersion = { r2_key:string; mime_type:string|null; source:'epub'|'admin'; created_at:string };

export type ExtractedCover = {
  bytes: Uint8Array;
  mime: string;
  extension: string;
};

export async function handleCoverRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);

  const mediaMatch = /^\/media\/covers\/(\d+)$/.exec(url.pathname);
  if (request.method === 'GET' && mediaMatch) {
    const id = Number(mediaMatch[1]);
    const row = await env.DB.prepare(
      'SELECT cover_key, cover_mime FROM submissions WHERE id = ?',
    ).bind(id).first<{ cover_key: string | null; cover_mime: string | null }>();
    if (!row?.cover_key) return new Response('Not found', { status: 404 });

    let key=row.cover_key;
    let mime=row.cover_mime;
    let object=await env.COVERS.get(key,{onlyIf:request.headers});

    // A cover assigned in D1 must not visually disappear because one R2 object was
    // lost. Keep a small immutable version history and self-heal to the newest
    // version that is still physically present.
    if(!object){
      const versions=await env.DB.prepare(`
        SELECT r2_key,mime_type,source,created_at
        FROM cover_versions
        WHERE submission_id=? AND r2_key<>?
        ORDER BY id DESC LIMIT 8
      `).bind(id,key).all<CoverVersion>();
      for(const version of versions.results){
        const candidate=await env.COVERS.get(version.r2_key,{onlyIf:request.headers});
        if(!candidate)continue;
        key=version.r2_key;mime=version.mime_type;object=candidate;
        const now=new Date().toISOString();
        await env.DB.prepare(`UPDATE submissions SET cover_key=?,cover_mime=?,cover_source=?,cover_updated_at=?,updated_at=? WHERE id=?`)
          .bind(key,mime,version.source,now,now,id).run().catch(()=>undefined);
        break;
      }
    }

    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('content-type', mime || headers.get('content-type') || 'image/jpeg');
    headers.set('cache-control', 'public, max-age=300, stale-while-revalidate=86400');
    return new Response('body' in object ? object.body : undefined, {
      status: 'body' in object ? 200 : 304,
      headers,
    });
  }

  const adminMatch = /^\/api\/app\/admin\/cover\/(\d+)$/.exec(url.pathname);
  if (adminMatch && (request.method === 'POST' || request.method === 'DELETE')) {
    const auth = await authenticateMiniAppRequest(request, env);
    if (auth instanceof Response) return auth;
    if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

    const submissionId = Number(adminMatch[1]);
    const exists = await env.DB.prepare('SELECT id FROM submissions WHERE id = ?')
      .bind(submissionId)
      .first<{ id: number }>();
    if (!exists) return miniAppJsonError('not_found', 'Request not found.', 404);

    if (request.method === 'DELETE') {
      await removeSubmissionCover(env, submissionId);
      return miniAppJson({ ok: true, cover_url: null });
    }

    const form = await request.formData();
    const image = form.get('cover');
    if (!(image instanceof File) || image.size <= 0) {
      return miniAppJsonError('cover_required', 'Choose an image file.', 400);
    }
    if (image.size > MAX_ADMIN_COVER_BYTES) {
      return miniAppJsonError('cover_too_large', 'Cover images must be 8 MB or smaller.', 413);
    }
    const mime = normalizeImageMime(image.type, image.name);
    if (!ALLOWED_COVER_TYPES.has(mime)) {
      return miniAppJsonError('unsupported_cover', 'Use JPEG, PNG, WebP or AVIF.', 400);
    }

    const bytes = new Uint8Array(await image.arrayBuffer());
    await storeSubmissionCover(env, submissionId, {
      bytes,
      mime,
      extension: extensionForMime(mime),
    }, 'admin');
    return miniAppJson({ ok: true, cover_url: `/media/covers/${submissionId}` });
  }

  return null;
}

export async function maybeExtractEpubCover(file: File): Promise<ExtractedCover | null> {
  if (!file.name.toLowerCase().endsWith('.epub')) return null;
  if (file.size > MAX_AUTO_EXTRACT_EPUB_BYTES) return null;

  const buffer = await file.arrayBuffer();
  const entries = readZipDirectory(buffer);
  if (!entries.length) return null;

  const container = entries.find((entry) => entry.name.toLowerCase() === 'meta-inf/container.xml');
  let opfPath = '';
  if (container) {
    const xml = await extractZipText(buffer, container, MAX_EPUB_METADATA_BYTES);
    opfPath = matchAttribute(xml, /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i);
  }
  if (!opfPath) opfPath = entries.find((entry) => /\.opf$/i.test(entry.name))?.name ?? '';
  if (!opfPath) return null;

  const opfEntry = findEntry(entries, opfPath);
  if (!opfEntry) return null;
  const opf = await extractZipText(buffer, opfEntry, MAX_EPUB_METADATA_BYTES);
  const manifest = parseManifestItems(opf);

  let coverItem = manifest.find((item) => /(^|\s)cover-image(\s|$)/i.test(item.properties));
  if (!coverItem) {
    const coverId = matchAttribute(opf, /<meta\b[^>]*\bname\s*=\s*["']cover["'][^>]*\bcontent\s*=\s*["']([^"']+)["']/i)
      || matchAttribute(opf, /<meta\b[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*\bname\s*=\s*["']cover["']/i);
    if (coverId) coverItem = manifest.find((item) => item.id === coverId);
  }
  if (!coverItem) {
    coverItem = manifest.find((item) => /cover/i.test(item.id) && /^image\//i.test(item.mediaType));
  }
  if (!coverItem || !/^image\//i.test(coverItem.mediaType)) return null;

  const coverPath = resolveZipPath(opfPath, coverItem.href);
  const coverEntry = findEntry(entries, coverPath);
  if (!coverEntry || coverEntry.uncompressedSize > MAX_ADMIN_COVER_BYTES) return null;
  const bytes = await extractZipBytes(buffer, coverEntry, MAX_ADMIN_COVER_BYTES);
  const mime = normalizeImageMime(coverItem.mediaType, coverPath);
  if (!ALLOWED_COVER_TYPES.has(mime)) return null;

  return { bytes, mime, extension: extensionForMime(mime) };
}

export async function storeSubmissionCover(
  env: Env,
  submissionId: number,
  cover: ExtractedCover,
  source: 'epub' | 'admin',
): Promise<void> {
  const key = `covers/${submissionId}/${crypto.randomUUID()}.${cover.extension}`;
  await env.COVERS.put(key, cover.bytes, {
    httpMetadata: {
      contentType: cover.mime,
      cacheControl: 'public, max-age=31536000, immutable',
    },
    customMetadata: { submissionId: String(submissionId), source },
  });

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE submissions
      SET cover_key = ?, cover_source = ?, cover_mime = ?, cover_updated_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(key, source, cover.mime, now, now, submissionId),
    env.DB.prepare(`
      INSERT INTO cover_versions (submission_id, r2_key, mime_type, source, created_at)
      SELECT ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM cover_versions WHERE submission_id = ? AND r2_key = ?
      )
    `).bind(submissionId, key, cover.mime, source, now, submissionId, key),
  ]);

  // Deliberately keep previous immutable R2 objects. cover_versions is our tiny
  // rollback/self-heal history. Explicit admin removal deletes the whole history.
}

export async function removeSubmissionCover(env: Env, submissionId: number): Promise<void> {
  const keys=new Set<string>();
  const row=await env.DB.prepare('SELECT cover_key FROM submissions WHERE id=?').bind(submissionId).first<{cover_key:string|null}>();
  if(row?.cover_key)keys.add(row.cover_key);
  const versions=await env.DB.prepare('SELECT r2_key FROM cover_versions WHERE submission_id=?').bind(submissionId).all<{r2_key:string}>().catch(()=>({results:[]} as any));
  for(const version of versions.results||[])keys.add(version.r2_key);

  await env.DB.prepare(`
    UPDATE submissions
    SET cover_key = NULL, cover_source = NULL, cover_mime = NULL,
        cover_updated_at = NULL, updated_at = ?
    WHERE id = ?
  `).bind(new Date().toISOString(), submissionId).run();
  await env.DB.prepare('DELETE FROM cover_versions WHERE submission_id=?').bind(submissionId).run().catch(()=>undefined);
  if(keys.size)await env.COVERS.delete([...keys]).catch(()=>undefined);
}

function readZipDirectory(buffer: ArrayBuffer): ZipEntry[] {
  if (buffer.byteLength < 22) return [];
  const view = new DataView(buffer);
  let eocd = -1;
  for (let i = Math.max(0, buffer.byteLength - 65_557); i <= buffer.byteLength - 22; i += 1) {
    if (view.getUint32(i, true) === 0x06054b50) eocd = i;
  }
  if (eocd < 0) return [];

  const count = view.getUint16(eocd + 10, true);
  if (count > MAX_EPUB_ZIP_ENTRIES) throw new Error('EPUB contains too many ZIP entries');

  let offset = view.getUint32(eocd + 16, true);
  if (offset < 0 || offset > buffer.byteLength - 46) throw new Error('Invalid EPUB ZIP directory offset');

  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (offset + 46 > buffer.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('Invalid EPUB ZIP central directory');
    }
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const nextOffset = offset + 46 + nameLen + extraLen + commentLen;

    if (nameLen <= 0 || nameLen > MAX_EPUB_ENTRY_NAME_BYTES || nextOffset > buffer.byteLength) {
      throw new Error('Invalid EPUB ZIP entry metadata');
    }
    if (localOffset > buffer.byteLength - 30) throw new Error('Invalid EPUB ZIP local entry offset');
    assertSafeCompression(compressedSize, uncompressedSize);

    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLen));
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset = nextOffset;
  }
  return entries;
}

async function extractZipText(buffer: ArrayBuffer, entry: ZipEntry, maxBytes: number): Promise<string> {
  return new TextDecoder('utf-8').decode(await extractZipBytes(buffer, entry, maxBytes));
}

async function extractZipBytes(buffer: ArrayBuffer, entry: ZipEntry, maxBytes: number): Promise<Uint8Array> {
  if (entry.uncompressedSize > maxBytes) throw new Error('EPUB ZIP entry exceeds extraction limit');
  assertSafeCompression(entry.compressedSize, entry.uncompressedSize);

  if (entry.localOffset < 0 || entry.localOffset + 30 > buffer.byteLength) throw new Error('Bad ZIP entry');
  const view = new DataView(buffer);
  if (view.getUint32(entry.localOffset, true) !== 0x04034b50) throw new Error('Bad ZIP entry');
  const nameLen = view.getUint16(entry.localOffset + 26, true);
  const extraLen = view.getUint16(entry.localOffset + 28, true);
  const start = entry.localOffset + 30 + nameLen + extraLen;
  const end = start + entry.compressedSize;
  if (start < 0 || end < start || end > buffer.byteLength) throw new Error('Truncated ZIP entry');

  const bytes = new Uint8Array(buffer, start, entry.compressedSize);
  if (entry.method === 0) {
    if (bytes.byteLength > maxBytes || bytes.byteLength !== entry.uncompressedSize) throw new Error('Invalid stored ZIP entry size');
    return new Uint8Array(bytes);
  }
  if (entry.method !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Unsupported ZIP compression');

  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream('deflate-raw' as CompressionFormat),
  );
  const output = await readStreamLimited(stream, maxBytes);
  if (output.byteLength !== entry.uncompressedSize) throw new Error('ZIP entry size mismatch');
  return output;
}

function assertSafeCompression(compressedSize: number, uncompressedSize: number): void {
  if (!Number.isSafeInteger(compressedSize) || !Number.isSafeInteger(uncompressedSize)) {
    throw new Error('Invalid EPUB ZIP entry size');
  }
  if (compressedSize < 0 || uncompressedSize < 0) throw new Error('Invalid EPUB ZIP entry size');
  if (uncompressedSize > 0 && compressedSize === 0) throw new Error('Suspicious EPUB ZIP compression');
  if (compressedSize > 0 && uncompressedSize / compressedSize > MAX_EPUB_COMPRESSION_RATIO) {
    throw new Error('EPUB ZIP compression ratio is too high');
  }
}

async function readStreamLimited(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('EPUB ZIP entry exceeds extraction limit').catch(() => undefined);
        throw new Error('EPUB ZIP entry exceeds extraction limit');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function parseManifestItems(opf: string): Array<{ id: string; href: string; mediaType: string; properties: string }> {
  const items: Array<{ id: string; href: string; mediaType: string; properties: string }> = [];
  const re = /<item\b([^>]+?)\/?\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(opf))) {
    const attrs = match[1];
    const id = attr(attrs, 'id');
    const href = attr(attrs, 'href');
    const mediaType = attr(attrs, 'media-type');
    const properties = attr(attrs, 'properties');
    if (id && href) items.push({ id, href, mediaType, properties });
  }
  return items;
}

function attr(source: string, name: string): string {
  const match = new RegExp(`\\b${name.replace('-', '\\-')}\\s*=\\s*["']([^"']+)["']`, 'i').exec(source);
  return decodeXml(match?.[1] ?? '');
}

function matchAttribute(source: string, pattern: RegExp): string {
  return decodeXml(pattern.exec(source)?.[1] ?? '');
}

function decodeXml(value: string): string {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function resolveZipPath(baseFile: string, href: string): string {
  const decoded = decodeURIComponent(href.split('#')[0]);
  const baseParts = baseFile.split('/');
  baseParts.pop();
  for (const part of decoded.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') baseParts.pop();
    else baseParts.push(part);
  }
  return baseParts.join('/');
}

function findEntry(entries: ZipEntry[], path: string): ZipEntry | undefined {
  const normalized = path.replace(/^\.\//, '').toLowerCase();
  return entries.find((entry) => entry.name.replace(/^\.\//, '').toLowerCase() === normalized);
}

function normalizeImageMime(mime: string, name: string): string {
  const lower = (mime || '').toLowerCase().split(';')[0].trim();
  if (ALLOWED_COVER_TYPES.has(lower)) return lower;
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'avif') return 'image/avif';
  return lower;
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/avif') return 'avif';
  return 'jpg';
}
