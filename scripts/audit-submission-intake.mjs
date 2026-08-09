import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
function need(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}
function before(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) throw new Error(`${label}: expected ${first} before ${second}`);
}

const migration = read('migrations/0013_submission_intake_reservations.sql');
const quota = read('src/quota.ts');
const mini = read('src/miniapp-enhanced.ts');

for (const needle of [
  'ALTER TABLE submissions ADD COLUMN client_request_id TEXT',
  'submission_intake_reservations',
  'UNIQUE(user_id, request_id)',
  'idx_submissions_user_client_request',
  'idx_submission_intake_active_referral',
]) need(migration, needle, 'submission intake migration');

for (const needle of [
  'reserveSubmissionQuota',
  'attachFileToSubmissionReservation',
  'commitSubmissionReservation',
  'cleanupExpiredSubmissionReservations',
  "state = 'reserved' AND expires_at > ?",
  'client_request_id',
]) need(quota, needle, 'quota reservation layer');

need(mini, 'submissionFingerprint', 'Mini App idempotency');
need(mini, 'reserveSubmissionQuota', 'Mini App idempotency');
need(mini, 'commitSubmissionReservation', 'Mini App idempotency');
need(mini, 'submission_commit_failed', 'Mini App resumable commit');
need(mini, 'reservation.rawFileId', 'Mini App upload resume');
before(mini, 'reserveSubmissionQuota', 'sendDocumentUpload', 'reserve-before-upload invariant');

if (mini.includes('insertSubmissionWithQuota')) {
  throw new Error('Mini App submit must not bypass the reservation layer.');
}

console.log('Submission intake reliability audit passed.');
