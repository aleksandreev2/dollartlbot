import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const need = (source, needle, label) => {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
};
const forbid = (source, needle, label) => {
  if (source.includes(needle)) throw new Error(`${label}: forbidden ${needle}`);
};

const automation = read('src/broadcast-automation.ts');
const center = read('src/broadcast-center.ts');
const index = read('src/index.ts');
const migration = read('migrations/0023_broadcast_automations.sql');
const html = read('public/app/index.html');
const ui = read('public/app/admin-broadcast-automations.js');
const css = read('public/app/admin-broadcast-automations.css');
const pkg = read('package.json');

for (const token of [
  "AUTOMATION_KEY = 'unused_quota_reminders'",
  "key: 'midmonth', windowStart: 10, windowEnd: 16",
  "key: 'late_month', windowStart: 24, windowEnd: 31",
  'return (await enqueueUnusedQuotaReminder(env, stage, now)) ? 1 : 0',
  '`automation:${AUTOMATION_KEY}:${monthKey}:${stage.key}`',
  "'unused_quota', 'notify_announcements'",
  "ON CONFLICT(broadcast_id, locale) DO UPDATE SET",
  "'/api/app/admin/broadcast-automations'",
  "request.method === 'PATCH'",
  'u.notify_announcements = 1',
  'u.language_selected = 1',
  'submission_intake_reservations',
]) need(automation, token, 'broadcast automation');

for (const locale of ['en','es','fil','hi','pt','id','vi','fr','de','ru','ur']) {
  const matches = automation.match(new RegExp(`\\n  ${locale}: \\{`, 'g')) || [];
  if (matches.length < 2) throw new Error(`broadcast automation: locale ${locale} must exist in both reminder stages`);
}

for (const token of [
  'recipientStillEligible',
  "sr.state = 'reserved'",
  "String(job.template_key || '').startsWith('auto:')",
  'automationMonth(job)',
]) need(center, token, 'broadcast delivery revalidation');

need(index, "handleAdminBroadcastAutomationRequest", 'automation API routing');
need(index, "runScheduledTask('broadcast_automation'", 'automation cron');
need(index, "runScheduledTask('broadcast_maintenance'", 'broadcast delivery cron');
if (index.indexOf("runScheduledTask('broadcast_automation'") > index.indexOf("runScheduledTask('broadcast_maintenance'")) {
  throw new Error('broadcast automation must enqueue before broadcast maintenance delivers');
}

for (const token of [
  'CREATE TABLE IF NOT EXISTS broadcast_automations',
  "VALUES ('unused_quota_reminders', 1",
]) need(migration, token, 'broadcast automation migration');

need(html, '/app/admin-broadcast-automations.css?v=20260812-auto1', 'automation CSS asset');
need(html, '/app/admin-broadcast-automations.js?v=20260812-auto1', 'automation JS asset');
if (html.indexOf('/app/admin-broadcast-automations.js') < html.indexOf('/app/admin-broadcasts.js')) {
  throw new Error('broadcast automation UI must load after Broadcast Center');
}

for (const token of [
  "admin.activeRoute?.() === 'section:broadcasts'",
  "admin.api('/api/app/admin/broadcast-automations')",
  'data-broadcast-automation-toggle',
  "method:'PATCH'",
  'Подходят сейчас',
  'Перед каждой отправкой аудитория проверяется заново',
]) need(ui, token, 'broadcast automation UI');
forbid(ui, 'MutationObserver', 'broadcast automation UI');
forbid(ui, 'window.fetch =', 'broadcast automation UI');
new Function(ui);

need(css, '.broadcast-automation-panel', 'broadcast automation styles');
need(pkg, 'tests/admin-broadcast-automations.spec.mjs', 'automation browser coverage');
need(pkg, 'scripts/audit-broadcast-automations.mjs', 'automation audit coverage');

console.log('Broadcast lifecycle automation audit passed.');
