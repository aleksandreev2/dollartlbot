import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const need = (source, token, label = token) => { if (!source.includes(token)) throw new Error(`Disaster recovery audit: missing ${label}`); };
const forbid = (source, token, label = token) => { if (source.includes(token)) throw new Error(`Disaster recovery audit: forbidden ${label}`); };
const before = (source, first, second, label) => {
  const a = source.indexOf(first), b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) throw new Error(`Disaster recovery audit: invalid order ${label}`);
};

const migration = read('migrations/0041_disaster_recovery_legacy_cleanup.sql');
const backup = read('src/disaster-recovery.ts');
const admin = read('src/admin-disaster-recovery.ts');
const legacy = read('src/legacy-cleanup.ts');
const alerts = read('src/production-alerts.ts');
const entry = read('src/entry.ts');
const ui = read('public/app/admin-disaster-recovery.js');
const html = read('public/app/index.html');

for (const token of [
  'CREATE TABLE IF NOT EXISTS dr_backup_runs',
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_dr_backup_single_running',
  'CREATE TABLE IF NOT EXISTS dr_backup_chunks',
  'CREATE TABLE IF NOT EXISTS dr_backup_verifications',
  'CREATE TABLE IF NOT EXISTS production_incidents',
  'CREATE TABLE IF NOT EXISTS legacy_publication_cleanup',
  "('dr_backup_enabled','1'",
  "('dr_backup_interval_hours','24'",
  "('dr_backup_retention_days','30'",
]) need(migration, token, 'migration state');

for (const token of [
  "const BACKUP_PREFIX = 'backups/'",
  "const FORMAT = 'dollartl-portable-backup'",
  "consistency: 'application-logical-nontransactional'",
  "new Set(['d1_migrations'",
  'sqlite_schema',
  'dr_backup_chunks',
  'env.COVERS.put(',
  'env.COVERS.list(',
  "crypto.subtle.digest('SHA-256'",
  'manifest_sha256',
  'verifyPortableBackup',
  'SHA-256 mismatch',
  'for (const line of lines) JSON.parse(line)',
  'runDisasterRecoveryMaintenance',
  "const created = await createPortableBackup(env, null, 'scheduled')",
  'await verifyPortableBackup(env, backupId, null)',
  'pruneBackupRetention',
  'for (;;) {',
  'Cloudflare D1 Time Travel',
]) need(backup, token, 'portable backup/verify pipeline');
forbid(backup, 'TELEGRAM_BOT_TOKEN', 'backup storage must not serialize Telegram secrets');

for (const token of [
  "const PATH = '/api/app/admin/disaster-recovery'",
  "action === 'create_backup'",
  "action === 'verify_backup'",
  "action === 'prune_backups'",
  "action === 'convert_legacy'",
  "action === 'convert_safe_legacy'",
  "action === 'save_config'",
]) need(admin, token, 'admin recovery API');

for (const token of [
  'SAFE_BOT_DELETE_WINDOW_MS = 46 * 60 * 60_000',
  'activateProtectedGate(publication, discussionId, env, telegram)',
  "telegram.call<boolean>('deleteMessage'",
  "'needs_manual_cleanup'",
  'manual_delete_required_old_message',
  'missing_asset_message_ids',
]) need(legacy, token, 'legacy cleanup safety');
before(legacy, 'activateProtectedGate(publication, discussionId, env, telegram)', "telegram.call<boolean>('deleteMessage'", 'gate confirmation before public message deletion');

for (const token of [
  'touchProductionIncident',
  'resolveRecoveredIncidents',
  'production_incidents',
  "key: 'backup_overdue'",
  "key: 'backup_failed'",
  "key: 'backup_verification_failed'",
  "const backupRunning = String(latestBackup?.status || '') === 'running'",
]) need(alerts, token, 'incident history and recovery backup alerts');

need(entry, 'handleAdminDisasterRecoveryRequest', 'recovery admin route wired');
need(entry, 'runDisasterRecoveryMaintenance(env)', 'scheduled recovery maintenance');
need(ui, "const routeId = 'tools:recovery'", 'Recovery admin route');
need(ui, '/api/app/admin/disaster-recovery', 'Recovery admin API');
need(ui, 'Cloudflare D1 Time Travel', 'restore semantics disclosed in UI');
need(ui, 'needs_manual_cleanup', 'manual legacy cleanup surfaced');
need(html, '/app/admin-disaster-recovery.js?v=20260816-dr1', 'Recovery UI asset loaded');

new Function(ui);
console.log('Disaster Recovery + Legacy Cleanup audit passed: chunked D1 backup, automatic verification, R2 inventory, SHA-256 integrity, retention, incident history, gate-first legacy conversion and manual-delete fallback are wired.');
