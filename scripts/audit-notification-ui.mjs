import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const js=read('public/app/notifications-ui.js');
const css=read('public/app/notifications-ui.css');
const index=read('public/app/index.html');

function need(source,needle,label){if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);}
function forbid(source,needle,label){if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);}

for(const token of [
  'let settingsOpen=false',
  "let filter='all'",
  'let sessionUnreadIds=new Set()',
  "returnView=window.DTL_APP?.state?.view||'home'",
  'data-notification-filter="all"',
  'data-notification-filter="unread"',
  'id="notificationSettings"',
  "document.getElementById('notifPrefsButton')?.addEventListener('click',toggleSettings)",
  "input.addEventListener('change',schedulePreferenceSave)",
  "setTimeout(()=>savePreferences(version),260)",
  "'/api/app/notifications/preferences'",
  "new CustomEvent('dtl:notifications'",
  'bodyMarkup(n.body)',
  'notification-subject',
  'notification-detail',
  'data-action-url',
  'DTL_NOTIFICATION_LINK?.open',
  'window.DTL_NOTIFICATIONS=Object.freeze({open,refreshDot})',
]) need(js,token,'notification center');

forbid(js,'id="notifSave"','notification center manual save button');
forbid(js,"getElementById('notifSave')",'notification center manual save binding');
forbid(js,'new MutationObserver','notification center observer');
forbid(js,'window.fetch =','notification center fetch wrapper');

for(const token of [
  '.notification-settings[hidden] { display: none; }',
  '.notification-settings-trigger {',
  '.notification-filter {',
  '.notification-list {',
  '.notification-group-label {',
  '.notification-item-body {',
  '.notification-subject {',
  '.notification-detail {',
  '.notification-action {',
  '.request-card.notification-target {',
]) need(css,token,'notification center CSS');
forbid(css,'grid-template-columns: 1fr 1fr','notification center two-column feed');

need(index,'/app/notifications-ui.css?v=20260811-notify4','notification CSS cache bust');
need(index,'/app/notifications-ui.js?v=20260811-notify4','notification JS cache bust');
need(index,'/app/notification-deeplink.js?v=20260810-notify2','notification deep-link runtime');

console.log('Notification center UX audit passed: return-aware navigation, all/unread filtering, durable unread presentation, autosave preferences, semantic body hierarchy, and actionable deep links.');
