import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
function need(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function forbid(source, needle, label) {
  if (source.includes(needle)) throw new Error(`${label}: forbidden legacy fragment ${needle}`);
}

const card = read('public/app/card-upgrade.js');
const normalizer = read('public/app/content-normalizer.js');
const homeJs = read('public/app/home-v2.js');
const homeCss = read('public/app/home-v2.css');
const index = read('public/app/index.html');

need(card, "const FLAG_BASE = '/app/flags';", 'Circle Flags renderer');
need(card, 'enhanceLanguagePicker', 'language picker Circle Flags');
forbid(card, 'hatscripts.github.io', 'Circle Flags renderer');
need(normalizer, 'normalizeListMeta', 'content normalizer language markup');
need(normalizer, 'replaceArrows', 'content normalizer language arrows');
need(normalizer, "data-lucide', 'circle-arrow-right'", 'content normalizer Lucide arrow');
forbid(homeJs, 'decorateFlags', 'home-v2');
forbid(homeJs, 'dtl-country-flag', 'home-v2');
forbid(homeCss, '.dtl-country-flag', 'home-v2 CSS');
need(homeCss, '@media (max-width:899px)', 'compact Telegram Desktop layout');
need(homeCss, '.page .simple-list{display:block!important', 'compact My Requests layout');
need(index, 'content-normalizer.js?v=20260810-normalizer1', 'cache-busted content normalizer');
need(index, 'card-upgrade.js?v=20260810-stableflags1', 'cache-busted Circle Flags renderer');
need(index, 'home-v2.js?v=20260810-stableflags1', 'cache-busted home runtime');
forbid(index, 'language-flags-bridge.js', 'Mini App runtime');
forbid(index, 'arrow-upgrade.js', 'Mini App runtime');
forbid(index, 'language-display-fix.js', 'Mini App runtime');

const removedShim = new URL('../public/app/language-display-fix.js', import.meta.url);
if (fs.existsSync(removedShim)) {
  throw new Error('Dead language-display-fix.js shim must not be reintroduced.');
}

for (const country of ['kr','jp','cn','gb','ru','es','pt','id','vn','fr','de','in','ph']) {
  const path = new URL(`../public/app/flags/${country}.svg`, import.meta.url);
  if (!fs.existsSync(path)) throw new Error(`Missing self-hosted Circle Flag: ${country}.svg`);
  const svg = fs.readFileSync(path, 'utf8');
  if (!svg.includes('<svg') || !svg.includes('viewBox=')) throw new Error(`Invalid Circle Flag asset: ${country}.svg`);
}

if (!fs.existsSync(new URL('../THIRD_PARTY_NOTICES.md', import.meta.url))) {
  throw new Error('Missing third-party license notice for vendored Circle Flags.');
}

console.log('Frontend stability audit passed.');
