import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tools = read('public/app/admin-tools.js');
const index = read('public/app/index.html');

function need(token, label = token) {
  if (!tools.includes(token)) throw new Error(`Admin tools routes: missing ${label}`);
}
function forbid(token, label = token) {
  if (tools.includes(token)) throw new Error(`Admin tools routes: forbidden ${label}`);
}
function needPattern(pattern, label) {
  if (!pattern.test(tools)) throw new Error(`Admin tools routes: missing ${label}`);
}

for (const token of [
  'window.DTL_ADMIN',
  'adminRuntime.api',
  'adminRuntime.toast',
  'adminRuntime.setHead',
  'adminRuntime.content',
  'adminRuntime.activeRoute',
  "tools:${section}",
  "error?.name==='AbortError'",
  "publications:['files','Публикации']",
  "users:['users','Пользователи']",
  "analytics:['chart-no-axes-combined','Аналитика']",
  'Object.keys(extra)',
  'adminRuntime.registerRoute',
  'mount:()=>render(section)',
  'refresh:()=>render(section)',
  'unmount:()=>deactivate(section)',
  'runtime.registerPatcher(install)',
  'window.DTL_ADMIN_TOOLS=Object.freeze',
  'adminRuntime.open(routeId(section))',
  '&quot;',
]) need(token);

needPattern(/if\s*\(\s*!runtime\?\.registerPatcher\s*\|\|\s*!adminRuntime\?\.registerRoute\s*\)/, 'canonical runtime load guard');
needPattern(/function\s+isActive\(section\)[\s\S]*?adminRuntime\.activeRoute\?\.\(\)===routeId\(section\)/, 'route-current guard');
needPattern(/for\s*\(const section of Object\.keys\(extra\)\)[\s\S]*?adminRuntime\.registerRoute\(routeId\(section\)/, 'Tools route registration loop');

for (const userToken of [
  'saveUserControl',
  'toggleUserBlock',
  'sendUserMessage',
  'recheckUser',
  'refreshTelegramUser',
  'userAdminNotes',
  'adminUserMessageText',
  'admin-user-timeline',
  '/quota',
  '/control',
  '/message',
  '/recheck',
  '/refresh-telegram',
]) need(userToken, `preserved Users feature ${userToken}`);

for (const token of [
  'window.fetch =',
  'fetch(path',
  "const H = () => ({ 'x-telegram-init-data'",
  "const custom=e.target.closest?.('[data-admin-tools]')",
  'event.stopImmediatePropagation()',
  "document.addEventListener('click',e=>",
  "document.addEventListener('click', event =>",
  'new MutationObserver',
  'window.prompt(',
]) forbid(token);

if (!index.includes('/app/admin-tools.js?v=20260810-users1&routes=20260811c')) {
  throw new Error('Admin tools routes: cache-busted admin-tools asset is missing from index.html');
}

new Function(tools);
console.log('Admin tools route audit passed: Users, Analytics and publication management use canonical route lifecycle and shared admin API without global route click ownership.');
