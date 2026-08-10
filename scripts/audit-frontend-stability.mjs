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
const onboardingFix=read('public/app/onboarding-interactions-fix.js');
const adminCache=read('public/app/admin-cache.js');
const adminConsole=read('public/app/admin-console.js');
const adminTools=read('public/app/admin-tools.js');
const adminPublishing=read('public/app/admin-publishing.js');
const publishingCss=read('public/app/admin-publishing.css');
const index=read('public/app/index.html');
const packageJson=read('package.json');
const wrangler=read('wrangler.jsonc');
const vendorScript=read('scripts/prepare-vendor.mjs');

need(presenter,"const FLAG_BASE = '/app/flags';",'novel presenter Circle Flags');
need(presenter,'runtime.detectLanguage','novel presenter semantic language detection');
need(presenter,'runtime.languageLabel','novel presenter semantic language labels');
need(presenter,'runtime.registerPatcher','novel presenter shared scheduler');
forbid(presenter,'hatscripts.github.io','novel presenter Circle Flags');
forbid(presenter,'new MutationObserver','novel presenter scheduling');

for(const token of ["'/api/app/bootstrap'","'/api/app/language'",'window.__DTL_LOCALE__','dtl:localechange','dtl:bootstrap','window.DTL_RUNTIME = runtimeApi','registerPatcher','registerResponseHandler','registerFetchMiddleware'])need(i18nCore,token,'runtime core');
if((i18nCore.match(/new MutationObserver/g)||[]).length!==1)throw new Error('runtime core must own exactly one MutationObserver.');
if((i18nCore.match(/window\.fetch\s*=/g)||[]).length!==1)throw new Error('runtime core must own exactly one fetch wrapper.');
for(const token of ['DTL_I18N.setCatalog(catalog)','DTL_I18N.registerPatcher(patch)','DTL_I18N.registerResponseHandler(localizeApiError)'])need(i18nRuntime,token,'centralized i18n runtime');

for(const [name,source] of [
  ['icons',icons],['home-v2',homeJs],['interaction-upgrade',interactions],['cover-ui',covers],['quota-unlimited-ui',quota],
  ['referrals-ui',referrals],['onboarding-interactions-fix',onboardingFix],['admin-console',adminConsole],['admin-tools',adminTools],['admin-publishing',adminPublishing],
]){
  forbid(source,'new MutationObserver',`${name} shared scheduling`);
  need(source,'DTL_RUNTIME',`${name} shared runtime`);
  need(source,'registerPatcher',`${name} shared patcher registration`);
  if(/window\.fetch\s*=/.test(source))throw new Error(`${name} must not wrap fetch directly.`);
}
need(adminCache,'DTL_RUNTIME','admin cache shared runtime');
need(adminCache,'runtime.registerFetchMiddleware','admin cache shared fetch middleware');
forbid(adminCache,'window.fetch =','admin cache direct fetch wrapper');

need(homeJs,"ru:{greeting:n=>`Рады вас видеть, ${n} 👋`",'localized Home greeting');
need(homeJs,'function patchGreeting()','semantic Home greeting patch');
need(homeJs,"document.addEventListener('dtl:bootstrap'",'Home bootstrap user reuse');
need(homeJs,'let releases = null','home release request cache');
need(homeJs,'generation','home release stale-request protection');
need(homeCss,'@media (max-width:899px)','compact Telegram Desktop layout');

need(covers,"'/api/app/cover-manifest'",'cover manifest ownership');
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

console.log('Frontend stability audit passed: shared runtime, canonical admin modules/CSS, localized Home greeting, self-hosted Lucide, and reused bootstrap state.');
