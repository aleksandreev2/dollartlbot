import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0028_request_identity_following.sql');
const identity=read('src/request-identity.ts');
const submit=read('src/miniapp-enhanced.ts');
const following=read('src/title-following.ts');
const index=read('src/index.ts');
const adminState=read('src/admin-state.ts');
const ui=read('public/app/title-following-ui.js');
const html=read('public/app/index.html');

function requireToken(source,token,label){if(!source.includes(token))throw new Error(`${label}: missing ${token}`);}

for(const token of [
  'CREATE TABLE IF NOT EXISTS title_identities',
  'PRIMARY KEY (identity_type, identity_value)',
  'CREATE TABLE IF NOT EXISTS title_follows',
  'CREATE TABLE IF NOT EXISTS title_follow_progress_state',
])requireToken(migration,token,'migration');

for(const token of [
  'handleSubmissionIdentityPreflight',
  'checkSubmissionIdentityDuplicate',
  'claimSubmissionIdentity',
  'bindSubmissionIdentity',
  'reconcileCommittedSubmissionIdentity',
  'releaseSubmissionIdentityGuard',
  'duplicate_title',
  'duplicate_in_progress',
  'claim_expires_at',
  "s.status<>'rejected'",
  '35 * 60 * 1000',
])requireToken(identity,token,'identity guard');
if(identity.includes('request.clone().formData'))throw new Error('identity guard must never clone/parse the multipart submit body');
if(identity.includes('prepareSubmissionIdentityGuard'))throw new Error('legacy request-level multipart identity guard must be removed');

for(const token of [
  "const form = await request.formData()",
  "field(form, 'identity_provider')",
  "field(form, 'identity_external_id')",
  'checkSubmissionIdentityDuplicate',
  'reserveSubmissionQuota',
  'claimSubmissionIdentity',
  'identity_guard_rejected',
  'failSubmissionReservation',
  'releaseSubmissionIdentityGuard',
  'reconcileCommittedSubmissionIdentity',
  'bindSubmissionIdentity',
  'sendDocumentUpload',
])requireToken(submit,token,'canonical submit');

const formParseCount=(submit.match(/request\.formData\(\)/g)||[]).length;
if(formParseCount!==1)throw new Error(`canonical submit must parse multipart exactly once; found ${formParseCount}`);
const directCheckAt=submit.indexOf('const duplicateIdentity = await checkSubmissionIdentityDuplicate');
const subscriptionAt=submit.indexOf('const subscription = await getSubscriptionState');
const reserveAt=submit.indexOf('const reservationResult = await reserveSubmissionQuota');
const claimAt=submit.indexOf('const identityGuard = await claimSubmissionIdentity');
const uploadAt=submit.indexOf('uploaded = await telegram.sendDocumentUpload');
const commitAt=submit.indexOf('insert = await commitSubmissionReservation');
const bindAt=submit.indexOf('const identityError = await bindSubmissionIdentity');
if([directCheckAt,subscriptionAt,reserveAt,claimAt,uploadAt,commitAt,bindAt].some(value=>value<0)||!(directCheckAt<subscriptionAt&&subscriptionAt<reserveAt&&reserveAt<claimAt&&claimAt<uploadAt&&uploadAt<commitAt&&commitAt<bindAt)){
  throw new Error('identity flow must be direct duplicate check -> subscription -> reservation -> claim -> Telegram upload -> commit -> bind');
}

for(const token of ['/api/app/following','notifySubmissionFollowers','runTitleFollowingMaintenance','canonicalIdentityKeysForSubmission','notify_request_updates'])requireToken(following,token,'following backend');
for(const token of ['handleSubmissionIdentityPreflight','handleTitleFollowingRequest','runTitleFollowingMaintenance'])requireToken(index,token,'index wiring');
if(index.includes('prepareSubmissionIdentityGuard')||index.includes('finalizeSubmissionIdentityGuard'))throw new Error('router must not parse or own submit identity claims');
requireToken(adminState,'notifySubmissionFollowers','admin lifecycle');

for(const token of [
  '/api/app/submission/preflight',
  'identity_provider',
  'identity_external_id',
  'request_id',
  '/api/app/following/submission',
  '/api/app/following/catalog',
  'followingSetting',
  '.live-detail-actions',
  'dataset.followStamp',
  'cachePayload',
])requireToken(ui,token,'following UI');
requireToken(html,'/app/title-following-ui.js?v=20260812-follow1','asset wiring');
requireToken(html,'/app/title-following-ui.css?v=20260812-follow1','asset wiring');

const preflightCall=index.indexOf('const identityPreflightResponse = await handleSubmissionIdentityPreflight(request, env)');
const enhancedCall=index.indexOf('const enhancedMiniAppResponse = await handleEnhancedMiniAppRequest(request, env, ctx)');
if(preflightCall<0||enhancedCall<0||preflightCall>enhancedCall)throw new Error('identity preflight must route before the canonical submit handler');

console.log('Request identity + following audit passed.');
