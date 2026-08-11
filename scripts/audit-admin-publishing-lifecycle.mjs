import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const publishing = read('public/app/admin-publishing.js');
const index = read('public/app/index.html');

function need(token, label = token) {
  if (!publishing.includes(token)) throw new Error(`Admin publishing lifecycle: missing ${label}`);
}
function forbid(token, label = token) {
  if (publishing.includes(token)) throw new Error(`Admin publishing lifecycle: forbidden ${label}`);
}

for (const token of [
  'const adminRuntime=window.DTL_ADMIN',
  'adminRuntime.api(path,options)',
  'adminRuntime.toast?.(text,error)',
  'adminRuntime.icons?.()',
  "adminRuntime.activeRoute?.()==='section:publishing'",
  "adminRuntime.activeRoute?.()==='tools:publications'",
  "error?.name==='AbortError'||!isPublishingRoute()",
  'function startLogs()',
  'logTimer=setTimeout',
  'clearTimeout(logTimer)',
  "document.addEventListener('dtl:adminroutechange'",
  "if(id==='section:publishing')",
  "if(id==='tools:publications')",
  'installedEditor=null;stopLogs()',
  "if(document.visibilityState==='visible'&&isPublishingRoute())",
  'if(!isPublishingRoute()||!body.isConnected)return',
  'if(!isManagementRoute()||!card.isConnected)return',
  "adminRuntime.refresh()",
  'window.DTL_ADMIN_PUBLISHING=Object.freeze',
]) need(token);

for (const token of [
  'const tg=window.Telegram?.WebApp',
  "const H=()=>({'x-telegram-init-data'",
  'fetch(path',
  'window.fetch =',
  'setInterval(',
  "document.addEventListener('click',e=>{if(e.target.closest?.('[data-admin-tools=\"publications\"]')",
]) forbid(token);

for (const feature of [
  'pubImageSpoiler',
  'publishingHealth',
  'publishingLogs',
  '/api/app/admin/publishing/diagnostics',
  '/api/app/admin/publishing/logs',
  '/api/app/admin/publications',
  '/edit',
  '/delete-telegram',
  'createAndAct',
  'installManagement',
]) need(feature, `preserved publishing feature ${feature}`);

if (!index.includes('/app/admin-publishing.js?v=20260810-admin1&lifecycle=20260811f')) {
  throw new Error('Admin publishing lifecycle: cache-busted admin-publishing asset is missing from index.html');
}

new Function(publishing);
console.log('Admin publishing lifecycle audit passed: shared API ownership, route-scoped diagnostics/log polling, stale-read guards, management route isolation and no always-on interval.');
