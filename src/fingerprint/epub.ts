import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

const MAX_EPUB_BYTES = 50 * 1024 * 1024;
const MAX_ENTRIES = 5_000;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 250;
const GENERATOR_VERSION = 'reader-epub-1';

export type PersonalizedEpub = {
  bytes: Uint8Array;
  sha256: string;
  generatorVersion: string;
  fingerprintVersion: number;
};

export function personalizeEpub(
  source: ArrayBuffer | Uint8Array,
  input: { distributionId: string; fingerprintVersion: number; noticeTitle: string; noticeBody: string },
): PersonalizedEpub {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_EPUB_BYTES) throw new Error('EPUB size is outside personalization limits');
  inspectZip(bytes);

  const entries = unzipSync(bytes);
  const names = Object.keys(entries);
  if (names.length === 0 || names.length > MAX_ENTRIES) throw new Error('EPUB contains too many entries');
  let unpacked = 0;
  for (const name of names) {
    safeEntryName(name);
    unpacked += entries[name].byteLength;
    if (unpacked > MAX_UNCOMPRESSED_BYTES) throw new Error('EPUB expands beyond personalization limits');
  }
  const mimetype = entries.mimetype ? strFromU8(entries.mimetype).trim() : '';
  if (mimetype !== 'application/epub+zip') throw new Error('Invalid EPUB mimetype');

  const containerBytes = entries['META-INF/container.xml'];
  if (!containerBytes) throw new Error('EPUB container.xml is missing');
  const containerXml = strFromU8(containerBytes);
  const rootMatch = /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(containerXml);
  if (!rootMatch) throw new Error('EPUB package document is missing');
  const opfPath = decodeXml(rootMatch[1]).replace(/^\/+/, '');
  safeEntryName(opfPath);
  const opfBytes = entries[opfPath];
  if (!opfBytes) throw new Error('EPUB package document cannot be read');

  const distributionId = input.distributionId.trim().toUpperCase();
  const fingerprintVersion = Math.max(1, Math.round(input.fingerprintVersion));
  const packageDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const noticeName = 'dollartl-notice.xhtml';
  const noticePath = `${packageDir}${noticeName}`;
  const metaBlock = `\n    <meta name="dollartl-distribution-id" content="${xmlAttr(distributionId)}"/>\n    <meta name="dollartl-fingerprint-version" content="${fingerprintVersion}"/>\n    <meta name="dollartl-generator-version" content="${GENERATOR_VERSION}"/>`;

  let opf = strFromU8(opfBytes);
  opf = opf.replace(/\s*<meta\s+name=["']dollartl-(?:distribution-id|fingerprint-version|generator-version)["'][^>]*\/?\s*>/gi, '');
  if (!/<\/metadata\s*>/i.test(opf)) throw new Error('EPUB metadata section is malformed');
  opf = opf.replace(/<\/metadata\s*>/i, `${metaBlock}\n  </metadata>`);

  if (!/\bid\s*=\s*["']dollartl-notice["']/i.test(opf)) {
    if (!/<\/manifest\s*>/i.test(opf)) throw new Error('EPUB manifest is malformed');
    opf = opf.replace(/<\/manifest\s*>/i, `    <item id="dollartl-notice" href="${noticeName}" media-type="application/xhtml+xml"/>\n  </manifest>`);
  }
  if (!/\bidref\s*=\s*["']dollartl-notice["']/i.test(opf)) {
    if (!/<\/spine\s*>/i.test(opf)) throw new Error('EPUB spine is malformed');
    opf = opf.replace(/<\/spine\s*>/i, `    <itemref idref="dollartl-notice"/>\n  </spine>`);
  }
  entries[opfPath] = strToU8(opf);
  entries['META-INF/dollartl.xml'] = strToU8(distributionRecord(distributionId, fingerprintVersion));
  entries[noticePath] = strToU8(noticeXhtml(input.noticeTitle, input.noticeBody, distributionId));

  const output: Zippable = {};
  output.mimetype = [strToU8('application/epub+zip'), { level: 0 }];
  for (const name of Object.keys(entries).sort()) {
    if (name === 'mimetype') continue;
    output[name] = entries[name];
  }
  const personalized = zipSync(output, { level: 6 });
  return { bytes: personalized, sha256: '', generatorVersion: GENERATOR_VERSION, fingerprintVersion };
}

export async function personalizeEpubWithHash(
  source: ArrayBuffer | Uint8Array,
  input: { distributionId: string; fingerprintVersion: number; noticeTitle: string; noticeBody: string },
): Promise<PersonalizedEpub> {
  const result = personalizeEpub(source, input);
  return { ...result, sha256: await sha256Hex(result.bytes) };
}

export function extractEpubFingerprint(source: ArrayBuffer | Uint8Array): string | null {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  inspectZip(bytes);
  const entries = unzipSync(bytes);
  const record = entries['META-INF/dollartl.xml'];
  if (record) {
    const match = /<distribution-id>\s*([^<\s]+)\s*<\/distribution-id>/i.exec(strFromU8(record));
    if (match) return match[1].trim().toUpperCase();
  }
  const container = entries['META-INF/container.xml'];
  if (!container) return null;
  const root = /<rootfile\b[^>]*\bfull-path\s*=\s*["']([^"']+)["']/i.exec(strFromU8(container));
  if (!root) return null;
  const opf = entries[decodeXml(root[1]).replace(/^\/+/, '')];
  if (!opf) return null;
  const meta = /<meta\s+name=["']dollartl-distribution-id["'][^>]*\bcontent=["']([^"']+)["'][^>]*>/i.exec(strFromU8(opf));
  return meta?.[1]?.trim().toUpperCase() || null;
}

export async function sha256Hex(source: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = source instanceof Uint8Array ? source : new Uint8Array(source);
  const payload = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest('SHA-256', payload.buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function distributionRecord(distributionId: string, version: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<dollartl-distribution version="${version}">\n  <distribution-id>${xmlText(distributionId)}</distribution-id>\n  <generator>${GENERATOR_VERSION}</generator>\n</dollartl-distribution>\n`;
}

function noticeXhtml(title: string, body: string, distributionId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE html>\n<html xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"/><title>${xmlText(title)}</title></head><body><section><h1>${xmlText(title)}</h1><p>${xmlText(body)}</p><p><small>Distribution ID: ${xmlText(distributionId)}</small></p><!-- Dollar TL distribution ${xmlText(distributionId)} --></section></body></html>`;
}

function inspectZip(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let entries = 0;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  for (let offset = 0; offset + 46 <= bytes.byteLength; offset += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) continue;
    const flags = view.getUint16(offset + 8, true);
    if (flags & 0x0001) throw new Error('Encrypted EPUBs cannot be personalized');
    const compressed = view.getUint32(offset + 20, true);
    const uncompressed = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (offset + 46 + nameLength + extraLength + commentLength > bytes.byteLength) throw new Error('Malformed EPUB central directory');
    entries += 1;
    totalCompressed += compressed;
    totalUncompressed += uncompressed;
    if (entries > MAX_ENTRIES || totalUncompressed > MAX_UNCOMPRESSED_BYTES) throw new Error('EPUB archive exceeds personalization limits');
    if (compressed > 0 && uncompressed / compressed > MAX_COMPRESSION_RATIO) throw new Error('EPUB contains a suspicious compression ratio');
    offset += 45 + nameLength + extraLength + commentLength;
  }
  if (!entries) throw new Error('EPUB ZIP central directory was not found');
  if (totalCompressed > 0 && totalUncompressed / totalCompressed > MAX_COMPRESSION_RATIO) throw new Error('EPUB archive compression ratio is suspicious');
}

function safeEntryName(name: string): void {
  const normalized = name.replaceAll('\\', '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('../') || normalized.includes('/..') || /^[A-Za-z]:\//.test(normalized)) throw new Error('Unsafe EPUB archive path');
}
function xmlText(value: string): string { return String(value).replace(/[&<>]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[char] || char)); }
function xmlAttr(value: string): string { return xmlText(value).replace(/["']/g, char => char === '"' ? '&quot;' : '&apos;'); }
function decodeXml(value: string): string { return value.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'); }
