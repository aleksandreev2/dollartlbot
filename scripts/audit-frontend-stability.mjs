import fs from 'node:fs';

function read(path){return fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');}
function need(source,needle,label){if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);}
function forbid(source,needle,label){if(source.includes(needle))throw new Error(`${label}: forbidden legacy fragment ${needle}`);}

const presenter=read('public/app/novel-presenter.js');
const i18nCore=read('public/app/i18n-core.js');
const i18nRuntime=read('public/app/i18n-runtime-v2.js');
const icons=read('public/app/icons.js');
const homeJs=read('public/app/home-v2.js');
const homeCss=read('public/app/home-v2.css');
const interactions=read('public/app/interaction-upgrade.js');
const covers=read('public/app/cover-ui.js');
const quota=read('public/app/quota-unlimited-ui.js');
const referrals=read('public/app/referrals-ui.js');
const onboarding=read('public/app/onboarding-ui.js');
const adminCache=read('public/app/admin-cache.js');
const adminConsole=read('public/app/admin-console.js');
const adminTools=read('public/app/admin-tools.js');
const adminPublishing=read('public/app/admin-publishing.js');
const publishingCss=read('public/app/admin-publishing.css');
const queueView=read('public/app/view-queue.js');
const accountView=read('public/app/view-requests-account.js');
const index=read('public/app/index.html');
const packageJson=read('package.json');
const wrangler=read('wrangler.jsonc');
const vendorScript=read('scripts/prepare-vendor.mjs');

need(presenter,"const FLAG_BASE = '/app/flags';",'novel presenter Circle Flags');
need(presenter,'runtime.detectLanguage','novel presenter semantic language detection');
need(presenter,'runtime.languageLabel','novel presenter semantic language labels');
for(const event of ["'dtl:viewrender'","'dtl:adminrender'","'dtl:sheetopen'","'dtl:localechange'"])need(presenter,event,'novel presenter event lifecycle');
forbid(presenter,'runtime.registerPatcher','novel presenter broad scheduler');
forbid(presenter,'new MutationObserver','novel presenter scheduling');
forbid(presenter,'hatscripts.github.io','novel presenter Circle Flags');

for(const token of ["'/api/app/bootstrap'","'/api/app/language'",'window.__DTL_LOCALE__','dtl:localechange','dtl:bootstrap','window.DTL_RUNTIME = runtimeApi','registerPatcher','registerResponseHandler','registerFetchMiddleware'])need(i18nCore,token,'runtime core');
if((i18nCore.match(/new MutationObserver/g)||[]).length!==1)throw new Error('runtime core must own exactly one fallback MutationObserver.');
if((i18nCore.match(/window\.fetch\s*=/g)||[]).length!==1)throw new Error('runtime core must own exactly one fetch wrapper.');
for(const token of ['DTL_I18N.setCatalog(catalog)','DTL_I18N.registerPatcher(patch)','DTL_I18N.registerResponseHandler(localizeApiError)'])need(i18nRuntime,token,'centralized i18n runtime');

for(const [name,source] of [
  ['home-v2',homeJs],['cover-ui',covers],['referrals-ui',referrals],['onboarding-ui',onboarding],['novel-presenter',presenter],
]){
  forbid(source,'new MutationObserver',`${name} event-driven scheduling`);
  forbid(source,'registerPatcher',`${name} broad scheduler registration`);
  if(/window\.fetch\s*=/.test(source))throw new Error(`${name} must not wrap fetch directly.`);
}
for(const [name,source] of [
  ['icons',icons],['interaction-upgrade',interactions],['quota-unlimited-ui',quota],['admin-console',adminConsole],['admin-tools',adminTools],['admin-publishing',adminPublishing],
]){
  forbid(source,'new MutationObserver',`${name} shared scheduling`);
  need(source,'DTL_RUNTIME',`${name} shared runtime`);
  need(source,'registerPatcher',`${name} shared patcher registration`);
  if(/window\.fetch\s*=/.test(source))throw new Error(`${name} must not wrap fetch directly.`);
}
need(adminCache,'DTL_RUNTIME','admin cache shared runtime');
need(adminCache,'runtime.registerFetchMiddleware','admin cache shared fetch middleware');
forbid(adminCache,'window.fetch =','admin cache direct fetch wrapper');

for(const token of ["document.addEventListener('dtl:home'","document.addEventListener('dtl:localechange'",'let releases = null','let loading = null'])need(homeJs,token,'event-driven Home releases');
forbid(homeJs,'function patchGreeting()','duplicate Home greeting patch');
forbid(homeJs,'greeting:n=>','duplicate Home greeting copy');
need(homeCss,'@media (max-width:899px)','compact Telegram Desktop layout');

need(covers,"'/api/app/cover-manifest'",'cover manifest ownership');
for(const event of ["'dtl:viewrender'","'dtl:adminrender'","'dtl:detail'"])need(covers,event,'cover event lifecycle');
need(covers,".admin-request-card,.admin-request",'canonical admin cover selector');
need(referrals,"document.addEventListener('dtl:account'",'Account referral mount');
need(referrals,"document.addEventListener('dtl:home'",'Home referral bonus mount');
need(referrals,"document.addEventListener('dtl:viewchange'",'referral polling lifecycle');
need(onboarding,'const TAP_SELECTOR','integrated onboarding tap bridge');
need(onboarding,"capture:true",'onboarding single touch lifecycle');
if(fs.existsSync(new URL('../public/app/onboarding-interactions-fix.js',import.meta.url)))throw new Error('Superseded onboarding interaction shim must be removed.');
forbid(index,'onboarding-interactions-fix.js','superseded onboarding interaction shim');
need(accountView,"new CustomEvent('dtl:sheetopen'",'semantic sheet lifecycle');
need(queueView,'state.queueLanguage=btn.dataset.qLang;app.render()','Queue filter semantic rerender');
need(queueView,'state.queueSegment=btn.dataset.qSegment;app.render()','Queue segment semantic rerender');
need(accountView,'state.requestFilter=btn.dataset.rFilter;app.render()','Requests filter semantic rerender');
need(accountView,'app.renderNav();app.render()','Account locale semantic rerender');

need(quota,"document.addEventListener('dtl:bootstrap'",'quota bootstrap reuse');
forbid(quota,"fetch('/api/app/bootstrap'",'quota duplicate bootstrap request');

need(adminConsole,'window.DTL_ADMIN_CONSOLE','canonical admin console API');
need(adminConsole,"document.dispatchEvent(new CustomEvent('dtl:adminrender'",'admin render event');
need(adminTools,"data-admin-tools","admin tools navigation ownership");
need(adminPublishing,'injectNativeCommentsNote','publishing native comments preview ownership');
need(adminPublishing,'installManagement','publication management consolidation');
need(publishingCss,'.tg-preview-comments-note','publishing native comments CSS ownership');

for(const legacy of ['admin-v2.js','admin-v3.js','admin-performance-v3.js','publishing-fixes.js','publication-management.js','publishing-comments-ui.js']){
  forbid(index,legacy,'legacy admin runtime');
  if(fs.existsSync(new URL(`../public/app/${legacy}`,import.meta.url)))throw new Error(`Superseded admin runtime must be removed: ${legacy}`);
}
for(const asset of ['admin-cache.js?v=20260810-admin1','admin-console.js?v=20260810-admin1','admin-tools.js?v=20260810-admin1','admin-publishing.js?v=20260810-admin1'])need(index,asset,'canonical admin runtime');
for(const asset of ['novel-presenter.js?v=20260810-runtime4','cover-ui.js?v=20260810-runtime4','referrals-ui.js?v=20260810-runtime4','onboarding-ui.js?v=20260810-runtime4','home-v2.js?v=20260810-runtime4','view-queue.js?v=20260810-app3','view-requests-account.js?v=20260810-app3'])need(index,asset,'event-driven frontend runtime');
for(const css of ['admin-console.css?v=20260810-app1','admin-tools.css?v=20260810-app1','admin-publishing.css?v=20260810-app1'])need(index,css,'canonical admin CSS');
for(const legacyCss of ['admin-v2.css','admin-v3.css','admin-performance-v3.css','publishing-fixes.css','publication-management.css'])forbid(index,legacyCss,'legacy admin CSS');

need(packageJson,'"lucide": "1.27.0"','pinned Lucide dependency');
need(wrangler,'"command": "node scripts/prepare-vendor.mjs"','Wrangler vendor build');
need(vendorScript,'@license lucide v1.27.0','Lucide vendor version guard');
need(index,'/app/vendor/lucide.min.js?v=1.27.0','self-hosted Lucide runtime');
forbid(index,'unpkg.com/lucide','external Lucide CDN');

for(const country of ['kr','jp','cn','gb','ru','es','pt','id','vn','fr','de','in','ph']){
  const path=new URL(`../public/app/flags/${country}.svg`,import.meta.url);
  if(!fs.existsSync(path))throw new Error(`Missing self-hosted Circle Flag: ${country}.svg`);
}
const notices=read('THIRD_PARTY_NOTICES.md');
need(notices,'## Circle Flags','Circle Flags license notice');
need(notices,'## Lucide','Lucide license notice');

console.log('Frontend stability audit passed: semantic view/sheet enhancement events, lifecycle-safe internal rerenders, one fallback observer, canonical admin modules, self-hosted Lucide, and no duplicate Home/onboarding patch layers.');
