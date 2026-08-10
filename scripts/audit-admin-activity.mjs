import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

const migration=read('migrations/0019_admin_events.sql');
const store=read('src/admin-events.ts');
const api=read('src/admin-events-api.ts');
const access=read('src/access-gate.ts');
const auth=read('src/miniapp-auth.ts');
const db=read('src/db.ts');
const users=read('src/admin-users.ts');
const index=read('src/index.ts');
const ui=read('public/app/admin-activity.js');
const css=read('public/app/admin-activity.css');
const deeplink=read('public/app/notification-deeplink.js');
const html=read('public/app/index.html');

for(const token of [
  'ALTER TABLE users ADD COLUMN activated_at TEXT',
  "activated_via TEXT CHECK (activated_via IN ('legacy','bot','miniapp'))",
  'ALTER TABLE users ADD COLUMN last_seen_at TEXT',
  "activated_via = COALESCE(activated_via, 'legacy')",
  'CREATE TABLE IF NOT EXISTS admin_events',
  "telegram_status IN ('queued','sending','retry','sent','failed','skipped')",
  'idx_admin_events_dedupe',
  'idx_admin_events_unread',
  'idx_admin_events_telegram_due',
])need(migration,token,'admin activity migration');

for(const token of [
  'export async function markUserActivated(',
  'activationMemo',
  "const dedupeKey = `new_user:${userId}`",
  "SELECT 'new_user', 'info'",
  'WHERE telegram_id = ? AND activated_at IS NULL',
  'activated_at = COALESCE(activated_at, ?)',
  'export async function runAdminEventMaintenance(',
  "telegram_status='sending'",
  "retryable ? 'retry' : 'failed'",
  'ADMIN_EVENT_MAX_ATTEMPTS = 5',
  "web_app: { url: actionUrl }",
  'build && !target.searchParams.has(\'build\')',
])need(store,token,'admin event store');
forbid(store,'await deliverAdminEventById(env, telegram, eventId).catch','activation must not block access on Telegram delivery');

for(const token of [
  "url.pathname.startsWith('/api/app/admin/events')",
  "url.searchParams.get('summary') === '1'",
  "filter === 'unread'",
  "filter === 'problems'",
  "url.pathname === '/api/app/admin/events/read'",
  '/retry$/.exec',
  'retryAdminEventDelivery',
])need(api,token,'admin events API');

need(access,"import { markUserActivated } from './admin-events'",'access activation integration');
need(access,"activationSource?: 'bot' | 'miniapp'",'activation source');
need(access,"await markUserActivated(env, userId, options.activationSource ?? 'bot')",'non-admin activation');
need(auth,"activationSource: 'miniapp'",'Mini App activation source');
need(db,'last_seen_at = excluded.last_seen_at','last-seen tracking');
need(db,'created_at, updated_at, activated_at, activated_via, last_seen_at','user activation read model');
need(users,'u.activated_at,u.activated_via,u.last_seen_at','admin user activation metadata');

for(const token of [
  'handleAdminEventsRequest(request, env, apiTelegram)',
  "runScheduledTask('admin_event_maintenance'",
  'ctx.waitUntil(runAdminEventMaintenance(env, apiTelegram, 4))',
  'ctx.waitUntil(runAdminEventMaintenance(env, telegram, 4))',
])need(index,token,'admin event routing and maintenance');

for(const token of [
  'data-admin-activity',
  "filter = 'all'",
  "filterButton('unread','Непрочитанные')",
  "filterButton('problems','Проблемы')",
  "'/api/app/admin/events?summary=1'",
  "'/api/app/admin/events/read'",
  "data-activity-retry",
  "url.searchParams.get('admin') !== 'activity'",
  'data-activity-user',
  'window.DTL_ADMIN_ACTIVITY',
])need(ui,token,'admin activity UI');
forbid(ui,'new MutationObserver','admin activity observer');
forbid(ui,'window.fetch =','admin activity fetch wrapper');
new Function(ui);

for(const token of ['.admin-activity-badge','.admin-activity-event.unread','.admin-activity-target','@media(max-width:720px)'])need(css,token,'admin activity CSS');
need(deeplink,"new Set(['home','queue','suggest','requests','account','admin'])",'admin deep link support');
need(html,'/app/admin-activity.css?v=20260810-adminactivity1','admin activity CSS asset');
need(html,'/app/admin-activity.js?v=20260810-adminactivity1','admin activity JS asset');
need(html,'/app/notification-deeplink.js?v=20260810-notify2','fresh notification deep link');

console.log('Admin activity audit passed: legacy users are backfilled without alert spam, first real access creates one deduped durable event, Telegram delivery is non-blocking with bounded retries, and the Admin Activity Center has unread/problem filters and deep links.');
