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
const adminPerf=read('public/app/admin-performance-v3.js');
const publishing=read('public/app/publishing-fixes.js');
const publishingCss=read('public/app/publishing-fixes.css');
const publicationManagement=read('public/app/publication-management.js');
const index=read('public/app/index.html');
const packageJson=read('package.json');
const wrangler=read('wrangler.jsonc');
const vendorScript=read('scripts/prepare-vendor.mjs');

need(presenter,"const FLAG_BASE = '/app/flags';",'novel presenter Circle Flags');
need(presenter,'runtime.detectLanguage','novel presenter semantic language detection');
need(presenter,'runtime.languageLabel','novel presenter semantic language labels');
need(presenter,'runtime.registerPatcher','novel presenter shared scheduler');
need(presenter,'dataset.sourceLanguageCode','novel presenter language metadata ownership');
need(presenter,'dataset.metaSuffix','novel presenter metadata suffix ownership');
need(presenter,'enhanceLanguagePicker','novel presenter language picker');
need(presenter,'normalizeListMeta','novel presenter language normalization');
need(presenter,'replaceArrows','novel presenter language arrows');
need(presenter,"data-lucide', 'circle-arrow-right'",'novel presenter Lucide arrow');
forbid(presenter,'hatscripts.github.io','novel presenter Circle Flags');
forbid(presenter,'new MutationObserver','novel presenter scheduling');
forbid(presenter,'const languagePatterns','novel presenter duplicate language dictionary');
forbid(presenter,'const languageLabels','novel presenter duplicate language dictionary');

for(const token of ["'/api/app/bootstrap'","'/api/app/language'",'window.__DTL_LOCALE__','dtl:localechange','dtl:bootstrap','window.DTL_RUNTIME = runtimeApi','setCatalog','detectLanguage','languageLabel','registerPatcher','registerResponseHandler','registerFetchMiddleware','const fetchMiddlewares = new Set()'])need(i18nCore,token,'runtime core');
if((i18nCore.match(/new MutationObserver/g)||[]).length!==1)throw new Error('runtime core must own exactly one MutationObserver.');
if((i18nCore.match(/window\.fetch\s*=/g)||[]).length!==1)throw new Error('runtime core must own exactly one fetch wrapper.');
for(const token of ['DTL_I18N.setCatalog(catalog)','DTL_I18N.registerPatcher(patch)','DTL_I18N.registerResponseHandler(localizeApiError)'])need(i18nRuntime,token,'centralized i18n runtime');
forbid(i18nRuntime,'new MutationObserver','centralized i18n runtime');
forbid(i18nRuntime,'window.fetch=','centralized i18n runtime');
forbid(i18nRuntime,'window.fetch =','centralized i18n runtime');

for(const [name,source] of [
  ['icons',icons],['home-v2',homeJs],['interaction-upgrade',interactions],['cover-ui',covers],['quota-unlimited-ui',quota],
  ['referrals-ui',referrals],['onboarding-interactions-fix',onboardingFix],['publishing-fixes',publishing],['publication-management',publicationManagement],
]){
  forbid(source,'new MutationObserver',`${name} shared scheduling`);
  need(source,'DTL_RUNTIME',`${name} shared runtime`);
  need(source,'registerPatcher',`${name} shared patcher registration`);
  if(/window\.fetch\s*=/.test(source))throw new Error(`${name} must not wrap fetch directly.`);
}
need(adminPerf,'DTL_RUNTIME','admin performance shared runtime');
need(adminPerf,'runtime.registerFetchMiddleware','admin performance shared fetch middleware');
forbid(adminPerf,'window.fetch =','admin performance direct fetch wrapper');
forbid(adminPerf,'window.fetch=','admin performance direct fetch wrapper');

need(homeJs,'let releases = null','home release request cache');
need(homeJs,'generation','home release stale-request protection');
forbid(homeJs,'decorateFlags','home-v2');
forbid(homeJs,'dtl-country-flag','home-v2');
forbid(homeCss,'.dtl-country-flag','home-v2 CSS');
need(homeCss,'@media (max-width:899px)','compact Telegram Desktop layout');
need(homeCss,'.page .simple-list{display:block!important','compact My Requests layout');

need(covers,"'/api/app/cover-manifest'",'cover manifest ownership');
need(covers,'const assigned = new Map()','cover manifest cache');
need(covers,'failures >= 3','bounded real-cover retry stop');
need(covers,'nextFailures < 3','bounded real-cover retry scheduling');
forbid(index,'cover-reliability.js','superseded cover runtime');
if(fs.existsSync(new URL('../public/app/cover-reliability.js',import.meta.url)))throw new Error('Superseded cover-reliability.js must be removed.');

need(quota,"document.addEventListener('dtl:bootstrap'",'quota bootstrap reuse');
forbid(quota,"fetch('/api/app/bootstrap'",'quota duplicate bootstrap request');
forbid(quota,'setInterval(','quota polling');

need(referrals,'runtime.locale()','referrals shared locale authority');
need(referrals,'runtime.registerPatcher','referrals shared scheduler');
need(publishing,'injectNativeCommentsNote','publishing native comments preview ownership');
need(publishingCss,'.tg-preview-comments-note','publishing native comments CSS ownership');
need(publicationManagement,'runtime.registerPatcher','publication management shared scheduler');
forbid(index,'publishing-comments-ui.js','superseded publishing comments runtime');
if(fs.existsSync(new URL('../public/app/publishing-comments-ui.js',import.meta.url)))throw new Error('Superseded publishing-comments-ui.js must be removed.');

need(packageJson,'"lucide": "1.27.0"','pinned Lucide dependency');
need(wrangler,'"command": "node scripts/prepare-vendor.mjs"','Wrangler vendor build');
need(vendorScript,"node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js'",'Lucide vendor source');
need(vendorScript,"public', 'app', 'vendor', 'lucide.min.js'",'Lucide vendor destination');
need(vendorScript,'@license lucide v1.27.0','Lucide vendor version guard');
need(index,'/app/vendor/lucide.min.js?v=1.27.0','self-hosted Lucide runtime');
forbid(index,'unpkg.com/lucide','external Lucide CDN');

for(const asset of ['i18n-core.js?v=20260810-runtime3','admin-performance-v3.js?v=20260810-runtime3','referrals-ui.js?v=20260810-runtime3','onboarding-interactions-fix.js?v=20260810-runtime3','publishing-fixes.js?v=20260810-runtime3','publication-management.js?v=20260810-runtime3','home-v2.js?v=20260810-runtime2'])need(index,asset,'cache-busted Mini App runtime');
const loadOrder=['/app/vendor/lucide.min.js','/app/i18n-core.js','/app/icons.js','/app/i18n-runtime-v2.js','/app/novel-presenter.js','/app/admin-performance-v3.js','/app/referrals-ui.js','/app/onboarding-interactions-fix.js','/app/publishing-fixes.js','/app/publication-management.js','/app/home-v2.js','/app/app.js'];
let previous=-1;
for(const asset of loadOrder){const at=index.indexOf(asset);if(at<0)throw new Error(`Missing frontend runtime asset: ${asset}`);if(at<=previous)throw new Error(`Frontend runtime order is invalid around ${asset}`);previous=at;}

for(const legacy of ['locale-sync.js','i18n-inline-fixes.js','i18n-wizard.js','i18n-complete.js','ui-polish.js','language-flags-bridge.js','arrow-upgrade.js','language-display-fix.js','content-normalizer.js','card-upgrade.js','publishing-comments-ui.js'])forbid(index,legacy,'Mini App runtime');
for(const removed of [
  'public/app/locale-sync.js','public/app/i18n-inline-fixes.js','public/app/i18n-wizard.js','public/app/i18n-complete.js','public/app/ui-polish.js',
  'public/app/language-display-fix.js','public/app/content-normalizer.js','public/app/card-upgrade.js','public/app/publishing-comments-ui.js'
]){
  if(fs.existsSync(new URL(`../${removed}`,import.meta.url)))throw new Error(`Superseded frontend runtime must not be reintroduced: ${removed}`);
}

for(const country of ['kr','jp','cn','gb','ru','es','pt','id','vn','fr','de','in','ph']){
  const path=new URL(`../public/app/flags/${country}.svg`,import.meta.url);
  if(!fs.existsSync(path))throw new Error(`Missing self-hosted Circle Flag: ${country}.svg`);
  const svg=fs.readFileSync(path,'utf8');
  if(!svg.includes('<svg')||!svg.includes('viewBox='))throw new Error(`Invalid Circle Flag asset: ${country}.svg`);
}
const notices=read('THIRD_PARTY_NOTICES.md');
need(notices,'## Circle Flags','Circle Flags license notice');
need(notices,'## Lucide','Lucide license notice');

console.log('Frontend stability audit passed: shared scheduler/fetch pipeline, consolidated publishing runtime, self-hosted pinned Lucide, and reused bootstrap state.');
