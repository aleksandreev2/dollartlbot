import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const migration = read('migrations/0030_source_watch_progress_ledger.sql');
const ledger = read('src/progress-ledger.ts');
const watch = read('src/source-watch.ts');
const review = read('src/source-watch-review.ts');
const state = read('src/admin-state.ts');
const range = read('src/publication-release-range.ts');
const index = read('src/index.ts');
const ui = read('public/app/admin-source-watch.js');
const css = read('public/app/admin-source-watch.css');
const html = read('public/app/index.html');

function need(source, token, label) {
  if (!source.includes(token)) throw new Error(`${label}: missing ${token}`);
}

for (const token of [
  'CREATE TABLE IF NOT EXISTS submission_progress_events',
  "'admin_progress'",
  "'publication_release'",
  'CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_progress_events_publication',
  'CREATE TABLE IF NOT EXISTS submission_source_watch',
  'CREATE TABLE IF NOT EXISTS submission_source_events',
  "'auto_applied'",
  "'review_required'",
  'reviewed_at TEXT',
  'reviewed_by INTEGER',
  'idx_submission_source_events_unreviewed',
  "'baseline'",
  "p.status='published'",
]) need(migration, token, '0030 migration');
if (/^\s*CREATE\s+TRIGGER\b/im.test(migration)) {
  throw new Error('0030 must stay remote-D1-safe and must not contain CREATE TRIGGER statements');
}

for (const token of [
  'handleProgressLedgerRequest',
  '/api/app/progress-history',
  'recordAdminProgressEvent',
  'syncPublishedReleaseProgress',
  "queue_status === 'in_progress'",
  'releaseEnd > current',
  'COALESCE(current_chapter,0)<?',
  "'publication_release'",
  'progressBeforeLatestCompletion',
]) need(ledger, token, 'progress ledger');
if (/SET\s+current_chapter=\?[^;]*WHERE[^;]*(?:queue_status\s*<>|queue_status\s+NOT)/is.test(ledger)) {
  throw new Error('publication progress sync must not advance non-in-progress requests');
}

for (const token of [
  'runSubmissionSourceWatch',
  'handleSourceWatchRequest',
  '/api/app/admin/source-watch',
  "redirect: 'manual'",
  'MAX_REDIRECTS',
  'MAX_HTML_BYTES',
  'readTextLimited',
  'validateNovelpiaUrl',
  "url.protocol !== 'https:'",
  "host !== 'novelpia.com'",
  "s.queue_status IN ('queued','in_progress','completed')",
  'ACTIVE_WATCH_INTERVAL_MS',
  'COMPLETED_WATCH_INTERVAL_MS',
  'MAX_RUN_LIMIT = 16',
  "action: 'auto_applied'",
  "action: 'review_required'",
  "reason: 'remote_chapter_count_decreased'",
  "auto_decrease: false",
  "reason: 'new_source_chapters_after_translation_completed'",
  "reason: observed.publicationStatus === 'ongoing' ? 'remote_status_reversed' : 'remote_status_requires_review'",
  "submission_title_unchanged: true",
  "INSERT OR IGNORE INTO discovery_catalog",
  "linked_submission_id=CASE WHEN linked_submission_id IS NULL OR linked_submission_id=? THEN ? ELSE linked_submission_id END",
  "INGEST_PROVIDER = 'novelpia_source_watch'",
]) need(watch, token, 'source watch');

for (const token of [
  "type RemotePublicationStatus = 'ongoing' | 'completed' | 'paused' | 'discontinued'",
  'export function parseNovelpiaSourceDetail',
  'parseRemotePublicationStatus',
  'chapterMatch?.index ?? null',
  'const start = Math.max(0, end - 3_000)',
  'const titleAt = metadata.lastIndexOf(title)',
  "return 'discontinued'",
  "return 'paused'",
  "return 'completed'",
]) need(watch, token, 'live NovelPia status parser');
const discontinuedCheck = watch.indexOf('if (/연재중단/u.test(metadata))');
const pausedCheck = watch.indexOf('if (/연재\\s*휴재|휴재/u.test(metadata))');
const completedCheck = watch.indexOf("return 'completed';", pausedCheck);
if (discontinuedCheck < 0 || pausedCheck < 0 || completedCheck < 0 || !(discontinuedCheck < pausedCheck && pausedCheck < completedCheck)) {
  throw new Error('NovelPia status parser must prioritize discontinued/paused metadata over completed markers');
}
if (!watch.includes("watch.publication_status === 'ongoing' && observed.publicationStatus === 'completed'")) {
  throw new Error('only ongoing -> completed may auto-apply as a publication status transition');
}
if (watch.includes("nextPublicationStatus = observed.publicationStatus")) {
  throw new Error('paused/discontinued/reversed remote statuses must never be copied automatically into the local two-state publication field');
}
if (watch.includes("fetch('https://raw-fucknovelpia.com") || watch.includes('RAW crawler')) {
  throw new Error('source watch must not implement another RAW crawler; linked catalog rows reuse the existing RAW provider');
}
if (/nextChapterCount\s*=\s*observed\.chapterCount/.test(watch)) {
  const increaseGuard = watch.indexOf('observed.chapterCount > watch.chapter_count');
  const assignment = watch.indexOf('nextChapterCount = observed.chapterCount');
  if (increaseGuard < 0 || assignment < increaseGuard) {
    throw new Error('remote chapter count may only auto-apply inside a monotonic increase guard');
  }
}

for (const token of [
  'handleSourceWatchReviewRequest',
  '/api/app/admin/source-watch/status',
  '/api/app/admin/source-watch/acknowledge',
  "e.action='review_required' AND e.reviewed_at IS NULL",
  'SET reviewed_at=?,reviewed_by=?',
  "'source_watch_acknowledged'",
  'reviewed_events: count',
]) need(review, token, 'source watch review lifecycle');

for (const token of [
  "import { progressBeforeLatestCompletion, recordAdminProgressEvent } from './progress-ledger';",
  'await recordAdminProgressEvent',
  'restored_from_ledger',
  'progressBeforeLatestCompletion',
]) need(state, token, 'admin state ledger integration');

for (const token of [
  "import { syncPublishedReleaseProgress } from './progress-ledger';",
  "publication.status === 'published'",
  'progress_sync: progressSync',
]) need(range, token, 'release range progress integration');

for (const token of [
  "handleProgressLedgerRequest(request, env)",
  "handleSourceWatchReviewRequest(request, env)",
  "handleSourceWatchRequest(request, env)",
  "syncPublishedReleaseProgress(env, publicationId)",
  "event: 'publication_progress_sync_failed'",
  "scheduledAt.getUTCMinutes() === 0",
  "runScheduledTask('novelpia_source_watch'",
  "runSubmissionSourceWatch(env, scheduledAt)",
  "runScheduledTask('raw_fucknovelpia_enrichment'",
]) need(index, token, 'Worker wiring');
const watchAt = index.indexOf("runScheduledTask('novelpia_source_watch'");
const rawAt = index.indexOf("runScheduledTask('raw_fucknovelpia_enrichment'");
if (watchAt < 0 || rawAt < 0 || watchAt > rawAt) {
  throw new Error('hourly NovelPia source watch must run before the minute-0 RAW enrichment pass');
}

for (const token of [
  'runtime?.registerPatcher',
  'runtime?.registerResponseHandler',
  '/api/app/admin/source-watch/status',
  '/api/app/admin/source-watch/acknowledge',
  '/api/app/admin/source-watch/refresh',
  "route() === 'section:queue'",
  "route() === 'health:1'",
  'data-source-watch-inline',
  'data-source-watch-health',
  'data-source-watch-attention',
  'Проверить источники сейчас',
  'Проверено',
  "status === 'paused'",
  "status === 'discontinued'",
  "return 'пауза'",
  "return 'прекращён'",
  'releaseButton(button)',
  'window.DTL_ADMIN_SOURCE_WATCH',
]) need(ui, token, 'source watch admin UI');
if (ui.includes('new MutationObserver')) throw new Error('source watch admin UI must not own a MutationObserver');
for (const token of [
  '.admin-source-watch-detail',
  '.admin-source-watch-queue-status',
  '.ops-source-watch-card',
  '.ops-source-watch-row',
  '@media(max-width:720px)',
]) need(css, token, 'source watch admin CSS');
for (const token of [
  '/app/admin-source-watch.css?v=20260812-source1',
  '/app/admin-source-watch.js?v=20260812-source1',
]) need(html, token, 'source watch assets');
new Function(ui);

console.log('Source watch + progress ledger safety audit passed.');
