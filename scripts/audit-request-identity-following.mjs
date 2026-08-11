import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0028_request_identity_following.sql');
const identity=read('src/request-identity.ts');
const following=read('src/title-following.ts');
const index=read('src/index.ts');
const adminState=read('src/admin-state.ts');
const ui=read('public/app/title-following-ui.js');
const html=read('public/app/index.html');

function requireToken(source,token,label){if(!source.includes(token))throw new Error(`${label}: missing ${token}`);}

for(const token of ['CREATE TABLE IF NOT EXISTS title_identities','PRIMARY KEY (identity_type, identity_value)','CREATE TABLE IF NOT EXISTS title_follows','CREATE TABLE IF NOT EXISTS title_follow_progress_state'])requireToken(migration,token,'migration');
for(const token of ['handleSubmissionIdentityPreflight','prepareSubmissionIdentityGuard','finalizeSubmissionIdentityGuard','duplicate_title','duplicate_in_progress','claim_expires_at','s.status<>\'rejected\''])requireToken(identity,token,'identity guard');
for(const token of ['/api/app/following','notifySubmissionFollowers','runTitleFollowingMaintenance','canonicalIdentityKeysForSubmission','notify_request_updates'])requireToken(following,token,'following backend');
for(const token of ['handleSubmissionIdentityPreflight','prepareSubmissionIdentityGuard','finalizeSubmissionIdentityGuard','handleTitleFollowingRequest','runTitleFollowingMaintenance'])requireToken(index,token,'index wiring');
requireToken(adminState,'notifySubmissionFollowers','admin lifecycle');
for(const token of ['/api/app/submission/preflight','identity_provider','identity_external_id','request_id','/api/app/following/submission','/api/app/following/catalog','followingSetting','.live-detail-actions'])requireToken(ui,token,'following UI');
requireToken(html,'/app/title-following-ui.js?v=20260812-follow1','asset wiring');
requireToken(html,'/app/title-following-ui.css?v=20260812-follow1','asset wiring');

const preflight=index.indexOf('handleSubmissionIdentityPreflight');
const enhanced=index.indexOf('handleEnhancedMiniAppRequest(request, env, ctx)');
if(preflight<0||enhanced<0||preflight>enhanced)throw new Error('identity preflight must run before the canonical submit handler');

console.log('Request identity + following audit passed.');
