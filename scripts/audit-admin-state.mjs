import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

function forbid(source, needle, label) {
  if (source.includes(needle)) throw new Error(`${label}: forbidden legacy mutation ${needle}`);
}

const state = read('src/admin-state.ts');
const miniAdmin = read('src/admin-actions-v2.ts');
const telegramAdmin = read('src/admin.ts');
const index = read('src/index.ts');

for (const transition of [
  "queue_status='queued'",
  "queue_status='in_progress'",
  "queue_status='completed'",
  "status='pending' AND queue_status='in_progress'",
]) {
  // The fourth string is intentionally not required; impossible states should
  // never be encoded as valid transition guards.
  if (transition !== "status='pending' AND queue_status='in_progress'") requireText(state, transition, 'admin-state');
}

for (const guard of [
  "WHERE id=? AND status='pending'",
  "WHERE id=? AND status='accepted' AND queue_status='queued'",
  "WHERE id=? AND status='accepted' AND queue_status='in_progress'",
  "WHERE id=? AND status='accepted' AND queue_status='completed'",
]) requireText(state, guard, 'admin-state');

requireText(state, "action='submission_complete'", 'admin-state reopen restore');
requireText(state, "INSERT INTO admin_audit_log", 'admin-state audit');
requireText(state, "'reopen'", 'admin-state reopen');

requireText(miniAdmin, 'applyAdminSubmissionAction', 'Mini App admin');
requireText(telegramAdmin, 'applyAdminSubmissionAction', 'Telegram admin');
requireText(telegramAdmin, 'admin:a:reopen', 'Telegram admin reopen UI');

for (const legacy of [
  "SET queue_status='completed'",
  "SET queue_status='in_progress'",
  "SET queue_status='queued'",
]) {
  forbid(miniAdmin, legacy, 'Mini App admin');
  forbid(telegramAdmin, legacy, 'Telegram admin');
}

const v2 = index.indexOf('handleAdminActionV2(request, env, apiTelegram)');
const legacyMini = index.indexOf('handleMiniAppRequest(request, env, ctx)');
if (v2 < 0 || legacyMini < 0 || v2 > legacyMini) {
  throw new Error('index.ts: strict admin action handler must run before legacy Mini App routing');
}

console.log('Admin state-machine audit passed.');
