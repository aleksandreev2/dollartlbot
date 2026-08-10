import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

const notifications=read('src/notifications.ts');
const adminState=read('src/admin-state.ts');
const referrals=read('src/referrals.ts');
const index=read('src/index.ts');
const migration=read('migrations/0015_notification_delivery_state.sql');
const deeplink=read('public/app/notification-deeplink.js');
const ui=read('public/app/notifications-ui.js');
const css=read('public/app/notifications-ui.css');
const html=read('public/app/index.html');

for(const token of [
  'preference_key TEXT',
  'dedupe_key TEXT',
  'telegram_status TEXT',
  'telegram_attempts INTEGER',
  'telegram_next_attempt_at TEXT',
  'idx_user_notifications_dedupe',
  'submission_notification_state',
  'pending_progress_chapter',
  'next_progress_notify_at',
])need(migration,token,'notification migration');

for(const token of [
  'PROGRESS_NOTIFICATION_WINDOW_MS = 10 * 60 * 1000',
  "telegram_status IN ('queued', 'retry')",
  "telegram_status='skipped'",
  "telegram_status='sent'",
  "retryable ? 'retry' : 'failed'",
  'preferenceValue(body',
  'scheduleProgressNotification',
  'runProgressNotificationMaintenance',
  'runDirectNotificationMaintenance',
  'requestActionUrl(s.id)',
  "'notify_request_updates'",
  'Since the last notification',
  'С прошлого уведомления',
])need(notifications,token,'notification delivery');

need(adminState,'if (before.current_chapter === chapter) return before;','idempotent progress updates');
need(adminState,'resetProgressNotificationState','progress debounce lifecycle');
need(index,"runScheduledTask('notification_maintenance'",'scheduled notification delivery');

need(referrals,'sendUserNotification','referral durable notification');
need(referrals,"'notify_referrals'",'referral preference enforcement');
need(referrals,'`referral:${row.id}:qualified`','referral notification dedupe');
forbid(referrals,'telegram.sendMessage(row.referrer_user_id, grant ? NOTIFY','legacy referral direct notification');

for(const token of [
  "new Set(['home','queue','suggest','requests','account'])",
  "url.searchParams.get('request')",
  "instance.state.requestFilter='all'",
  "document.addEventListener('dtl:requests',focusRequest)",
  "window.DTL_NOTIFICATION_LINK=Object.freeze({open})",
])need(deeplink,token,'notification deep link');
need(ui,'data-action-url','notification card target');
need(ui,'DTL_NOTIFICATION_LINK?.open','notification card routing');
need(css,'.request-card.notification-target','request highlight');
need(html,'/app/notification-deeplink.js?v=20260810-notify1','notification deep-link asset');
need(html,'/app/notifications-ui.js?v=20260810-notify3','notification UI cache bust');
need(html,'/app/notifications-ui.css?v=20260810-notify3','notification CSS cache bust');

console.log('Notification delivery audit passed: durable retries, preserved preferences, idempotent/debounced progress, referral preference routing, and request deep links.');
