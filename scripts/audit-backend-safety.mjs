import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
function need(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

const quota = read('src/quota.ts');
const index = read('src/index.ts');
const migration = read('migrations/0012_source_url_safety.sql');

need(quota, 'safeHttpUrl(input.sourceUrl)', 'quota source URL normalization');
need(quota, "url.protocol !== 'http:' && url.protocol !== 'https:'", 'quota protocol guard');

for (const trigger of ['submissions_source_url_insert_guard', 'submissions_source_url_update_guard']) {
  need(migration, trigger, 'source URL D1 guard');
}
need(migration, "NOT LIKE 'http://%'", 'source URL migration');
need(migration, "NOT LIKE 'https://%'", 'source URL migration');

for (const task of [
  'queue_normalize',
  'admin_delivery_retry',
  'referral_maintenance',
  'broadcast_maintenance',
  'publication_delivery',
  'daily_engagement',
  'processed_update_cleanup',
]) need(index, `runScheduledTask('${task}'`, 'scheduled maintenance isolation');

need(index, "event: 'scheduled_task_failed'", 'scheduled maintenance logging');

console.log('Backend safety audit passed.');
