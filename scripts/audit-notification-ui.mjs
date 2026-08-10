import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const js=read('public/app/notifications-ui.js');
const css=read('public/app/notifications-ui.css');
const index=read('public/app/index.html');

function need(source,needle,label){if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);}
function forbid(source,needle,label){if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);}

for(const token of [
  'let settingsOpen=false',
  'aria-expanded="false"',
  'id="notificationSettings" hidden',
  "document.getElementById('notifPrefsButton')?.addEventListener('click',toggleSettings)",
  "input.addEventListener('change',schedulePreferenceSave)",
  "setTimeout(()=>savePreferences(version),260)",
  "'/api/app/notifications/preferences'",
  "new CustomEvent('dtl:notifications'",
  'bodyMarkup(n.body)',
  'notification-subject',
  'notification-detail',
]) need(js,token,'notification center');

forbid(js,'id="notifSave"','notification center manual save button');
forbid(js,"getElementById('notifSave')",'notification center manual save binding');
forbid(js,'new MutationObserver','notification center observer');
forbid(js,'window.fetch =','notification center fetch wrapper');

for(const token of [
  '.notification-settings[hidden]{display:none}',
  '.notification-settings-trigger',
  '.notification-list{display:grid;grid-template-columns:minmax(0,1fr)',
  '.notification-item-body{display:grid',
  '.notification-subject{',
  '.notification-detail{',
]) need(css,token,'notification center CSS');
forbid(css,'grid-template-columns:1fr 1fr','notification center two-column feed');

need(index,'/app/notifications-ui.css?v=20260810-notify2','notification CSS cache bust');
need(index,'/app/notifications-ui.js?v=20260810-notify2','notification JS cache bust');

console.log('Notification center UX audit passed: feed-first layout, collapsed settings, autosave preferences, compact one-column cards, and semantic notification body hierarchy.');
