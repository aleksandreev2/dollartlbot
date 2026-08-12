import fs from 'node:fs';
import vm from 'node:vm';

const legacyLocales=['en','ru','es','fil','hi','pt','id','vi','fr','de'];
const locales=['ru','es','fil','hi','pt','id','vi','fr','de','ur'];
const allLocales=['en',...locales];
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
function between(source,start,end){const a=source.indexOf(start);if(a<0)throw new Error(`Missing marker: ${start}`);const b=source.indexOf(end,a+start.length);if(b<0)throw new Error(`Missing end marker: ${end}`);return source.slice(a+start.length,b).trim().replace(/;$/,'');}
function evalObject(source,label){try{return vm.runInNewContext(`(${source})`,Object.create(null),{timeout:2000});}catch(error){throw new Error(`Could not parse ${label}: ${error.message}`);}}
function evalExportObject(path,name){const source=read(path),marker=`export const ${name} = `,a=source.indexOf(marker);if(a<0)throw new Error(`${path}: missing export ${name}`);let b=source.lastIndexOf(' as const;');if(b<0)b=source.lastIndexOf(';');if(b<a)throw new Error(`${path}: could not find end of ${name}`);return evalObject(source.slice(a+marker.length,b).trim(),`${path}/${name}`);}
function exactLocales(obj,label,expected=allLocales){const actual=Object.keys(obj).sort(),wanted=[...expected].sort();const missing=wanted.filter(x=>!actual.includes(x)),extra=actual.filter(x=>!wanted.includes(x));if(missing.length||extra.length)throw new Error(`${label}: locale mismatch; missing=${missing.join(',')} extra=${extra.join(',')}`);}
function sameKeys(obj,label,reference='en'){const ref=Object.keys(obj[reference]||{}).sort();for(const locale of Object.keys(obj)){const keys=Object.keys(obj[locale]||{}).sort();const missing=ref.filter(k=>!keys.includes(k)),extra=keys.filter(k=>!ref.includes(k));if(missing.length||extra.length)throw new Error(`${label}/${locale}: key mismatch; missing=${missing.join(',')} extra=${extra.join(',')}`);}}
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

// The historical Mini App catalog remains the source of truth for the original ten locales.
// Urdu is an additive extension so adding an 11th language does not duplicate every old catalog table.
const runtime=read('public/app/i18n-runtime-v2.js');
const runtimeLanguages=evalObject(between(runtime,'const languageLabels=',';\n\n  const tags='),'runtime language labels');
const runtimeTags=evalObject(between(runtime,'const tags=',';\n\n  const copy='),'runtime tags');
const runtimeCopy=evalObject(between(runtime,'const copy=',';\n\n  const guide='),'runtime copy');
const runtimeGuide=evalObject(between(runtime,'const guide=',';\n\n  const rules='),'runtime guide');
const runtimeRules=evalObject(between(runtime,'const rules=',';\n\n  const uiFallback='),'runtime rules');
const runtimeUi=evalObject(between(runtime,'const uiFallback=',';\n\n  const apiErrors='),'runtime UI fallback');
const runtimeErrors=evalObject(between(runtime,'const apiErrors=',';\n\n  const catalog='),'runtime API errors');
for(const [obj,label] of [[runtimeLanguages,'runtime languages'],[runtimeTags,'runtime tags'],[runtimeCopy,'runtime copy'],[runtimeGuide,'runtime guide'],[runtimeRules,'runtime rules'],[runtimeErrors,'runtime API errors']]){exactLocales(obj,label,legacyLocales);sameKeys(obj,label);}
for(const locale of legacyLocales.filter(x=>x!=='en'))if(runtimeUi[locale]===undefined)throw new Error(`runtime UI fallback: missing ${locale}`);
sameKeys(runtimeUi,'runtime UI fallback','ru');
for(const locale of legacyLocales){
  if(!Array.isArray(runtimeGuide[locale]?.steps)||runtimeGuide[locale].steps.length!==4)throw new Error(`runtime guide/${locale}: expected four steps`);
  if(!Array.isArray(runtimeRules[locale]?.required)||runtimeRules[locale].required.length!==4)throw new Error(`runtime rules/${locale}: required list mismatch`);
  if(!Array.isArray(runtimeRules[locale]?.blocked)||runtimeRules[locale].blocked.length<10)throw new Error(`runtime rules/${locale}: blocked list unexpectedly short`);
}
const requiredCopyKeys=['thanks','regular','guideSub','rulesSub','chatSub','boostySub','progress','noRequests','noMatching','edit','reader','justNow','minAgo','hourAgo','dayAgo','epubRead','epubEntry','epubCompression','completeDetails','addTag','describeSex','notifications'];
for(const locale of legacyLocales)for(const key of requiredCopyKeys)if(runtimeCopy[locale]?.[key]===undefined)throw new Error(`runtime copy/${locale}: missing ${key}`);
for(const tag of ['Fantasy','Romance','Adventure','Academy','Isekai','Reincarnation','Magic','Strong MC','Harem','Slice of Life','Time Travel','System','Villainess','Slow Burn'])for(const locale of legacyLocales)if(!runtimeTags[locale]?.[tag])throw new Error(`Popular tag ${tag}: missing ${locale} label`);

const urdu=read('public/app/i18n-urdu.js');
const urLanguageLabels=evalObject(between(urdu,'const urLanguageLabels=',';\n  const urTags='),'Urdu language labels');
const urTags=evalObject(between(urdu,'const urTags=',';\n  const urCopy='),'Urdu tags');
const urCopy=evalObject(between(urdu,'const urCopy=',';\n  const urGuide='),'Urdu shared copy');
const urGuide=evalObject(between(urdu,'const urGuide=',';\n  const urRules='),'Urdu guide');
const urRules=evalObject(between(urdu,'const urRules=',';\n  const urUi='),'Urdu rules');
const urUi=evalObject(between(urdu,'const urUi=',';\n  const urApiErrors='),'Urdu UI fallback');
const urApiErrors=evalObject(between(urdu,'const urApiErrors=',';\n\n  window.DTL_LOCALE_EXTENSIONS='),'Urdu API errors');
for(const key of Object.keys(runtimeLanguages.en))if(!urLanguageLabels[key]&&key!=='ur')throw new Error(`Urdu language labels: missing ${key}`);
if(!urLanguageLabels.ur)throw new Error('Urdu language labels: missing ur self-label');
for(const tag of Object.keys(runtimeTags.en))if(!urTags[tag])throw new Error(`Urdu tags: missing ${tag}`);
for(const key of requiredCopyKeys)if(urCopy[key]===undefined)throw new Error(`Urdu shared copy: missing ${key}`);
if(!Array.isArray(urGuide.steps)||urGuide.steps.length!==4)throw new Error('Urdu guide: expected four steps');
if(!Array.isArray(urRules.required)||urRules.required.length!==4)throw new Error('Urdu rules: required list mismatch');
if(!Array.isArray(urRules.blocked)||urRules.blocked.length<10)throw new Error('Urdu rules: blocked list unexpectedly short');
for(const key of Object.keys(runtimeErrors.en))if(!urApiErrors[key])throw new Error(`Urdu API errors: missing ${key}`);
for(const key of ['Account','Language','Help / Guide','Rules','Open Telegram Chat','Boosty Subscription','Pending','In Queue','In Progress','Completed','Rejected','Confirm','Cancel','Save','Try Again'])if(!urUi[key])throw new Error(`Urdu UI fallback: missing ${key}`);
for(const required of ['window.DTL_LOCALE_EXTENSIONS=',"languagePatterns:{ur:","languageLabels:{ur:urLanguageLabels}","tags:{ur:urTags}","copy:{ur:urCopy}","guide:{ur:urGuide}","rules:{ur:urRules}","uiFallback:{ur:urUi}","apiErrors:{ur:urApiErrors}",'runtime?.registerPatcher?.(patchUrdu)','runtime?.registerResponseHandler?.(localizeUrduError)'])need(urdu,required,'Urdu Mini App extension');
forbid(urdu,'new MutationObserver','Urdu Mini App extension observer');
forbid(urdu,'window.fetch=','Urdu Mini App extension fetch wrapper');

// Legacy module-local copy remains unchanged; the Urdu extension is the single Urdu fallback/patch layer.
const referrals=read('public/app/referrals-ui.js');
const referralCopy=evalObject(between(referrals,'const L = ',';\n\n  function locale'),'referrals-ui copy');exactLocales(referralCopy,'referrals-ui copy',legacyLocales);sameKeys(referralCopy,'referrals-ui copy');
const onboarding=read('public/app/onboarding-ui.js');
const onboardingCopy=evalObject(between(onboarding,'const COPY = ',';\n\n  const icons'),'onboarding-ui copy');exactLocales(onboardingCopy,'onboarding-ui copy',legacyLocales);sameKeys(onboardingCopy,'onboarding-ui copy');
const notifications=read('public/app/notifications-ui.js');
const notificationCopy=evalObject(between(notifications,'const T=',';\n\n  function lang'),'notifications-ui copy');exactLocales(notificationCopy,'notifications-ui copy',legacyLocales);sameKeys(notificationCopy,'notifications-ui copy');
const quota=read('public/app/quota-unlimited-ui.js');
const quotaWords=evalObject(between(quota,'const words=',';\n  const captions='),'quota words');
const quotaCaptions=evalObject(between(quota,'const captions=',';\n  function norm'),'quota captions');exactLocales(quotaWords,'quota words',legacyLocales);exactLocales(quotaCaptions,'quota captions',legacyLocales);

// Historical backend layers stay ten-locale. Urdu is a consolidated final dictionary in src/i18n/ur.ts.
const base={};for(const locale of legacyLocales)base[locale]=evalExportObject(`src/i18n/${locale}.ts`,locale);
const layerSpecs=[['src/i18n/features.ts','featureTranslations'],['src/i18n/policy.ts','policyTranslations'],['src/i18n/policy_override.ts','policyOverrideTranslations'],['src/i18n/status_override.ts','statusOverrideTranslations'],['src/i18n/quality_override.ts','qualityOverrideTranslations'],['src/i18n/rules_quality_override.ts','rulesQualityOverrideTranslations'],['src/i18n/interface_polish.ts','interfacePolishTranslations'],['src/i18n/locale_cleanup.ts','localeCleanupTranslations'],['src/i18n/access_gate.ts','accessGateTranslations']];
const layers=layerSpecs.map(([path,name])=>{const obj=evalExportObject(path,name);exactLocales(obj,`${path}/${name}`,legacyLocales);if(name==='accessGateTranslations')sameKeys(obj,`${path}/${name}`);return obj;});
const merged={};for(const locale of legacyLocales)merged[locale]=Object.assign({},base[locale],...layers.map(layer=>layer[locale]||{}));sameKeys(merged,'Legacy Telegram bot dictionaries');
const englishKeys=Object.keys(merged.en).sort();
const urSource=read('src/i18n/ur.ts');
for(const required of ["import { en } from './en'",'const completeEnglish = {','...accessGateTranslations.en','export const ur = {','...completeEnglish,','satisfies Record<keyof typeof completeEnglish, string>'])need(urSource,required,'consolidated Urdu Telegram dictionary');
const urObjectText=between(urSource,'export const ur = {','} satisfies Record<keyof typeof completeEnglish, string>');
const urOverrides=evalObject(`{${urObjectText.replace(/^\s*\.\.\.completeEnglish,?\s*/m,'')}}`,'explicit Urdu Telegram overrides');
const untranslatedKeys=englishKeys.filter(key=>urOverrides[key]===undefined);
if(untranslatedKeys.length)throw new Error(`Urdu Telegram dictionary still falls back to English for: ${untranslatedKeys.join(',')}`);
for(const [key,value] of Object.entries(urOverrides))if(typeof value!=='string'||!value.trim())throw new Error(`Urdu Telegram dictionary: empty ${key}`);
for(const locale of legacyLocales)for(const [key,value] of Object.entries(merged[locale]))if(typeof value!=='string'||!value.trim())throw new Error(`Final Telegram bot dictionaries/${locale}: empty ${key}`);
for(const locale of legacyLocales)for(const key of ['accessRequiredTitle','accessRequiredText','accessJoinButton','accessRetryButton','accessGranted','accessCheckUnavailableTitle','accessCheckUnavailableText'])if(!merged[locale]?.[key])throw new Error(`Access gate/${locale}: missing ${key}`);
for(const key of ['accessRequiredTitle','accessRequiredText','accessJoinButton','accessRetryButton','accessGranted','accessCheckUnavailableTitle','accessCheckUnavailableText'])if(!urOverrides[key])throw new Error(`Access gate/ur: missing ${key}`);

const i18nCore=read('public/app/i18n-core.js');
const presenter=read('public/app/novel-presenter.js');
const viewI18n=read('public/app/view-i18n.js');
const home=read('public/app/view-home.js');
const queue=read('public/app/view-queue.js');
const suggest=read('public/app/view-suggest.js');
const suggestPicker=read('public/app/suggest-content-picker.js');
const account=read('public/app/view-requests-account.js');
for(const required of ['runtime.copy','runtime.table','app.tr=tr','app.languageName=languageName','app.tagLabel=tagLabel','app.relativeTime=relativeTime','app.requestLabel=requestLabel',"copy('notifications')"])need(viewI18n,required,'render-time view localization helper');
for(const required of ["copy('thanks')","copy('regular'","copy('noRequests')","copy('progress')",'languageName(row.original_language)',"languageName('English')"])need(home,required,'Home render-time localization');
for(const required of ["copy('progress')",'languageName(novel.original_language)',"languageName('English')"])need(queue,required,'Queue/detail render-time localization');
for(const required of ["copy('epubRead')","copy('epubEntry')","copy('epubCompression')","copy('completeDetails')","copy('edit')",'tagLabel(x.trim())','languageName(state.draft.original_language)','requestLabel(data.submission_id)'])need(suggest,required,'Suggest render-time localization');
for(const required of ["app.copy('addTag')","app.copy('describeSex')",'app.tr(\'genresTags\')','app.tr(\'sexualContent\')'])need(suggestPicker,required,'Suggest content-picker localization');
for(const required of ["copy('noMatching')","copy('guideSub')","copy('rulesSub')","copy('chatSub')","copy('boostySub')","i18nTable('guide')","i18nTable('rules')",'languageName(r.original_language)',"new CustomEvent('dtl:sheetopen'"])need(account,required,'Requests/Account render-time localization');
for(const phrase of ['Thank you for supporting novel translations!','Chapter Progress','No requests yet.','No matching requests.','Complete the novel details.','Add at least one genre or tag.','Describe the sexual content or fetishes.','>Edit<','Request #','Could not read EPUB structure.','Bad EPUB entry','EPUB compression is not supported on this device.'])for(const [name,source] of Object.entries({home,queue,suggest,account}))forbid(source,phrase,name);
for(const phrase of ['Dollar TL submission flow','Submission and content rules','5 requests/month · no 250-chapter restriction','1. Suggest a novel. 2. We review it manually.','Do not hide important tags, sexual/fetish content'])forbid(account,phrase,'Account');

for(const required of ["'en','es','fil','hi','pt','id','vi','fr','de','ru','ur'","'/api/app/bootstrap'","'/api/app/language'",'window.__DTL_LOCALE__','dtl:localechange','setCatalog','mergeLocaleExtensions','detectLanguage','languageLabel','registerPatcher','registerResponseHandler',"document.documentElement.dir = next === 'ur' ? 'rtl' : 'ltr'"])need(i18nCore,required,'i18n core');
if(runtime.includes('new MutationObserver'))throw new Error('Centralized i18n catalog must not create its own MutationObserver.');
if(runtime.includes('window.fetch=')||runtime.includes('window.fetch ='))throw new Error('Centralized i18n catalog must register a response handler instead of wrapping fetch.');
for(const required of ['DTL_I18N.setCatalog(catalog)','DTL_I18N.registerPatcher(patch)','DTL_I18N.registerResponseHandler(localizeApiError)'])need(runtime,required,'centralized i18n runtime');
forbid(presenter,'new MutationObserver','novel presenter observer');
forbid(presenter,'runtime.registerPatcher','novel presenter broad patcher');
for(const required of ["'dtl:viewrender'","'dtl:adminrender'","'dtl:sheetopen'","'dtl:localechange'"])need(presenter,required,'novel presenter semantic lifecycle');

const analytics=read('public/app/admin-product-analytics.js');
const analyticsCopy=evalObject(between(analytics,'const COPY=',';\n  const LOCALES='),'Product Analytics copy');
exactLocales(analyticsCopy,'Product Analytics copy');sameKeys(analyticsCopy,'Product Analytics copy');
for(const key of ['title','desc','period','searches','zero','intent','requests','funnel','suggest','missing','actions'])if(analyticsCopy.ur?.[key]===undefined)throw new Error(`Product Analytics/ur: missing ${key}`);
need(analytics,"ur:'ur-PK'",'Product Analytics Urdu Intl locale');
need(analytics,"document.addEventListener('dtl:localechange'",'Product Analytics locale rerender');

const rtl=read('public/app/rtl.css');
for(const required of ['html[dir="rtl"] body','html[dir="rtl"] input','html[dir="rtl"] .bottom-nav','html[dir="rtl"] .admin-v2','direction:ltr'])need(rtl,required,'Urdu RTL CSS');

const index=read('public/app/index.html');
for(const asset of ['/app/i18n-core.js?v=20260812-urdu1','/app/i18n-urdu.js?v=20260812-urdu1','/app/i18n-runtime-v2.js','/app/novel-presenter.js','/app/view-i18n.js?v=20260812-urdu1','/app/language-switch.css','/app/rtl.css?v=20260812-urdu1'])need(index,asset,'index localization assets');
if(index.indexOf('/app/i18n-urdu.js')>index.indexOf('/app/i18n-runtime-v2.js'))throw new Error('Urdu locale extension must load before the legacy catalog is registered.');
if(index.indexOf('/app/view-i18n.js')>index.indexOf('/app/view-home.js'))throw new Error('Render-time view localization must load before view modules.');
for(const legacy of ['/app/locale-sync.js','/app/i18n-inline-fixes.js','/app/i18n-wizard.js','/app/i18n-complete.js','/app/ui-polish.js','/app/language-display-fix.js','/app/onboarding-interactions-fix.js'])forbid(index,legacy,'legacy localization/runtime asset');
for(const removed of ['public/app/i18n-wizard.js','public/app/i18n-complete.js','public/app/ui-polish.js','public/app/onboarding-interactions-fix.js'])if(fs.existsSync(new URL(`../${removed}`,import.meta.url)))throw new Error(`Legacy localization/runtime file must be removed: ${removed}`);

console.log(`Localization audit passed for ${allLocales.length} locales, including consolidated Urdu, RTL, localized Product Analytics, and one canonical fallback pipeline.`);
