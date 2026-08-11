import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0029_request_self_service.sql');
const service=read('src/request-self-service.ts');
const finalizer=read('src/request-self-service-finalize.ts');
const readLayer=read('src/request-self-service-read.ts');
const actions=read('src/admin-actions-v2.ts');
const index=read('src/index.ts');
const ui=read('public/app/request-self-service-ui-v2.js');
const requests=read('public/app/view-requests-account.js');
const deeplink=read('public/app/notification-deeplink.js');
const html=read('public/app/index.html');

function need(source,token,label){if(!source.includes(token))throw new Error(`${label}: missing ${token}`);}

for(const token of [
  "review_state TEXT NOT NULL DEFAULT 'ready'",
  "'needs_info'",
  "'user_replied'",
  'withdrawn_at TEXT',
  'CREATE TABLE IF NOT EXISTS submission_conversation',
  'CREATE TABLE IF NOT EXISTS submission_raw_history',
])need(migration,token,'migration');

for(const token of [
  'const userMatch =',
  'const adminMatch =',
  "'manage'",
  "'edit'",
  "'raw'",
  "'message'",
  "'withdraw'",
  "'needs-info'",
  "'resolve-info'",
  "status !== 'pending'",
  'MINI_APP_MAX_UPLOAD_BYTES',
  'sendDocumentUpload',
  'INSERT INTO submission_raw_history',
  "review_state='needs_info'",
  "'user_replied'",
  'sendUserNotification',
  "'notify_request_updates'",
  "slot_returned=1",
  'UPDATE title_identities',
  'linked_submission_id=NULL',
  'source_identity_locked',
  'duplicate_title',
])need(service,token,'service');
const formParses=(service.match(/request\.formData\(\)/g)||[]).length;
if(formParses!==1)throw new Error(`RAW replacement must parse multipart exactly once; found ${formParses}`);

for(const token of [
  'finalizeRequestSelfServiceMutation',
  "(edit|raw|message)",
  "review_state='user_replied'",
  'review_resolved_at=NULL',
  "status='pending'",
  'withdrawn_at IS NULL',
  "if (!response.ok) return response",
])need(finalizer,token,'mutation finalizer');
if(finalizer.includes('request.formData'))throw new Error('mutation finalizer must never reparse a RAW multipart body');

for(const token of [
  '/api/app/bootstrap',
  '/api/app/requests',
  "'withdrawn'",
  "'needs_info'",
  "'user_replied'",
])need(readLayer,token,'read enhancer');

for(const token of [
  "action === 'accept'",
  'review_unresolved',
  'request_withdrawn',
  "review.review_state !== 'ready'",
])need(actions,token,'accept guard');

for(const token of [
  'handleRequestSelfService',
  'finalizeRequestSelfServiceMutation',
  'enhanceRequestSelfServiceRead',
  'handleMiniAppCoreRequest',
])need(index,token,'index wiring');
const serviceAt=index.indexOf('handleRequestSelfService(request, env, apiTelegram, ctx)');
const finalizeAt=index.indexOf('finalizeRequestSelfServiceMutation(request, requestSelfServiceResponse, env)');
const coreAt=index.indexOf('handleMiniAppCoreRequest(request, env)');
if(serviceAt<0||finalizeAt<0||coreAt<0||!(serviceAt<finalizeAt&&finalizeAt<coreAt))throw new Error('self-service mutation finalizer must run immediately after self-service routes and before legacy Mini App core routes');

for(const token of [
  'dataset.selfServiceStamp',
  '/api/app/requests/${id}/manage',
  '/api/app/requests/${id}/edit',
  '/api/app/requests/${id}/raw',
  '/api/app/requests/${id}/message',
  '/api/app/requests/${id}/withdraw',
  '/api/app/admin/requests/${id}/review',
  '/api/app/admin/requests/${id}/needs-info',
  '/api/app/admin/requests/${id}/resolve-info',
  'DTL_REQUEST_SELF_SERVICE',
  'registerPatcher',
])need(ui,token,'UI runtime');
if(ui.includes('new MutationObserver'))throw new Error('self-service runtime must not own a DOM MutationObserver');
for(const locale of ['en','ru','es','fil','hi','pt','id','vi','fr','de'])need(ui,`${locale}:{`, 'localized UI');

for(const token of [
  "'needs_info'",
  "'user_replied'",
  "r.state==='withdrawn'",
  'ACTIVE_REQUEST_STATES',
])need(requests,token,'My Requests');
need(deeplink,'DTL_REQUEST_SELF_SERVICE?.open','notification deep link');

for(const token of [
  '/app/request-self-service-ui-v2.js?v=20260812-self2',
  '/app/request-self-service-ui.css?v=20260812-self2',
  '/app/view-requests-account.js?v=20260812-self2',
  '/app/notification-deeplink.js?v=20260812-self2',
])need(html,token,'asset wiring');
if(html.includes('/app/request-self-service-ui.js?'))throw new Error('superseded self-service runtime must not be loaded');

console.log('Request self-service safety audit passed.');
