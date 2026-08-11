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
const js = read('public/app/admin-navigation.js');
const css = read('public/app/admin-navigation.css');

need(index, '/app/admin-navigation.css?v=20260811-nav2', 'admin navigation CSS asset');
need(index, '/app/admin-navigation.js?v=20260811-nav3', 'admin navigation JS asset');

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
]) need(js, token, 'admin navigation runtime');

for (const token of [
  'window.fetch =',
  'window.confirm(',
  'new MutationObserver',
  'dtl:adminrender',
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

console.log('Admin navigation audit passed: primary workflow stays visible, Analytics/Settings live under More, active state follows the visible page, and Publishing navigation is owned only by Publishing Center.');
