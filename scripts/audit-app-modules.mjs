import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const exists=path=>fs.existsSync(new URL(`../${path}`,import.meta.url));
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

const entry=read('public/app/app.js');
const core=read('public/app/app-core.js');
const viewI18n=read('public/app/view-i18n.js');
const home=read('public/app/view-home.js');
const queue=read('public/app/view-queue.js');
const suggest=read('public/app/view-suggest.js');
const account=read('public/app/view-requests-account.js');
const admin=read('public/app/view-admin.js');
const index=read('public/app/index.html');

if(Buffer.byteLength(entry)>256)throw new Error(`app.js must remain a tiny bootstrap entry; got ${Buffer.byteLength(entry)} bytes.`);
need(entry,'DTL_APP?.init()','app bootstrap');
if(Buffer.byteLength(core)>42000)throw new Error(`app-core.js has grown past the architecture budget: ${Buffer.byteLength(core)} bytes.`);

for(const token of ['const views = new Map()','function registerView(','window.DTL_APP = app','dtl:viewchange','dtl:viewrender','emit(`dtl:${view}`','function refreshBootstrap(','function navigate('])need(core,token,'app core');
for(const legacy of ['function renderAdmin(','function adminStats(','function loadAdminList(','function adminRequestCard(','function confirmAdminAction(','function runAdminAction(','function previewAdminRows('])forbid(core,legacy,'app core legacy admin');
if(core.includes('new MutationObserver'))throw new Error('App core must not own a DOM observer; DTL_RUNTIME is the sole observer owner.');

for(const token of ['DTL_I18N','runtime.copy','runtime.table','app.tr=tr','app.languageName=languageName','app.tagLabel=tagLabel','app.relativeTime=relativeTime','app.requestLabel=requestLabel'])need(viewI18n,token,'view localization helpers');
if(viewI18n.includes('new MutationObserver'))throw new Error('View localization helpers must not create a MutationObserver.');

const modules={home,queue,suggest,account,admin};
for(const [name,source] of Object.entries(modules)){
  need(source,'DTL_APP',`${name} view app API`);
  if(source.includes('new MutationObserver'))throw new Error(`${name} view must not create a MutationObserver.`);
  if(/window\.fetch\s*=/.test(source))throw new Error(`${name} view must not wrap fetch.`);
}
need(home,"registerView('home'",'Home view registration');
need(queue,"registerView('queue'",'Queue view registration');
need(queue,"registerView('detail'",'Novel detail registration');
need(suggest,"registerView('suggest'",'Suggest view registration');
need(account,"registerView('requests'",'Requests view registration');
need(account,"registerView('account'",'Account view registration');
need(admin,"registerView('admin'",'Admin view registration');
need(admin,'DTL_ADMIN_CONSOLE.open()','direct canonical admin route');
forbid(admin,'.admin-stats','admin direct route');

const jsOrder=['/app/app-core.js','/app/view-i18n.js','/app/admin-console.js','/app/view-home.js','/app/view-queue.js','/app/view-suggest.js','/app/view-requests-account.js','/app/view-admin.js','/app/app.js'];
let previous=-1;
for(const asset of jsOrder){const at=index.indexOf(asset);if(at<0)throw new Error(`index.html missing ${asset}`);if(at<=previous)throw new Error(`App load order invalid around ${asset}`);previous=at;}

for(const css of ['public/app/admin-console.css','public/app/admin-tools.css','public/app/admin-publishing.css'])if(!exists(css))throw new Error(`Missing canonical admin stylesheet: ${css}`);
for(const css of ['public/app/admin-v2.css','public/app/admin-v3.css','public/app/admin-performance-v3.css','public/app/publishing-fixes.css','public/app/publication-management.css'])if(exists(css))throw new Error(`Legacy stylesheet must be removed: ${css}`);
for(const legacy of ['admin-v2.css','admin-v3.css','admin-performance-v3.css','publishing-fixes.css','publication-management.css'])forbid(index,legacy,'index legacy admin stylesheet');
need(read('public/app/admin-console.css'),'.admin-v2','admin console stylesheet');
need(read('public/app/admin-tools.css'),'.admin-users-layout','admin tools stylesheet');
need(read('public/app/admin-publishing.css'),'.publishing-health','admin publishing stylesheet');

console.log('App architecture audit passed: tiny bootstrap, registered view modules, render-time localization helpers, direct admin routing, semantic view events, and canonical admin CSS ownership.');
