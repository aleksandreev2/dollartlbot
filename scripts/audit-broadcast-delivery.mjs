import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
function need(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function forbid(source, needle, label) {
  if (source.includes(needle)) throw new Error(`${label}: forbidden ${needle}`);
}

const migration = read('migrations/0014_broadcast_recipients.sql');
const notifications = read('src/notifications.ts');

for (const needle of [
  'broadcast_recipients',
  "status IN ('queued', 'retry', 'sent', 'failed', 'skipped')",
  'next_attempt_at',
  'idx_user_notifications_broadcast',
  'PRIMARY KEY (broadcast_id, user_id)',
]) need(migration, needle, 'broadcast delivery migration');

for (const needle of [
  'BROADCAST_MAX_ATTEMPTS',
  'ensureBroadcastRecipients',
  'deliverBroadcastRecipient',
  'refreshBroadcastTotals',
  "br.status IN ('queued', 'retry')",
  'broadcastRetryAt',
  'TelegramApiError',
  'error.retryAfter',
  'INSERT OR IGNORE INTO user_notifications',
  "status = 'skipped'",
]) need(notifications, needle, 'broadcast delivery worker');

forbid(notifications, 'cursor=users.results.at(-1)', 'legacy cursor skips failed recipients');
forbid(notifications, 'Promise.all(users.results.map', 'unbounded broadcast burst');

console.log('Broadcast delivery reliability audit passed.');
