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
function stripSqlLineComments(source) {
  return source.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
}

const quota = read('src/quota.ts');
const index = read('src/index.ts');
const migration = read('migrations/0012_source_url_safety.sql');
const migrationSql = stripSqlLineComments(migration);

need(quota, 'safeHttpUrl(input.sourceUrl)', 'quota source URL normalization');
need(quota, "url.protocol !== 'http:' && url.protocol !== 'https:'", 'quota protocol guard');
need(quota, 'return url.toString()', 'quota canonical URL storage');

// 0012 must stay remotely executable. A previous version used a trigger body that
// passed local workerd migrations but failed against remote D1.
forbid(migrationSql, 'CREATE TRIGGER', 'remote-compatible source URL migration');
need(migrationSql, "NOT LIKE 'http://%'", 'source URL migration');
need(migrationSql, "NOT LIKE 'https://%'", 'source URL migration');

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
