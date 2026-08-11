import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const consoleJs = read('public/app/admin-console.js');
const publishingView = read('public/app/admin-publishing-view.js');
const broadcastsJs = read('public/app/admin-broadcasts.js');
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
  "const routeId = section => `section:${section}`",
  "for (const section of ['overview', 'settings'])",
  'adminRuntime.registerRoute(routeId(section)',
  'mount: () => renderSection(section)',
  'refresh: () => renderSection(section)',
  'renderOverview',
  'renderSettings',
  'saveAdminSettings',
  'window.DTL_ADMIN_CONSOLE',
  'markSection: syncSection',
]) need(consoleJs, token);

for (const token of [
  'renderPublishing',
  'renderBroadcasts',
  'bindPublisher',
  'createPublication',
  'pubTitle',
  'pubBody',
  "['overview','publishing','broadcasts','settings']",
  'scheduleLegacyAdminMigration',
  '.admin-stats',
  'dtl:adminrender',
  'sessionStorage',
  'button.click()',
]) forbid(consoleJs, token);

for (const token of [
  "admin.registerRoute('section:publishing'",
  'publisher-editor',
  'pubTitle',
  'pubBody',
  'pubPublish',
  '/api/app/admin/publishing',
  'bindPreview',
  'bindPublicationRows',
  'unmount: clearPreviewUrl',
]) need(publishingView, token, 'dedicated publishing view');
forbid(publishingView, "addEventListener('click', () => void create", 'duplicate create action owner');

need(broadcastsJs, "admin.registerRoute('section:broadcasts'", 'dedicated broadcasts route');
need(workflowJs, "registerRoute('section:requests'", 'requests route');
need(workflowJs, "registerRoute('section:queue'", 'queue route');
need(healthJs, "registerRoute('health:1'", 'health route');
for (const route of ['publications', 'users', 'analytics']) need(toolsJs, route, `tools:${route}`);

const expectedOwners = new Map([
  ['section:overview', consoleJs],
  ['section:settings', consoleJs],
  ['section:publishing', publishingView],
  ['section:broadcasts', broadcastsJs],
  ['section:requests', workflowJs],
  ['section:queue', workflowJs],
  ['tools:publications', toolsJs],
  ['tools:users', toolsJs],
  ['tools:analytics', toolsJs],
  ['health:1', healthJs],
]);
for (const [route, source] of expectedOwners) {
  const value = route.split(':', 2)[1];
  if (!source.includes(value)) throw new Error(`Admin route coverage: ${route} has no canonical owner.`);
}

const consoleTag = '/app/admin-console.js?v=20260811-admin2&routes=20260811f';
const publishingTag = '/app/admin-publishing-view.js?v=20260811-view1';
need(index, consoleTag, 'consolidated admin console asset');
need(index, publishingTag, 'dedicated publishing view asset');
if (index.indexOf(publishingTag) < index.indexOf(consoleTag)) {
  throw new Error('Dedicated Publishing route must load after the shell owner.');
}

new Function(consoleJs);
new Function(publishingView);
console.log('Admin route audit passed: shell owns only Overview/Settings, Publishing and Broadcasts have dedicated owners, and no legacy renderer remains in admin-console.js.');
