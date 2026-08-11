import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

const migration=read('migrations/0021_request_operations.sql');
const ops=read('src/admin-request-ops.ts');
const preflight=read('src/publishing-preflight.ts');
const publicationAdmin=read('src/admin-publications.ts');
const publishing=read('src/publishing-comments-v3.ts');
const indexTs=read('src/index.ts');
const opsUi=read('public/app/admin-request-ops.js');
const workflowUi=read('public/app/admin-workflow.js');
const opsCss=read('public/app/admin-request-ops.css');
const stableUi=read('public/app/publication-stability-ui.js');
const stableCss=read('public/app/publication-stability-ui.css');
const templateUi=read('public/app/publication-template-ui.js');
const html=read('public/app/index.html');
const wrangler=read('wrangler.jsonc');

for(const token of [
  'CREATE TABLE IF NOT EXISTS submission_admin_meta',
  'duplicate_of_submission_id INTEGER',
  'archived_at TEXT',
  'archived_by INTEGER',
  'idx_submission_admin_meta_archived',
])need(migration,token,'request operations migration');

for(const token of [
  '/(edit|queue-position|meta|restore-pending|raw)',
  'submission_queue_position',
  'submission_restore_pending',
  'submission_admin_meta',
  'submission_raw_sent',
  'normalizeQueuePositions(env)',
  "status='pending',slot_returned=0",
  'duplicate_of_submission_id',
  "return miniAppJsonError('invalid_request_edit',error.message,400)",
  "FROM publications WHERE submission_id=?",
])need(ops,token,'request operations backend');

for(const token of [
  'handleAdminRequestOps(request, env, apiTelegram)',
  'handlePublishingPreflight(request, env, apiTelegram)',
])need(indexTs,token,'Worker request/publication routing');
if(indexTs.indexOf('handlePublishingPreflight(request, env, apiTelegram)')>indexTs.indexOf('handlePublishingCommentsV3Request(request, env, apiTelegram, ctx)'))throw new Error('Publication preflight must execute before canonical publish handler.');

for(const token of [
  "telegram.call<Chat>('getChat'",
  "telegram.call<{id:number}>('getMe'",
  "telegram.call<BotMember>('getChatMember'",
  'channel.linked_chat_id',
  "telegram.call<TelegramChatMember>('getChatMember'",
  'isActiveChatMember(discussionMember)',
  "VALUES ('discussion_chat_id',?,?)",
  'publish_preflight_ok',
])need(preflight,token,'publication preflight');

for(const token of [
  "const FILES_LINE='📎 Files are in the comments.'",
  'stripManagedTemplateLines',
  'Requested by: @${username}',
  'composeManaged(updated,env,telegram)',
  'telegram.call<{username?:string}>',
  'caption_too_long',
  'post_edited',
])need(publicationAdmin,token,'published post edit stability');
forbid(publicationAdmin,'📎 Файлы — в комментариях.','channel-facing publication language');
forbid(publicationAdmin,'Запрошено:','channel-facing publication language');

for(const token of [
  "WHERE id=? AND status IN ('draft','failed')",
  'queuePublicationReleaseBroadcast(env,id',
  'runBroadcastMaintenanceWithLease(env,telegram,4)',
])need(publishing,token,'canonical atomic publisher');

for(const token of [
  'const adminRuntime=window.DTL_ADMIN',
  "adminRuntime.activeRoute?.()==='section:requests'",
  'requestOpsSave',
  'requestOpsMove',
  'requestOpsMetaSave',
  'requestOpsRestore',
  'requestOpsRaw',
  "adminRuntime.open('section:publishing')",
  'request-ops-history',
  'window.DTL_ADMIN_REQUEST_OPS',
])need(opsUi,token,'request operations UI');
for(const token of [
  '.admin-request-card',
  'runtime.registerPatcher',
  "document.addEventListener('dtl:adminrender'",
  'async function api(path',
  'fetch(path',
])forbid(opsUi,token,'request operations canonical subview');
for(const token of [
  'data-workflow-advanced',
  'window.DTL_ADMIN_REQUEST_OPS',
  'void ops.open(id)',
])need(workflowUi,token,'request operations workflow launcher');
for(const token of ['.request-ops-grid','.request-position-control','.request-history-row','@media(max-width:560px)'])need(opsCss,token,'request operations CSS');

for(const token of [
  "document.querySelectorAll('[data-admin-tools=\"publications\"]')",
  'data-stable-pub="check"',
  'data-stable-pub="edit"',
  'data-stable-pub="delete"',
  '/check-comments`',
  '/edit`',
  '/delete-telegram`',
  'Files / Requested by / CTA добавляются сервером',
])need(stableUi,token,'publication stability UI');
for(const token of ['.stable-publication-result','.stable-publication-editor','.publication-deleted-state'])need(stableCss,token,'publication stability CSS');

for(const token of [
  "const PENDING_LINK_KEY = 'dtl:publicationSubmissionId'",
  'applyPendingRequestSelection(select, field)',
  'sessionStorage.removeItem(PENDING_LINK_KEY)',
  "context.pathname !== '/api/app/admin/publications'",
])need(templateUi,token,'request-to-publication link handoff');

for(const token of [
  '/app/admin-request-ops.css?v=20260810-ops1',
  '/app/publication-stability-ui.css?v=20260810-pubstable1',
  '/app/admin-request-ops.js?v=20260810-ops1',
  '/app/publication-template-ui.js?v=20260810-pubtemplate2',
  '/app/publication-stability-ui.js?v=20260810-pubstable1',
])need(html,token,'Mini App request/publication assets');
need(wrangler,'?build=20260810-ops1','fresh Mini App build');

new Function(opsUi);
new Function(workflowUi);
new Function(stableUi);
new Function(templateUi);
console.log('Request operations + publication stability audit passed: canonical Requests subview, editable/audited requests, exact queue placement, linked publication workflow, publication preflight, managed-line-safe edits, one visible publication management surface, and responsive admin controls are wired.');
