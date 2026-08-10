import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const core=read('public/app/i18n-core.js');
const i18nRuntime=read('public/app/i18n-runtime-v2.js');
const index=read('public/app/index.html');

for(const token of ['setCatalog','detectLanguage','languageLabel','patchInlineCopy','requestPattern','positionPattern','chapterPattern','registerPatcher','registerResponseHandler','registerFetchMiddleware','const patchers = new Set()','const responseHandlers = new Set()','const fetchMiddlewares = new Set()','new MutationObserver(schedule)']){
  if(!core.includes(token))throw new Error(`runtime core missing shared primitive: ${token}`);
}
if((core.match(/new MutationObserver/g)||[]).length!==1)throw new Error('runtime core must own exactly one fallback MutationObserver.');
if((core.match(/window\.fetch\s*=/g)||[]).length!==1)throw new Error('runtime core must own exactly one fetch wrapper.');

const sharedModules={
  'i18n-runtime-v2':'public/app/i18n-runtime-v2.js',
  'novel-presenter':'public/app/novel-presenter.js',
  'icons':'public/app/icons.js',
  'home-v2':'public/app/home-v2.js',
  'interaction-upgrade':'public/app/interaction-upgrade.js',
  'cover-ui':'public/app/cover-ui.js',
  'quota-unlimited-ui':'public/app/quota-unlimited-ui.js',
  'referrals-ui':'public/app/referrals-ui.js',
  'admin-console':'public/app/admin-console.js',
  'admin-tools':'public/app/admin-tools.js',
  'admin-publishing':'public/app/admin-publishing.js',
};
for(const [name,path] of Object.entries(sharedModules)){
  const source=read(path);
  if(source.includes('new MutationObserver'))throw new Error(`${name} must not create a MutationObserver.`);
  if(/window\.fetch\s*=/.test(source))throw new Error(`${name} must not wrap fetch directly.`);
  if(name!=='i18n-runtime-v2'&&!source.includes('DTL_RUNTIME')&&!source.includes('DTL_I18N'))throw new Error(`${name} must consume the shared runtime API.`);
}
for(const token of ['DTL_I18N.setCatalog(catalog)','DTL_I18N.registerPatcher(patch)','DTL_I18N.registerResponseHandler(localizeApiError)'])if(!i18nRuntime.includes(token))throw new Error(`i18n-runtime-v2 missing shared registration: ${token}`);
const adminCache=read('public/app/admin-cache.js');
if(!adminCache.includes('runtime.registerFetchMiddleware'))throw new Error('admin-cache must register cache middleware with shared fetch pipeline.');
if(/window\.fetch\s*=/.test(adminCache))throw new Error('admin-cache must not wrap fetch directly.');

for(const legacy of ['/app/i18n-wizard.js','/app/i18n-complete.js','/app/ui-polish.js','/app/publishing-comments-ui.js','/app/admin-v2.js','/app/admin-v3.js','/app/admin-performance-v3.js','/app/publishing-fixes.js','/app/publication-management.js','/app/onboarding-interactions-fix.js'])if(index.includes(legacy))throw new Error(`Legacy runtime must not be loaded: ${legacy}`);
for(const removed of ['public/app/i18n-wizard.js','public/app/i18n-complete.js','public/app/ui-polish.js','public/app/publishing-comments-ui.js','public/app/admin-v2.js','public/app/admin-v3.js','public/app/admin-performance-v3.js','public/app/publishing-fixes.js','public/app/publication-management.js','public/app/onboarding-interactions-fix.js'])if(fs.existsSync(new URL(`../${removed}`,import.meta.url)))throw new Error(`Legacy runtime must be removed: ${removed}`);

for(const [path,events] of [
  ['public/app/novel-presenter.js',['dtl:viewrender','dtl:adminrender','dtl:sheetopen']],
  ['public/app/home-v2.js',['dtl:home']],
  ['public/app/cover-ui.js',['dtl:viewrender','dtl:adminrender']],
  ['public/app/referrals-ui.js',['dtl:home','dtl:account','dtl:viewchange']],
]){
  const source=read(path);
  if(source.includes('registerPatcher'))throw new Error(`${path} must use semantic events instead of the fallback patcher registry.`);
  for(const event of events)if(!source.includes(event))throw new Error(`${path} missing semantic lifecycle event ${event}.`);
}
const onboarding=read('public/app/onboarding-ui.js');
if(!onboarding.includes('TAP_SELECTOR')||!onboarding.includes('capture:true'))throw new Error('Onboarding touch bridge must be integrated into onboarding-ui.js.');

const order=['/app/i18n-core.js','/app/i18n-runtime-v2.js','/app/novel-presenter.js','/app/app-core.js','/app/admin-cache.js','/app/admin-console.js','/app/admin-tools.js','/app/admin-publishing.js','/app/home-v2.js','/app/view-home.js','/app/view-queue.js','/app/view-suggest.js','/app/view-requests-account.js','/app/view-admin.js','/app/app.js'];
let previous=-1;
for(const asset of order){const at=index.indexOf(asset);if(at<0)throw new Error(`Missing runtime asset: ${asset}`);if(at<=previous)throw new Error(`Runtime asset order is invalid around ${asset}`);previous=at;}

console.log('Shared Mini App runtime audit passed: one fallback DOM observer, one fetch wrapper, semantic enhancement events, modular app views, and canonical admin modules.');
