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

const presenter = read('public/app/novel-presenter.js');
const i18nCore = read('public/app/i18n-core.js');
const homeJs = read('public/app/home-v2.js');
const homeCss = read('public/app/home-v2.css');
const index = read('public/app/index.html');

need(presenter, "const FLAG_BASE = '/app/flags';", 'novel presenter Circle Flags');
need(presenter, 'enhanceLanguagePicker', 'novel presenter language picker');
need(presenter, 'normalizeListMeta', 'novel presenter language normalization');
need(presenter, 'replaceArrows', 'novel presenter language arrows');
need(presenter, "data-lucide', 'circle-arrow-right'", 'novel presenter Lucide arrow');
forbid(presenter, 'hatscripts.github.io', 'novel presenter Circle Flags');

need(i18nCore, "'/api/app/bootstrap'", 'i18n core bootstrap locale authority');
need(i18nCore, "'/api/app/language'", 'i18n core language API authority');
need(i18nCore, 'window.__DTL_LOCALE__', 'i18n core locale state');
need(i18nCore, 'patchInlineCopy', 'i18n core inline copy normalization');
need(i18nCore, 'dtl:localechange', 'i18n core locale event');

forbid(homeJs, 'decorateFlags', 'home-v2');
forbid(homeJs, 'dtl-country-flag', 'home-v2');
forbid(homeCss, '.dtl-country-flag', 'home-v2 CSS');
need(homeCss, '@media (max-width:899px)', 'compact Telegram Desktop layout');
need(homeCss, '.page .simple-list{display:block!important', 'compact My Requests layout');
need(index, 'i18n-core.js?v=20260810-i18ncore1', 'cache-busted i18n core');
need(index, 'novel-presenter.js?v=20260810-presenter1', 'cache-busted novel presenter');
need(index, 'home-v2.js?v=20260810-stableflags1', 'cache-busted home runtime');
forbid(index, 'locale-sync.js', 'Mini App runtime');
forbid(index, 'i18n-inline-fixes.js', 'Mini App runtime');
forbid(index, 'language-flags-bridge.js', 'Mini App runtime');
forbid(index, 'arrow-upgrade.js', 'Mini App runtime');
forbid(index, 'language-display-fix.js', 'Mini App runtime');
forbid(index, 'content-normalizer.js', 'Mini App runtime');
forbid(index, 'card-upgrade.js', 'Mini App runtime');

for (const removed of [
  'public/app/locale-sync.js',
  'public/app/i18n-inline-fixes.js',
  'public/app/language-display-fix.js',
  'public/app/content-normalizer.js',
  'public/app/card-upgrade.js',
]) {
  if (fs.existsSync(new URL(`../${removed}`, import.meta.url))) {
    throw new Error(`Superseded frontend runtime must not be reintroduced: ${removed}`);
  }
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
