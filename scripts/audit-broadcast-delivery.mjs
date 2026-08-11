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
const center = read('src/broadcast-center.ts');
const runner = read('src/broadcast-runner.ts');

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
  'createInAppNotification',
  "status = 'skipped'",
]) need(center, needle, 'broadcast delivery worker');

need(runner, "from './broadcast-center'", 'canonical broadcast runner import');
forbid(runner, "from './notifications'", 'legacy broadcast runner import');
forbid(center, 'cursor=users.results.at(-1)', 'legacy cursor skips failed recipients');
forbid(center, 'Promise.all(users.results.map', 'unbounded broadcast burst');

console.log('Broadcast delivery reliability audit passed: canonical generic runner uses recipient snapshots, bounded retries and in-app delivery dedupe.');
