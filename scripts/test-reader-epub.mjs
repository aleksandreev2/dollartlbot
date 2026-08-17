import assert from 'node:assert/strict';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { extractEpubFingerprint, personalizeEpubWithHash } from '../src/fingerprint/epub.ts';

const chapter = '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Chapter text must stay exactly the same.</p></body></html>';
const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">reader-test</dc:identifier><dc:title>Reader Test</dc:title></metadata>
  <manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="chapter"/></spine>
</package>`;
const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;

const source = zipSync({
  mimetype:[strToU8('application/epub+zip'),{level:0}],
  'META-INF/container.xml':strToU8(container),
  'OEBPS/content.opf':strToU8(opf),
  'OEBPS/chapter.xhtml':strToU8(chapter),
},{level:6});

const distributionId = 'DTL1-ABCD-EFGH-JKLM';
const result = await personalizeEpubWithHash(source, {
  distributionId,
  fingerprintVersion:1,
  noticeTitle:'Personal use only',
  noticeBody:'Redistribution without permission is prohibited.',
});
assert.equal(extractEpubFingerprint(result.bytes), distributionId);
assert.match(result.sha256,/^[a-f0-9]{64}$/);

const personalized = unzipSync(result.bytes);
assert.equal(strFromU8(personalized['OEBPS/chapter.xhtml']), chapter, 'chapter content changed during personalization');
assert.match(strFromU8(personalized['OEBPS/content.opf']),/dollartl-distribution-id/);
assert.match(strFromU8(personalized['META-INF/dollartl.xml']),new RegExp(distributionId));
assert.match(strFromU8(personalized['OEBPS/dollartl-notice.xhtml']),new RegExp(distributionId));

const unsafe = zipSync({
  mimetype:[strToU8('application/epub+zip'),{level:0}],
  'META-INF/container.xml':strToU8(container),
  'OEBPS/content.opf':strToU8(opf),
  '../escape.txt':strToU8('nope'),
},{level:6});
await assert.rejects(()=>personalizeEpubWithHash(unsafe,{
  distributionId,fingerprintVersion:1,noticeTitle:'x',noticeBody:'x',
}),/Unsafe EPUB archive path/);

console.log('Reader EPUB runtime test passed.');
