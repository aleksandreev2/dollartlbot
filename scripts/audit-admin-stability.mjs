import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
function need(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function forbid(source, needle, label) {
  if (source.includes(needle)) throw new Error(`${label}: forbidden ${needle}`);
}

const index = read('public/app/index.html');
const stability = read('public/app/admin-stability.js');
const cache = read('public/app/admin-cache.js');
const css = read('public/app/admin-stability.css');

need(index, '/app/admin-stability.css?v=20260811-stability1', 'admin stability CSS asset');
need(index, '/app/admin-stability.js?v=20260811-stability1', 'admin stability JS asset');
need(index, '/app/admin-cache.js?v=20260810-admin1&stability=20260811', 'admin cache cache-bust');

const stabilityPos = index.indexOf('/app/admin-stability.js?v=20260811-stability1');
const cachePos = index.indexOf('/app/admin-cache.js?v=20260810-admin1&stability=20260811');
const consolePos = index.indexOf('/app/admin-console.js?v=20260810-admin1');
if (!(stabilityPos >= 0 && stabilityPos < cachePos && cachePos < consolePos)) {
  throw new Error('Admin stability runtime must load before admin cache and admin console.');
}

for (const token of [
  'runtime.registerFetchMiddleware',
  'runtime.registerPatcher',
  "headers.set('x-dtl-admin-no-cache', '1')",
  'abortAdminReads',
  'pendingMutations',
  'unresolvedSupersededRead',
  'stableBodyKey',
  'confirmAction',
  'replayConfirmedClick',
  'sessionStorage.setItem(STORAGE_KEY',
  'admin-stability-refresh',
  'window.DTL_ADMIN_STABILITY',
]) need(stability, token, 'admin stability runtime');

forbid(stability, 'window.fetch =', 'admin stability fetch ownership');
need(stability, "document.addEventListener('click'", 'admin navigation/mutation capture');
need(stability, "document.addEventListener('visibilitychange'", 'admin freshness on resume');
need(stability, "event.stopImmediatePropagation()", 'duplicate/destructive click guard');

need(cache, "const CACHEABLE = new Set(['/api/app/admin/analytics']);", 'admin cache allowlist');
need(cache, "headers.get('x-dtl-admin-no-cache') === '1'", 'admin cache freshness bypass');
need(cache, "cache: 'no-store'", 'operational no-store');
for (const stalePath of [
  '/api/app/admin/list?kind=pending',
  '/api/app/admin/publishing',
  '/api/app/admin/users?filter=all',
  '/api/app/admin/publications',
]) forbid(cache, stalePath, 'operational admin prefetch');

for (const token of [
  '.admin-confirm-root',
  '.admin-confirm-dialog',
  '.admin-confirm-actions button.danger',
  '.dtl-admin-action-busy',
]) need(css, token, 'admin stability UX');

console.log('Admin stability audit passed: live operational reads, stale-read cancellation, mutation dedupe, persistent navigation, unified confirmations and manual refresh are wired before legacy admin modules.');
