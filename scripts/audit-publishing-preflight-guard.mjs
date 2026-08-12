import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const need = (source, needle, label) => { if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`); };
const forbid = (source, needle, label) => { if (source.includes(needle)) throw new Error(`${label}: forbidden ${needle}`); };

const guard = read('public/app/publishing-preflight-guard.js');
const html = read('public/app/index.html');
const pkg = read('package.json');
const rtl = read('public/app/rtl.css');
const flag = read('public/app/flags/pk.svg');

for (const token of [
  "['pubTitle', 'pubBody']",
  'schedule(260)',
  "context.pathname !== '/api/app/admin/publications'",
  "classList.contains('is-busy')",
  'DTL_PUBLICATION_RELEASE_RANGE',
  'await checkNow()',
  'lastPreflight?.ready',
  "classList.contains('ready')",
  'preflight_blocked',
]) need(guard, token, 'publishing preflight guard');
forbid(guard, 'MutationObserver', 'publishing preflight guard');
forbid(guard, 'window.fetch =', 'publishing preflight guard');
new Function(guard);

need(html, '/app/publishing-preflight-guard.js?v=20260812-preflight1', 'Mini App publishing guard asset');
if (html.indexOf('/app/publishing-preflight-guard.js') < html.indexOf('/app/admin-publishing-center.js')) {
  throw new Error('Publishing preflight guard must load after Publishing Center.');
}
need(pkg, 'tests/publishing-preflight-guard.spec.mjs', 'publishing guard browser coverage');

for (const token of [
  'html[dir="rtl"] body{direction:ltr}',
  'html[dir="rtl"] .view-root',
  'html[dir="rtl"] .topbar',
  'html[dir="rtl"] .bottom-nav{direction:ltr}',
  'html[dir="rtl"] .admin-v2',
]) need(rtl, token, 'RTL structural layout');
need(flag, '#01411c', 'Pakistan flag asset');

console.log('Publishing readiness + Urdu structural regression audit passed.');
