import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const index = read('public/app/index.html');
const runtime = read('public/app/admin-runtime.js');
const view = read('public/app/view-admin.js');

function requireToken(source, token, label = token) {
  if (!source.includes(token)) throw new Error(`Missing ${label}`);
}

function forbidToken(source, token, label = token) {
  if (source.includes(token)) throw new Error(`Forbidden ${label}`);
}

const runtimeTag = '/app/admin-runtime.js?v=20260811-runtime1';
requireToken(index, runtimeTag, 'admin runtime asset');
const runtimeAt = index.indexOf(runtimeTag);
for (const later of [
  '/app/admin-stability.js',
  '/app/admin-console.js',
  '/app/admin-health.js',
  '/app/admin-tools.js',
  '/app/admin-workflow.js',
  '/app/admin-navigation.js',
]) {
  const at = index.indexOf(later);
  if (at < 0) throw new Error(`Missing ${later}`);
  if (runtimeAt > at) throw new Error(`admin-runtime.js must load before ${later}`);
}

for (const token of [
  'const routes = new Map()',
  'new AbortController()',
  'async function unmountCurrent',
  'registerRoute',
  'onCleanup',
  'dtl:adminroutechange',
  'data-admin-section',
  'data-admin-tools',
  'data-admin-health',
  'data-jump',
  'event.stopImmediatePropagation()',
  'replayLegacyNavigation',
  'replayDepth',
  'navigationSequence',
  'adoptBootstrapOverview',
  'if (!adoptBootstrapOverview) persist(routeId)',
  'x-telegram-init-data',
  'async function api',
  "sessionStorage.setItem(STORAGE_KEY, id)",
  'window.DTL_ADMIN = Object.freeze',
]) requireToken(runtime, token);

forbidToken(runtime, 'window.fetch =', 'direct fetch ownership');
forbidToken(runtime, 'window.confirm =', 'confirmation ownership');
forbidToken(runtime, 'MutationObserver', 'DOM mutation observer');
forbidToken(runtime, 'setInterval(', 'polling loop');

requireToken(view, "window.DTL_ADMIN?.open", 'canonical admin entry');
requireToken(view, "window.DTL_ADMIN.open('section:overview')", 'overview route entry');

console.log('Admin runtime architecture audit passed.');
