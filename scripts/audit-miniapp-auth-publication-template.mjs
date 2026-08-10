import fs from 'node:fs';
import path from 'node:path';

const root = new URL('../', import.meta.url);
const read = (file) => fs.readFileSync(new URL(file, root), 'utf8');
const exists = (file) => fs.existsSync(new URL(file, root));
const need = (source, needle, label) => { if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`); };
const forbid = (source, needle, label) => { if (source.includes(needle)) throw new Error(`${label}: forbidden ${needle}`); };

const auth = read('src/miniapp-auth.ts');
const core = read('src/miniapp-core.ts');
const access = read('src/miniapp-access.ts');
const index = read('src/index.ts');
const migration = read('migrations/0017_publication_request_links.sql');
const links = read('src/publication-links.ts');
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
]) need(migration, token, 'publication request-link migration');

for (const token of [
  "'/api/app/admin/publication-links'",
  '/link-request$/.exec',
  'authenticateMiniAppRequest(request, env)',
  "WHERE s.status = 'accepted'",
  "submission.status !== 'accepted'",
  'requester_username_snapshot',
  'COALESCE(NULLIF(u.username',
]) need(links, token, 'publication request-link API');

for (const token of [
  "const FILES_LINE = '📎 Файлы — в комментариях.'",
  'Запрошено: @${username}',
  'pubSubmissionId',
  'Без связи с заявкой',
  "runtime.registerFetchMiddleware",
  "context.pathname !== '/api/app/admin/publications'",
  'composeBody(form.get(\'body\')',
  'publication_template_too_long',
  '/link-request`',
  "method:'DELETE'",
  'updatePreview()',
]) need(ui, token, 'publication template UI');
for (const token of ['publication-request-link','publication-template-preview']) need(css, token, 'publication template CSS');
new Function(ui);

need(html, '/app/publication-template-ui.css?v=20260810-pubtemplate1', 'publication template CSS asset');
need(html, '/app/publication-template-ui.js?v=20260810-pubtemplate1', 'publication template JS asset');
const templateIndex = html.indexOf('/app/publication-template-ui.js?v=20260810-pubtemplate1');
const publishingIndex = html.indexOf('/app/admin-publishing.js?v=20260810-admin1');
if (templateIndex < 0 || publishingIndex < 0 || templateIndex > publishingIndex) {
  throw new Error('Publication template middleware must load before admin-publishing.js.');
}

console.log('Canonical Mini App auth + publication template audit passed: one server initData verifier, focused core router, linked request metadata, automatic comment-file/requester lines, safe length checks, rollback on link failure, and preview UX are wired.');
