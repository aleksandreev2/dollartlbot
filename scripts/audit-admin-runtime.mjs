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

const runtimeTag = '/app/admin-runtime.js?v=20260811-runtime2&canonical=20260811h';
requireToken(index, runtimeTag, 'admin runtime final cache-bust');
const runtimeAt = index.indexOf(runtimeTag);
for (const later of [
  '/app/admin-stability.js',
  '/app/admin-console.js',
  '/app/admin-publishing-view.js',
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
  "const STORAGE_KEY = 'dtl:admin:route:v2'",
  'const routes = new Map()',
  'new AbortController()',
  'async function unmountCurrent',
  'registerRoute',
  'onCleanup',
  'dtl:adminroutechange',
  'dtl:adminrouteerror',
  'data-admin-section',
  'data-admin-tools',
  'data-admin-health',
  'data-jump',
  'event.stopImmediatePropagation()',
  'navigationSequence',
  'adoptBootstrapOverview',
  'function restoredRouteId()',
  "routes.has('section:overview')",
  'function rejectUnknownRoute(routeId)',
  'if (!route) return rejectUnknownRoute(routeId)',
  "const method = String(options.method || 'GET').toUpperCase()",
  "method !== 'GET' && method !== 'HEAD'",
  'function bindReadSignal',
  'function abortReads()',
  'x-telegram-init-data',
  'async function api',
  'window.DTL_ADMIN = Object.freeze',
]) requireToken(runtime, token);

for (const token of [
  'dtl:admin:last-section',
  'LEGACY_STORAGE_KEY',
  'replayLegacyNavigation',
  'replayDepth',
  'legacy: true',
  'button.click()',
  "document.addEventListener('dtl:adminrender'",
  'signal: options.signal || controller?.signal',
  'window.__DTL_ADMIN_CACHE__?.clear?.()',
  'window.fetch =',
  'window.confirm =',
  'MutationObserver',
  'setInterval(',
]) forbidToken(runtime, token);

requireToken(view, "window.DTL_ADMIN?.restore", 'canonical admin restore availability');
requireToken(view, 'return window.DTL_ADMIN.restore()', 'canonical restored admin entry');
forbidToken(view, 'DTL_ADMIN_CONSOLE.open()', 'direct console entry');
forbidToken(view, "DTL_ADMIN.open('section:overview')", 'hard-coded overview entry');

console.log('Admin runtime architecture audit passed: registered routes only, v2 restore only, fail-closed unknown routes, route-scoped reads and mutation-safe navigation.');
