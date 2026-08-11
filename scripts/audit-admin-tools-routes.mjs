import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tools = read('public/app/admin-tools.js');
const index = read('public/app/index.html');

const need = (token, label = token) => {
  if (!tools.includes(token)) throw new Error(`Admin tools routes: missing ${label}`);
};
const forbid = (token, label = token) => {
  if (tools.includes(token)) throw new Error(`Admin tools routes: forbidden ${label}`);
};

for (const token of [
  'const adminRuntime=window.DTL_ADMIN',
  'adminRuntime?.registerRoute',
  'adminRuntime.api(path,options)',
  'adminRuntime.toast?.(text,error)',
  'adminRuntime.setHead?.(title,subtitle)',
  'adminRuntime.content?.(html)',
  "function routeId(section){return `tools:${section}`;}",
  "function isActive(section){return active===section&&adminRuntime.activeRoute?.()===routeId(section);}",
  "error?.name==='AbortError'||!isActive(section)",
  "publications:['files','Публикации']",
  "users:['users','Пользователи']",
  "analytics:['chart-no-axes-combined','Аналитика']",
  'for(const section of Object.keys(extra))',
  'adminRuntime.registerRoute(routeId(section)',
  'mount:()=>render(section)',
  'refresh:()=>render(section)',
  'unmount:()=>deactivate(section)',
  'runtime.registerPatcher(install)',
  'window.DTL_ADMIN_TOOLS=Object.freeze',
  "open:section=>adminRuntime.open(routeId(section))",
  "'\"':'&quot;'",
]) need(token);

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
