import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/covers.ts', import.meta.url), 'utf8');

function need(needle, label = needle) {
  if (!source.includes(needle)) throw new Error(`EPUB safety: missing ${label}`);
}
function forbid(needle, label = needle) {
  if (source.includes(needle)) throw new Error(`EPUB safety: forbidden ${label}`);
}

for (const invariant of [
  'MAX_EPUB_METADATA_BYTES = 1024 * 1024',
  'MAX_EPUB_ZIP_ENTRIES = 5_000',
  'MAX_EPUB_ENTRY_NAME_BYTES = 4_096',
  'MAX_EPUB_COMPRESSION_RATIO = 100',
  'if (count > MAX_EPUB_ZIP_ENTRIES)',
  'assertSafeCompression(compressedSize, uncompressedSize)',
  'entry.uncompressedSize > maxBytes',
  'readStreamLimited(stream, maxBytes)',
  'total > maxBytes',
  'output.byteLength !== entry.uncompressedSize',
]) need(invariant);

need('extractZipText(buffer, container, MAX_EPUB_METADATA_BYTES)', 'bounded container.xml extraction');
need('extractZipText(buffer, opfEntry, MAX_EPUB_METADATA_BYTES)', 'bounded OPF extraction');
need('extractZipBytes(buffer, coverEntry, MAX_ADMIN_COVER_BYTES)', 'bounded cover extraction');
forbid('new Response(stream).arrayBuffer()', 'unbounded decompression buffer');

console.log('EPUB resource-safety audit passed.');
