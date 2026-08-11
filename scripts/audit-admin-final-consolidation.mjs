import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const need = (source, token, label = token) => { if (!source.includes(token)) throw new Error(`Admin final consolidation: missing ${label}`); };
const forbid = (source, token, label = token) => { if (source.includes(token)) throw new Error(`Admin final consolidation: forbidden ${label}`); };

const runtime = read('public/app/admin-runtime.js');
const stability = read('public/app/admin-stability.js');
const consoleJs = read('public/app/admin-console.js');
const publishingView = read('public/app/admin-publishing-view.js');
const broadcasts = read('public/app/admin-broadcasts.js');
const publishingCenter = read('public/app/admin-publishing-center.js');
const index = read('public/app/index.html');
const pkg = read('package.json');
const integration = read('tests/admin-integration.spec.mjs');

for (const source of [runtime, stability, consoleJs]) forbid(source, 'dtl:admin:last-section', 'legacy admin storage key');
for (const token of ['restoreNav', 'selectorForToken', 'saveNav', 'activeNavButton']) forbid(stability, token, `stability ${token}`);
for (const token of ['renderPublishing', 'renderBroadcasts', 'scheduleLegacyAdminMigration', '.admin-stats']) forbid(consoleJs, token, `console ${token}`);
forbid(runtime, 'button.click()', 'runtime synthetic route click');
forbid(runtime, 'LEGACY_STORAGE_KEY', 'runtime legacy storage migration');
need(consoleJs, "document.dispatchEvent(new CustomEvent('dtl:adminrender'", 'semantic admin render event');

need(publishingView, "admin.registerRoute('section:publishing'", 'dedicated Publishing route owner');
need(broadcasts, "admin.registerRoute('section:broadcasts'", 'dedicated Broadcasts route owner');
need(publishingCenter, "new Set(['section:publishing','tools:publications','section:broadcasts'])", 'Publishing Center tab routes');
need(index, '/app/admin-publishing-view.js?v=20260811-view2', 'Publishing view asset');
need(index, '/app/admin-runtime.js?v=20260811-runtime2&canonical=20260811h', 'final runtime asset');
need(index, '/app/admin-stability.js?v=20260811-stability2', 'final stability asset');
need(index, '/app/admin-console.js?v=20260811-admin2&routes=20260811f', 'final console asset');

need(pkg, 'tests/admin-integration.spec.mjs', 'full admin integration browser suite');
for (const token of [
  'Overview → Requests → Queue → Publishing → Publications → Broadcasts → Users → Health',
  'window.DTL_ADMIN.activeRoute()', 'section:publishing', 'tools:publications', 'section:broadcasts', 'tools:users', 'health:1',
  'admin integration mutation', 'autosave survives real module navigation', 'mobile admin shell does not overflow',
]) need(integration, token, `integration coverage ${token}`);

const publishingOwners = [consoleJs, publishingView, broadcasts].filter(source => source.includes("registerRoute('section:publishing'")).length;
if (publishingOwners !== 1) throw new Error(`Admin final consolidation: expected one Publishing route owner, found ${publishingOwners}.`);
const broadcastOwners = [consoleJs, publishingView, broadcasts].filter(source => source.includes("registerRoute('section:broadcasts'")).length;
if (broadcastOwners !== 1) throw new Error(`Admin final consolidation: expected one Broadcasts route owner, found ${broadcastOwners}.`);

console.log('Admin final consolidation audit passed: no legacy route storage/replay, split canonical route owners, semantic render events, one Publishing Center navigation surface, and integration browser coverage.');
