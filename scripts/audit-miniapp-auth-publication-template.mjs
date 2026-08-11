import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const exists = (file) => fs.existsSync(new URL(file, root));
const need = (source, needle, label) => { if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`); };
const forbid = (source, needle, label) => { if (source.includes(needle)) throw new Error(`${label}: forbidden ${needle}`); };

const auth = read('src/miniapp-auth.ts');
const core = read('src/miniapp-core.ts');
const access = read('src/miniapp-access.ts');
const index = read('src/index.ts');
const migration17 = read('migrations/0017_publication_request_links.sql');
const migration18 = read('migrations/0018_release_broadcast_dedupe.sql');
const links = read('src/publication-links.ts');
const publishing = read('src/publishing-comments-v3.ts');
const runner = read('src/broadcast-runner.ts');
const broadcastCenter = read('src/broadcast-center.ts');
const ui = read('public/app/publication-template-ui.js');
const css = read('public/app/publication-template-ui.css');
const html = read('public/app/index.html');

if (exists('src/miniapp.ts')) throw new Error('Legacy src/miniapp.ts must be removed after canonical auth migration.');
for (const token of [
  "encoder.encode('WebAppData')",
  "request.headers.get('x-telegram-init-data')",
  "request.headers.get('x-access-recheck') === '1'",
  'checkBotAccess(telegramUser.id, env, telegram',
  'export function miniAppApiHeaders()',
]) need(auth, token, 'canonical Mini App auth');

for (const token of [
  "from './miniapp-auth'",
  'authenticateMiniAppRequest(request, env)',
  "'/api/app/bootstrap'",
  "'/api/app/queue'",
  "'/api/app/requests'",
  "'/api/app/language'",
  "'/api/app/admin/list'",
]) need(core, token, 'Mini App core');
for (const token of ['WebAppData','crypto.subtle','getInitDataHeader','hexToBytes','submitFromMiniApp','runAdminAction']) forbid(core, token, 'Mini App core');

need(access, "url.pathname !== '/api/app/access'", 'access heartbeat routing');
need(access, 'authenticateMiniAppRequest(request, env)', 'access heartbeat auth');
need(index, "import { handleMiniAppCoreRequest } from './miniapp-core'", 'Worker Mini App core routing');
need(index, 'handleMiniAppCoreRequest(request, env)', 'Worker Mini App core routing');
need(index, 'handlePublicationLinksRequest(request, env, apiTelegram)', 'live publication requester resolution');
need(index, 'runBroadcastMaintenanceWithLease(env, telegram, 2)', 'leased scheduled broadcast runner');
forbid(index, "from './miniapp'", 'legacy Mini App import');

const srcDir = new URL('src/', root);
for (const name of fs.readdirSync(srcDir)) {
  if (!name.endsWith('.ts') || name === 'miniapp-auth.ts') continue;
  const source = fs.readFileSync(new URL(name, srcDir), 'utf8');
  if (source.includes("encoder.encode('WebAppData')") || source.includes("encode('WebAppData')")) {
    throw new Error(`Telegram initData HMAC implementation leaked outside miniapp-auth.ts: src/${name}`);
  }
}

for (const token of [
  'ALTER TABLE publications ADD COLUMN submission_id',
  'ALTER TABLE publications ADD COLUMN requester_username_snapshot TEXT',
  'idx_publications_submission_id',
]) need(migration17, token, 'publication request-link migration');
for (const token of [
  'ALTER TABLE broadcasts ADD COLUMN dedupe_key TEXT',
  'idx_broadcasts_dedupe_key',
  'CREATE TABLE IF NOT EXISTS runtime_leases',
]) need(migration18, token, 'release dedupe migration');

for (const token of [
  "'/api/app/admin/publication-links'",
  '/link-request$/.exec',
  'authenticateMiniAppRequest(request, env)',
  "WHERE s.status = 'accepted'",
  "submission.status !== 'accepted'",
  'requester_username_snapshot',
  "telegram.call<{ username?: string }>('getChat'",
  "UPDATE users SET username=?",
]) need(links, token, 'publication request-link API');

for (const token of [
  "const FILES_LINE = '📎 Files are in the comments.'",
  'Requested by: @${requesterUsername}',
  'stripManagedTemplateLines',
  "telegram.call<{username?:string}>('getChat'",
  "WHERE id=? AND status IN ('draft','failed')",
  "queuePublicationReleaseBroadcast(env,id",
  'runBroadcastMaintenanceWithLease(env,telegram,4)',
  'publication_template_too_long',
]) need(publishing, token, 'canonical publication backend template');
forbid(publishing, '📎 Файлы — в комментариях.', 'channel publication language');
forbid(publishing, 'Запрошено:', 'channel publication language');

for (const token of [
  "const FILES_LINE = '📎 Files are in the comments.'",
  'Requested by: @${username}',
  'pubSubmissionId',
  'Без связи с заявкой',
  "runtime.registerFetchMiddleware",
  "context.pathname !== '/api/app/admin/publications'",
  '/link-request`',
  "method:'DELETE'",
  'linked?.requester_username',
  'updatePreview()',
  "const PENDING_LINK_KEY = 'dtl:publicationSubmissionId'",
  'applyPendingRequestSelection(select, field)',
]) need(ui, token, 'publication template UI');
forbid(ui, '📎 Файлы — в комментариях.', 'publication preview language');
forbid(ui, 'Запрошено:', 'publication preview language');
forbid(ui, "form.set('body'", 'frontend body mutation');

for (const token of [
  'release:publication:${publicationId}',
  'INSERT OR IGNORE INTO broadcasts',
  'dedupe_key',
  "from './broadcast-center'",
]) need(runner, token, 'release broadcast enqueue bridge');
for (const token of [
  'runtime_leases',
  "DELETE FROM runtime_leases WHERE name = ? AND owner_token = ?",
  'runBroadcastCenterMaintenanceWithLease',
]) need(broadcastCenter, token, 'canonical broadcast lease owner');

for (const token of ['publication-request-link','publication-template-preview']) need(css, token, 'publication template CSS');
new Function(ui);

need(html, '/app/publication-template-ui.css?v=20260810-pubtemplate1', 'publication template CSS asset');
need(html, '/app/publication-template-ui.js?v=20260810-pubtemplate2', 'publication template JS asset');
const templateIndex = html.indexOf('/app/publication-template-ui.js?v=20260810-pubtemplate2');
const publishingIndex = html.indexOf('/app/admin-publishing.js?v=20260810-admin1');
if (templateIndex < 0 || publishingIndex < 0 || templateIndex > publishingIndex) {
  throw new Error('Publication template middleware must load before admin-publishing.js.');
}

console.log('Canonical Mini App auth + publication template audit passed: one initData verifier, English backend-managed publication lines, live requester username refresh, request-to-publication preselection, atomic publish claim, release-job dedupe, canonical serialized broadcast maintenance, rollback on link failure, and preview UX are wired.');
