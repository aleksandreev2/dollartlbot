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

need(index, '/app/admin-navigation.css?v=20260811-nav1', 'admin navigation CSS asset');
need(index, '/app/admin-navigation.js?v=20260811-nav1', 'admin navigation JS asset');

for (const token of [
  'admin-nav-more',
  'admin-nav-more-items',
  'data-admin-mobile-more',
  'admin-mobile-secondary',
  "label('[data-admin-section=\"publishing\"]', 'Публикации')",
  "label('[data-admin-tools=\"publications\"]', 'Управление постами')",
  "label('[data-admin-health]', 'Система')",
  'admin-publishing-shortcuts',
  'data-publishing-manage',
  'data-publishing-broadcasts',
  'data-publishing-create',
  'window.DTL_ADMIN_NAVIGATION',
]) need(js, token, 'admin navigation runtime');

forbid(js, 'window.fetch =', 'navigation fetch ownership');
forbid(js, 'window.confirm(', 'navigation confirmation ownership');
forbid(js, 'new MutationObserver', 'navigation lifecycle');

for (const token of [
  '.admin-nav-more',
  '.admin-nav-more-items',
  '.admin-publishing-shortcuts',
  '.admin-mobile-nav .admin-mobile-secondary',
  '.admin-mobile-nav.admin-mobile-more-open',
]) need(css, token, 'admin navigation CSS');

console.log('Admin navigation audit passed: primary workflow stays visible, secondary tools live under More, and publishing shortcuts retain access to management and broadcasts.');
