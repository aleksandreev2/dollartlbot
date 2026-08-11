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
const js = read('public/app/admin-workflow.js');
const css = read('public/app/admin-workflow.css');

need(index, '/app/admin-workflow.css?v=20260811-workflow1', 'workflow CSS asset');
need(index, '/app/admin-workflow.js?v=20260811-workflow1&routes=20260811d', 'workflow JS asset');
const runtimePos = index.indexOf('/app/admin-runtime.js?v=20260811-runtime1');
const consolePos = index.indexOf('/app/admin-console.js?v=20260810-admin1');
const workflowPos = index.indexOf('/app/admin-workflow.js?v=20260811-workflow1');
if (!(runtimePos >= 0 && runtimePos < consolePos && consolePos < workflowPos)) {
  throw new Error('Workflow UX must load after the canonical admin console and with DTL_ADMIN runtime already available.');
}

for (const token of [
  'const adminRuntime = window.DTL_ADMIN',
  'adminRuntime?.registerRoute',
  'adminRuntime.api(path, options)',
  'adminRuntime.activeRoute',
  "routeId = section => `section:${section}`",
  "error?.name === 'AbortError'",
  "adminRuntime.registerRoute('section:requests'",
  "adminRuntime.registerRoute('section:queue'",
  "unmount: () => deactivate('requests')",
  "unmount: () => deactivate('queue')",
  "openRequests: () => adminRuntime.open('section:requests')",
  "openQueue: () => adminRuntime.open('section:queue')",
  'state.requestFilter',
  'state.requestQuery',
  'data-workflow-request',
  'admin-inbox-layout',
  'adminInboxDetail',
  '/api/app/admin/requests/',
  'data-workflow-save-notes',
  'data-workflow-publication',
  'renderQueue',
  'admin-active-translation',
  'data-queue-row',
  'draggable="true"',
  'queue-position',
  'data-queue-action="progress"',
  'progress_updated_at',
  'window.DTL_ADMIN_WORKFLOW',
]) need(js, token, 'admin workflow runtime');

for (const token of [
  'window.fetch =',
  'fetch(path',
  "const H = () => ({ 'x-telegram-init-data'",
  'event.stopImmediatePropagation()',
  "event.target.closest?.('[data-admin-section=\"requests\"]",
  'window.confirm(',
  'new MutationObserver',
]) forbid(js, token, 'workflow route ownership');

for (const token of [
  '.admin-inbox-layout',
  '.admin-inbox-row.selected',
  '.admin-inbox-detail',
  '.admin-queue-row',
  '.admin-queue-row.dragging',
  '.admin-active-progress',
  '@media(max-width:760px)',
]) need(css, token, 'admin workflow CSS');

new Function(js);
console.log('Admin workflow audit passed: canonical Requests/Queue lifecycle, master-detail inbox, live queue workflow, mobile controls, drag reorder and shared admin API ownership.');
