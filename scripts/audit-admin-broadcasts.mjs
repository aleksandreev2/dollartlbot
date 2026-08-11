import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const need = (source, token, label = token) => { if (!source.includes(token)) throw new Error(`Missing ${label}: ${token}`); };
const forbid = (source, token, label = token) => { if (source.includes(token)) throw new Error(`Forbidden ${label}: ${token}`); };

const migration = read('migrations/0022_broadcast_center.sql');
const center = read('src/broadcast-center.ts');
const api = read('src/admin-broadcasts.ts');
const runner = read('src/broadcast-runner.ts');
const ui = read('public/app/admin-broadcasts.js');
const css = read('public/app/admin-broadcasts.css');
const indexTs = read('src/index.ts');
const html = read('public/app/index.html');

for (const token of [
  'broadcast_localizations',
  "audience TEXT NOT NULL DEFAULT 'release_followers'",
  "preference_key TEXT NOT NULL DEFAULT 'notify_releases'",
  'action_label TEXT',
]) need(migration, token, 'broadcast center migration');

for (const token of [
  'runBroadcastCenterMaintenanceWithLease',
  'broadcast_recipients',
  "job.preference_key === 'notify_announcements'",
  "audience === 'unused_quota'",
  's.month_key = ?',
  'control.blocked_at IS NULL',
  'localizedCopy',
  "status = 'sent'",
  "status = 'skipped'",
  'BROADCAST_MAX_ATTEMPTS',
  'broadcastRetryAt',
]) need(center, token, 'canonical broadcast runner');
forbid(center, 'Promise.all(recipients', 'unbounded recipient burst');

for (const token of [
  'handleAdminBroadcastRequest',
  "key: 'unused_quota'",
  "key: 'suggest_novel'",
  "key: 'requests_open'",
  'notify_announcements=1',
  'estimateAudience',
  'broadcastHistory',
  'ctx.waitUntil(runBroadcastCenterMaintenanceWithLease',
  'target_type, target_id',
]) need(api, token, 'broadcast admin API');

for (const locale of ['en','es','fil','hi','pt','id','vi','fr','de','ru']) need(api, `${locale}: { title:`, `template locale ${locale}`);

need(runner, "from './broadcast-center'", 'broadcast-runner canonical engine');
forbid(runner, "from './notifications'", 'legacy broadcast maintenance import');

for (const token of [
  "admin.registerRoute('section:broadcasts'",
  '/api/app/admin/broadcasts/estimate',
  '/api/app/admin/broadcasts/test',
  "state.templateKey==='custom'",
  'data-broadcast-locale',
  'Fallback → English',
  'DTL_ADMIN_STABILITY?.confirm',
  'data-broadcast-retry',
]) need(ui, token, 'broadcast center UI');
forbid(ui, 'new MutationObserver', 'broadcast route DOM observer');
forbid(ui, 'window.confirm(', 'native confirm');

for (const token of ['.broadcast-template-grid','.broadcast-workspace','.broadcast-locale-tabs','.broadcast-tg-preview','.broadcast-history-row','@media(max-width:760px)']) need(css, token, 'broadcast center CSS');

need(indexTs, 'handleAdminBroadcastRequest', 'Worker broadcast API routing');
need(html, '/app/admin-broadcasts.css?v=20260811-broadcast1', 'broadcast CSS asset');
need(html, '/app/admin-broadcasts.js?v=20260811-broadcast1', 'broadcast JS asset');

new Function(ui);
console.log('Broadcast Center audit passed: localized templates, custom campaigns, audience estimates, announcement opt-out, quota targeting, recipient snapshots, retries and canonical admin routing are wired.');
