import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/app/home-v2.js', import.meta.url), 'utf8');
const startMarker = 'const copy = {';
const endMarker = '\n\n  function locale';
const start = source.indexOf(startMarker);
const end = source.indexOf(endMarker, start + startMarker.length);
if (start < 0 || end < 0) throw new Error('Could not locate home-v2 localization dictionary.');
const objectSource = `{${source.slice(start + startMarker.length, end).trim().replace(/;$/, '')}`;
const copy = vm.runInNewContext(`(${objectSource})`, Object.create(null), { timeout: 1000 });
const expected = ['en','es','fil','hi','pt','id','vi','fr','de','ru'];
const keys = ['title','subtitle','empty','open','files'];
for (const locale of expected) {
  if (!copy[locale]) throw new Error(`home-v2: missing locale ${locale}`);
  for (const key of keys) if (copy[locale][key] === undefined) throw new Error(`home-v2/${locale}: missing ${key}`);
}
const extras = Object.keys(copy).filter(locale => !expected.includes(locale));
if (extras.length) throw new Error(`home-v2: unexpected locales ${extras.join(', ')}`);
console.log(`Home translated-chapters localization passed for ${expected.length} locales.`);
