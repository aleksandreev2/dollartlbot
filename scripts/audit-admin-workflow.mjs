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
need(index, '/app/admin-workflow.js?v=20260811-workflow1', 'workflow JS asset');
const stabilityPos = index.indexOf('/app/admin-stability.js?v=20260811-stability1');
const consolePos = index.indexOf('/app/admin-console.js?v=20260810-admin1');
const workflowPos = index.indexOf('/app/admin-workflow.js?v=20260811-workflow1');
if (!(stabilityPos >= 0 && stabilityPos < consolePos && consolePos < workflowPos)) {
  throw new Error('Workflow UX must load after the canonical admin console and on top of the stability runtime.');
}

for (const token of [
  "state.requestFilter",
  "state.requestQuery",
  "data-workflow-request",
  "admin-inbox-layout",
  "adminInboxDetail",
  "'/api/app/admin/requests/'",
  "data-workflow-save-notes",
  "data-workflow-publication",
  "renderQueue",
  "admin-active-translation",
  "data-queue-row",
  "draggable=\"true\"",
  "queue-position",
  "data-queue-action=\"progress\"",
  "progress_updated_at",
  "event.stopImmediatePropagation()",
  "window.DTL_ADMIN_WORKFLOW",
]) need(js, token, 'admin workflow runtime');

forbid(js, 'window.fetch =', 'workflow fetch ownership');
forbid(js, 'window.confirm(', 'workflow confirmation ownership');
forbid(js, 'new MutationObserver', 'workflow event lifecycle');

for (const token of [
  '.admin-inbox-layout',
  '.admin-inbox-row.selected',
  '.admin-inbox-detail',
  '.admin-queue-row',
  '.admin-queue-row.dragging',
  '.admin-active-progress',
  '@media(max-width:760px)',
]) need(css, token, 'admin workflow CSS');

console.log('Admin workflow audit passed: master-detail request inbox, live queue workflow, mobile controls, drag reorder and no duplicate fetch/confirm ownership.');
