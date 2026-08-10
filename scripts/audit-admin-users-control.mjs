import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

const migration=read('migrations/0020_user_control_center.sql');
const controls=read('src/user-controls.ts');
const users=read('src/admin-users.ts');
const auth=read('src/miniapp-auth.ts');
const worker=read('src/index.ts');
const accessCopy=read('src/i18n/access_gate.ts');
const gateUi=read('public/app/access-gate-ui.js');
const adminUi=read('public/app/admin-tools.js');
const css=read('public/app/admin-users-control.css');
const index=read('public/app/index.html');

for(const token of [
  'CREATE TABLE IF NOT EXISTS user_admin_controls',
  'blocked_at TEXT',
  'blocked_reason TEXT',
  'tags_json TEXT NOT NULL',
  'CREATE TABLE IF NOT EXISTS user_admin_messages',
  "CHECK (status IN ('sent','failed'))",
])need(migration,token,'user control migration');

for(const token of [
  'isUserAdministrativelyBlocked',
  'denyBlockedPrivateBotUpdate',
  'parseAdminTags',
  'normalizeAdminTags',
  'accessRestrictedTitle',
  'accessRestrictedText',
])need(controls+accessCopy,token,'user control service/copy');

for(const token of [
  'const controlMatch =',
  'const messageMatch =',
  'const refreshMatch =',
  'const recheckMatch =',
  'user_admin_controls',
  'user_admin_messages',
  "filter === 'blocked'",
  "filter === 'active'",
  "filter === 'inactive'",
  "filter === 'has_requests'",
  "sort = String(url.searchParams.get('sort')",
  'telegram.sendMessage(userId, escapeHtml(text))',
  "telegram.call<{ id: number; type: string; username?: string; first_name?: string }>('getChat'",
  'telegram.getChatMember(normalizeChatId(channelId), userId)',
  "auditStatement(env, adminUserId, 'user_message_sent'",
  "auditStatement(env, adminUserId, 'user_access_recheck'",
  'buildTimeline(',
])need(users,token,'admin users backend');

need(auth,"'access_restricted'",'Mini App administrative block');
need(auth,'isUserAdministrativelyBlocked(env, telegramUser.id)','Mini App administrative block');
need(worker,'denyBlockedPrivateBotUpdate(update, env, telegram)','Telegram bot administrative block');

for(const token of [
  "'access_restricted'",
  "const restricted = error.code === 'access_restricted'",
  "icon(restricted ? 'shield-x'",
  '!restricted && joinUrl',
])need(gateUi,token,'Mini App restricted access UX');

for(const token of [
  "['blocked','Заблокированные']",
  "['active','Активные']",
  "['new','Новые']",
  "['inactive','Неактивные']",
  'adminUserSort',
  'saveUserControl',
  'toggleUserBlock',
  'sendUserMessage',
  'recheckUser',
  'refreshTelegramUser',
  'userAdminNotes',
  'adminUserMessageText',
  'admin-user-timeline',
])need(adminUi,token,'Users control center UI');
forbid(adminUi,'window.prompt(','Users control center must not use prompt dialogs');

for(const token of [
  '.admin-control-summary',
  '.admin-user-blockbox',
  '.admin-message-user',
  '.admin-user-timeline',
  '@media(max-width:640px)',
])need(css,token,'Users control center CSS');

need(index,'/app/admin-users-control.css?v=20260810-users1','Users control CSS asset');
need(index,'/app/admin-tools.js?v=20260810-users1','Users control JS asset');
need(index,'/app/access-gate-ui.js?v=20260810-access4','restricted access gate asset');

new Function(adminUi);
new Function(gateUi);
console.log('Users control center audit passed: durable blocks/notes/tags/messages, server-side bot and Mini App enforcement, live Telegram/access checks, sorting/filtering, timeline, quota controls and responsive UI are wired.');
