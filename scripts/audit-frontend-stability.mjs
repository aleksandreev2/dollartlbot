import fs from 'node:fs';

function read(path){return fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');}
function need(source,needle,label){if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);}
function forbid(source,needle,label){if(source.includes(needle))throw new Error(`${label}: forbidden legacy fragment ${needle}`);}

const presenter=read('public/app/novel-presenter.js');
const i18nCore=read('public/app/i18n-core.js');
const i18nRuntime=read('public/app/i18n-runtime-v2.js');
const homeJs=read('public/app/home-v2.js');
const homeCss=read('public/app/home-v2.css');
const index=read('public/app/index.html');

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

for(const token of ["'/api/app/bootstrap'","'/api/app/language'",'window.__DTL_LOCALE__','dtl:localechange','setCatalog','detectLanguage','languageLabel','registerPatcher','registerResponseHandler'])need(i18nCore,token,'i18n core');
if((i18nCore.match(/new MutationObserver/g)||[]).length!==1)throw new Error('i18n-core must own exactly one MutationObserver.');
if((i18nCore.match(/window\.fetch\s*=/g)||[]).length!==1)throw new Error('i18n-core must own exactly one fetch wrapper.');
for(const token of ['DTL_I18N.setCatalog(catalog)','DTL_I18N.registerPatcher(patch)','DTL_I18N.registerResponseHandler(localizeApiError)'])need(i18nRuntime,token,'centralized i18n runtime');
forbid(i18nRuntime,'new MutationObserver','centralized i18n runtime');
forbid(i18nRuntime,'window.fetch=','centralized i18n runtime');
forbid(i18nRuntime,'window.fetch =','centralized i18n runtime');

forbid(homeJs,'decorateFlags','home-v2');
forbid(homeJs,'dtl-country-flag','home-v2');
forbid(homeCss,'.dtl-country-flag','home-v2 CSS');
need(homeCss,'@media (max-width:899px)','compact Telegram Desktop layout');
need(homeCss,'.page .simple-list{display:block!important','compact My Requests layout');
for(const asset of ['i18n-core.js?v=20260810-architecture1','i18n-runtime-v2.js?v=20260810-architecture1','novel-presenter.js?v=20260810-architecture1','home-v2.js?v=20260810-stableflags1'])need(index,asset,'cache-busted Mini App runtime');
for(const legacy of ['locale-sync.js','i18n-inline-fixes.js','i18n-wizard.js','i18n-complete.js','ui-polish.js','language-flags-bridge.js','arrow-upgrade.js','language-display-fix.js','content-normalizer.js','card-upgrade.js'])forbid(index,legacy,'Mini App runtime');

for(const removed of [
  'public/app/locale-sync.js','public/app/i18n-inline-fixes.js','public/app/i18n-wizard.js','public/app/i18n-complete.js','public/app/ui-polish.js',
  'public/app/language-display-fix.js','public/app/content-normalizer.js','public/app/card-upgrade.js'
]){
  if(fs.existsSync(new URL(`../${removed}`,import.meta.url)))throw new Error(`Superseded frontend runtime must not be reintroduced: ${removed}`);
}

for(const country of ['kr','jp','cn','gb','ru','es','pt','id','vn','fr','de','in','ph']){
  const path=new URL(`../public/app/flags/${country}.svg`,import.meta.url);
  if(!fs.existsSync(path))throw new Error(`Missing self-hosted Circle Flag: ${country}.svg`);
  const svg=fs.readFileSync(path,'utf8');
  if(!svg.includes('<svg')||!svg.includes('viewBox='))throw new Error(`Invalid Circle Flag asset: ${country}.svg`);
}
if(!fs.existsSync(new URL('../THIRD_PARTY_NOTICES.md',import.meta.url)))throw new Error('Missing third-party license notice for vendored Circle Flags.');

console.log('Frontend stability audit passed: semantic metadata, one shared scheduler, no superseded localization runtimes.');
