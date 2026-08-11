import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const consoleJs = read('public/app/admin-console.js');
const workflowJs = read('public/app/admin-workflow.js');
const toolsJs = read('public/app/admin-tools.js');
const healthJs = read('public/app/admin-health.js');
const index = read('public/app/index.html');

function need(source, token, label = token) {
  if (!source.includes(token)) throw new Error(`Admin console routes: missing ${label}`);
}
function forbid(source, token, label = token) {
  if (source.includes(token)) throw new Error(`Admin console routes: forbidden ${label}`);
}

for (const token of [
  'const adminRuntime = window.DTL_ADMIN',
  'adminRuntime?.registerRoute',
  'adminRuntime.api(path, options)',
  'adminRuntime.toast?.(text,error)',
  'adminRuntime.icons?.()',
  "function routeId(section){return `section:${section}`;}",
  "error?.name==='AbortError'||!isActive(section)",
  "for(const section of ['overview','publishing','broadcasts','settings'])",
  'adminRuntime.registerRoute(routeId(section)',
  'mount:()=>renderSection(section)',
  'refresh:()=>renderSection(section)',
  "adminRuntime.open('section:overview')",
  'pubTitle',
  'pubBody',
  'pubPublish',
  '/api/app/admin/publications',
  'renderBroadcasts',
  'renderSettings',
  'saveAdminSettings',
]) need(consoleJs, token);

for (const token of [
  'function bindShellNavigation',
  'adminConsoleBound',
  "document.querySelectorAll('[data-jump]').forEach",
  'async function renderRequests(',
  'function adminCard(',
  'function bindActions(',
  "api('/api/app/admin/action'",
  "registerRoute('section:requests'",
  "registerRoute('section:queue'",
  'fetch(path',
  'window.fetch =',
]) forbid(consoleJs, token);

const expectedOwners = new Map([
  ['section:overview', consoleJs],
  ['section:requests', workflowJs],
  ['section:queue', workflowJs],
  ['section:publishing', consoleJs],
  ['section:broadcasts', consoleJs],
  ['section:settings', consoleJs],
  ['tools:publications', toolsJs],
  ['tools:users', toolsJs],
  ['tools:analytics', toolsJs],
  ['health:1', healthJs],
]);

for (const [route, source] of expectedOwners) {
  const [kind, value] = route.split(':', 2);
  if (kind === 'section' && !source.includes(value === 'overview'
      ? "['overview','publishing','broadcasts','settings']"
      : value === 'requests'
        ? "registerRoute('section:requests'"
        : value === 'queue'
          ? "registerRoute('section:queue'"
          : "['overview','publishing','broadcasts','settings']")) {
    throw new Error(`Admin route coverage: ${route} has no canonical owner.`);
  }
  if (kind === 'tools' && !source.includes(`${value}`)) {
    throw new Error(`Admin route coverage: ${route} has no canonical owner.`);
  }
  if (kind === 'health' && !source.includes("registerRoute('health:1'")) {
    throw new Error(`Admin route coverage: ${route} has no canonical owner.`);
  }
}

if (!index.includes('/app/admin-console.js?v=20260810-admin1&routes=20260811e')) {
  throw new Error('Admin console routes: cache-busted admin-console asset is missing from index.html');
}

new Function(consoleJs);
console.log('Admin console route audit passed: Overview, Publishing, Broadcasts and Settings use DTL_ADMIN, duplicate Requests/Queue rendering is gone, and every admin navigation destination has a canonical owner.');
