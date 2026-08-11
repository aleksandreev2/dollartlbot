import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
}
function need(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function forbid(source, needle, label) {
  if (source.includes(needle)) throw new Error(`${label}: forbidden ${needle}`);
}

const index = read('public/app/index.html');
const js = read('public/app/admin-navigation.js');
const css = read('public/app/admin-navigation.css');

need(index, '/app/admin-navigation.css?v=20260811-nav2', 'admin navigation CSS asset');
need(index, '/app/admin-navigation.js?v=20260811-nav4', 'admin navigation JS asset');
need(index, '/app/admin-ui-utils.js?v=20260811-ui1', 'admin UI utils asset');

for (const token of [
  'admin-nav-more',
  'admin-nav-more-items',
  'data-admin-mobile-more',
  'admin-mobile-secondary',
  "label('[data-admin-section=\"publishing\"]', 'Publishing')",
  "label('[data-admin-health]', 'Система')",
  "label('[data-admin-tools=\"analytics\"]', 'Аналитика')",
  'window.DTL_ADMIN_NAVIGATION',
  'runtime.registerPatcher(install)',
  'visibleRouteSelector',
  'dtl:adminroutechange',
  'dtl:adminrender',
  'details.open = !details.open',
  'requestAnimationFrame',
]) need(js, token, 'admin navigation runtime');

for (const token of [
  'window.fetch =',
  'window.confirm(',
  'new MutationObserver',
  'admin-publishing-shortcuts',
  'data-publishing-manage',
  'data-publishing-broadcasts',
  'data-publishing-create',
  '[data-admin-tools="publications"]',
  '[data-admin-section="broadcasts"]',
]) forbid(js, token, 'admin navigation legacy Publishing shortcut');

for (const token of [
  '.admin-nav-more',
  '.admin-nav-more-items',
  '.admin-mobile-nav .admin-mobile-secondary',
  '.admin-mobile-nav.admin-mobile-more-open',
]) need(css, token, 'admin navigation CSS');
forbid(css, '.admin-publishing-shortcuts', 'dead Publishing shortcut CSS');

console.log('Admin navigation audit passed: More toggles explicitly, active state settles after route/render events, and Publishing navigation stays unified.');
