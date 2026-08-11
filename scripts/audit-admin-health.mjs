import fs from 'node:fs';

const root=new URL('../',import.meta.url);
const read=file=>fs.readFileSync(new URL(file,root),'utf8');
const need=(src,token,label)=>{if(!src.includes(token))throw new Error(`${label}: missing ${token}`);};
const forbid=(src,token,label)=>{if(src.includes(token))throw new Error(`${label}: forbidden ${token}`);};

const backend=read('src/admin-health.ts');
const index=read('src/index.ts');
const ui=read('public/app/admin-health.js');
const css=read('public/app/admin-health.css');
const html=read('public/app/index.html');

for(const token of [
  "'/api/app/admin/health'",
  "'/api/app/admin/health/action'",
  'authenticateMiniAppRequest(request, env)',
  "if (!auth.admin)",
  'STUCK_PUBLISHING_MS = 10 * 60 * 1000',
  'MANUAL_NOTIFICATION_RETRY_LIMIT = 100',
  'MANUAL_BROADCAST_RETRY_LIMIT = 250',
  "queue_position IS NULL OR queue_position < 1",
  'GROUP BY queue_position HAVING COUNT(*) > 1',
  "status='publishing' AND updated_at < ?",
  "comments_check_status='needs_attention'",
  "delivery_status='failed'",
  "telegram_status='failed'",
  "broadcast_recipients WHERE status='failed'",
  "telegram.call<{ id: number; username?: string }>('getMe'",
  "telegram.call<TelegramChat>('getChat'",
  "telegram.call<BotMember>('getChatMember'",
  'normalizeQueuePositions(env)',
  "SET telegram_status='retry',telegram_next_attempt_at=?",
  "SET status='retry',next_attempt_at=?,updated_at=?",
  'runNotificationMaintenance(env, telegram)',
  'runBroadcastMaintenanceWithLease(env, telegram, 12)',
  'runPublicationDeliveryMaintenance(env, telegram, 25)',
  'retryPendingAdminDeliveries(env, telegram)',
  "target_type,target_id,details,created_at",
  "'operations_health'",
])need(backend,token,'admin health backend');

for(const token of [
  "import { handleAdminHealthRequest } from './admin-health'",
  'handleAdminHealthRequest(request, env, apiTelegram)',
])need(index,token,'health route');

for(const token of [
  "dataset.adminHealth='1'",
  'Operations & Health',
  "api('/api/app/admin/health')",
  "api('/api/app/admin/health/action'",
  "actionButton('retry_notifications'",
  "actionButton('retry_broadcasts'",
  "actionButton('retry_publications'",
  "actionButton('normalize_queue'",
  'window.confirm(',
  "document.querySelector('[data-admin-section=\"publishing\"]')?.click()",
  'window.DTL_ADMIN_HEALTH=Object.freeze',
])need(ui,token,'health UI');

forbid(backend,"sendMessage(settings.publish_channel_id",'health must not republish failed channel posts');
forbid(backend,"SET status='draft'",'health must not reset ambiguous publication state');
for(const token of ['.ops-health-status','.ops-health-actions','.ops-health-grid','.ops-health-issues'])need(css,token,'health CSS');
need(html,'/app/admin-health.css?v=20260811-health1','health CSS asset');
need(html,'/app/admin-health.js?v=20260811-health1','health JS asset');
new Function(ui);

console.log('Admin Operations & Health audit passed: unified queue/publication/notification/Telegram diagnostics, bounded manual retries, safe maintenance, audit logging, and no automatic republish of ambiguous failed channel posts.');
