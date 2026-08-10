import fs from 'node:fs';
import vm from 'node:vm';

const locales=['ru','es','fil','hi','pt','id','vi','fr','de'];
const allLocales=['en',...locales];

function read(path){return fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');}
function between(source,start,end){
  const a=source.indexOf(start);if(a<0)throw new Error(`Missing marker: ${start}`);
  const b=source.indexOf(end,a+start.length);if(b<0)throw new Error(`Missing end marker: ${end}`);
  return source.slice(a+start.length,b).trim().replace(/;$/,'');
}
function evalObject(source,label){
  try{return vm.runInNewContext(`(${source})`,Object.create(null),{timeout:2000});}
  catch(error){throw new Error(`Could not parse ${label}: ${error.message}`);}
}
function evalExportObject(path,name){
  const source=read(path);const marker=`export const ${name} = `;const a=source.indexOf(marker);
  if(a<0)throw new Error(`${path}: missing export ${name}`);
  let b=source.lastIndexOf(' as const;');if(b<0)b=source.lastIndexOf(';');
  if(b<a)throw new Error(`${path}: could not find end of ${name}`);
  return evalObject(source.slice(a+marker.length,b).trim(),`${path}/${name}`);
}
function assertLocales(obj,label,includeEnglish=false){
  const expected=includeEnglish?allLocales:locales;
  for(const locale of expected)if(obj[locale]===undefined)throw new Error(`${label}: missing locale ${locale}`);
}
function assertExactLocaleSet(obj,label){
  const actual=Object.keys(obj).sort(),expected=[...allLocales].sort();
  const missing=expected.filter(x=>!actual.includes(x)),extra=actual.filter(x=>!expected.includes(x));
  if(missing.length||extra.length)throw new Error(`${label}: locale mismatch${missing.length?`\n  missing: ${missing.join(', ')}`:''}${extra.length?`\n  extra: ${extra.join(', ')}`:''}`);
}
function assertSameKeys(obj,label,reference='en'){
  const ref=Object.keys(obj[reference]||{}).sort();
  for(const locale of Object.keys(obj)){
    const keys=Object.keys(obj[locale]||{}).sort();
    const missing=ref.filter(k=>!keys.includes(k));
    const extra=keys.filter(k=>!ref.includes(k));
    if(missing.length||extra.length)throw new Error(`${label}/${locale}: key mismatch${missing.length?`\n  missing: ${missing.join(', ')}`:''}${extra.length?`\n  extra: ${extra.join(', ')}`:''}`);
  }
}
function normalizeText(value){return String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');}

const runtime=read('public/app/i18n-runtime-v2.js');
const runtimeLanguages=evalObject(between(runtime,'const languageLabels=',';\n\n  const tags='),'runtime language labels');
const runtimeTags=evalObject(between(runtime,'const tags=',';\n\n  const copy='),'runtime tags');
const runtimeCopy=evalObject(between(runtime,'const copy=',';\n\n  const guide='),'runtime copy');
const runtimeGuide=evalObject(between(runtime,'const guide=',';\n\n  const rules='),'runtime guide');
const runtimeRules=evalObject(between(runtime,'const rules=',';\n\n  const uiFallback='),'runtime rules');
const runtimeUi=evalObject(between(runtime,'const uiFallback=',';\n\n  const apiErrors='),'runtime UI fallback');
const runtimeErrors=evalObject(between(runtime,'const apiErrors=',';\n\n  const catalog='),'runtime API errors');
for(const [obj,label] of [
  [runtimeLanguages,'runtime languages'],[runtimeTags,'runtime tags'],[runtimeCopy,'runtime copy'],
  [runtimeGuide,'runtime guide'],[runtimeRules,'runtime rules'],[runtimeErrors,'runtime API errors']
]){assertExactLocaleSet(obj,label);assertSameKeys(obj,label);}
assertLocales(runtimeUi,'runtime UI fallback');
assertSameKeys(runtimeUi,'runtime UI fallback','ru');
for(const locale of allLocales){
  if(!Array.isArray(runtimeGuide[locale]?.steps)||runtimeGuide[locale].steps.length!==4)throw new Error(`runtime guide/${locale}: expected four steps`);
  if(!Array.isArray(runtimeRules[locale]?.required)||runtimeRules[locale].required.length!==4)throw new Error(`runtime rules/${locale}: required list mismatch`);
  if(!Array.isArray(runtimeRules[locale]?.blocked)||runtimeRules[locale].blocked.length<10)throw new Error(`runtime rules/${locale}: blocked list unexpectedly short`);
}

const referrals=read('public/app/referrals-ui.js');
const referralCopy=evalObject(between(referrals,'const L = ',';\n\n  function locale'),'referrals-ui copy');
assertExactLocaleSet(referralCopy,'referrals-ui copy');assertSameKeys(referralCopy,'referrals-ui copy');
const onboarding=read('public/app/onboarding-ui.js');
const onboardingCopy=evalObject(between(onboarding,'const COPY = ',';\n\n  const icons'),'onboarding-ui copy');
assertExactLocaleSet(onboardingCopy,'onboarding-ui copy');assertSameKeys(onboardingCopy,'onboarding-ui copy');
const notifications=read('public/app/notifications-ui.js');
const notificationCopy=evalObject(between(notifications,'const T=',';\n  function lang'),'notifications-ui copy');
assertExactLocaleSet(notificationCopy,'notifications-ui copy');assertSameKeys(notificationCopy,'notifications-ui copy');
const quota=read('public/app/quota-unlimited-ui.js');
const quotaWords=evalObject(between(quota,'const words=',';\n  const captions='),'quota unlimited words');
const quotaCaptions=evalObject(between(quota,'const captions=',';\n  function norm'),'quota unlimited captions');
assertExactLocaleSet(quotaWords,'quota unlimited words');assertExactLocaleSet(quotaCaptions,'quota unlimited captions');

const base={};for(const locale of allLocales)base[locale]=evalExportObject(`src/i18n/${locale}.ts`,locale);
const layerSpecs=[['src/i18n/features.ts','featureTranslations'],['src/i18n/policy.ts','policyTranslations'],['src/i18n/policy_override.ts','policyOverrideTranslations'],['src/i18n/status_override.ts','statusOverrideTranslations'],['src/i18n/quality_override.ts','qualityOverrideTranslations'],['src/i18n/rules_quality_override.ts','rulesQualityOverrideTranslations'],['src/i18n/interface_polish.ts','interfacePolishTranslations'],['src/i18n/locale_cleanup.ts','localeCleanupTranslations']];
const layers=[];for(const [path,name] of layerSpecs){const obj=evalExportObject(path,name);assertExactLocaleSet(obj,`${path}/${name}`);layers.push(obj);}
const merged={};for(const locale of allLocales)merged[locale]=Object.assign({},base[locale],...layers.map(layer=>layer[locale]||{}));
assertSameKeys(merged,'Final Telegram bot dictionaries');
for(const locale of allLocales)for(const [key,value] of Object.entries(merged[locale]))if(typeof value!=='string'||!value.trim())throw new Error(`Final Telegram bot dictionaries/${locale}: empty value for ${key}`);

const app=read('public/app/app.js');
const i18nCore=read('public/app/i18n-core.js');
const presenter=read('public/app/novel-presenter.js');
const corpus=[i18nCore,runtime,presenter,referrals,onboarding,notifications,quota].join('\n');
const normalizedCorpus=normalizeText(corpus);
const literalHardcoded=['Thank you for supporting novel translations!','Chapter Progress','No requests yet.','No matching requests.','Nothing here.','Complete the novel details.','Add at least one genre or tag.','Describe the sexual content or fetishes.','Request #','Edit','Could not read EPUB structure.','Bad EPUB entry','EPUB compression is not supported on this device.','just now'];
for(const phrase of literalHardcoded){if(!app.includes(phrase))continue;if(!corpus.includes(phrase)&&!normalizedCorpus.includes(normalizeText(phrase)))throw new Error(`Hardcoded Mini App phrase is not covered by centralized localization: ${phrase}`);}
const semanticPatches=[
  ['Dollar TL submission flow','guideSetting:t.guideSub'],
  ['Submission and content rules','rulesSetting:t.rulesSub'],
  ['5 requests/month · no 250-chapter restriction','boostySetting:t.boostySub'],
  ['Telegram bot notifications are enabled for request status updates.','notifications:'],
];
for(const [phrase,evidence] of semanticPatches)if(app.includes(phrase)&&!runtime.includes(evidence))throw new Error(`Hardcoded Mini App phrase has no centralized semantic patch: ${phrase}`);
for(const tag of ['Fantasy','Romance','Adventure','Academy','Isekai','Reincarnation','Magic','Strong MC','Harem','Slice of Life','Time Travel','System','Villainess','Slow Burn'])for(const locale of allLocales)if(!runtimeTags[locale]?.[tag])throw new Error(`Popular tag ${tag}: missing ${locale} label`);

for(const required of ["'/api/app/bootstrap'","'/api/app/language'",'window.__DTL_LOCALE__','dtl:localechange','setCatalog','detectLanguage','languageLabel','registerPatcher','registerResponseHandler'])if(!i18nCore.includes(required))throw new Error(`i18n-core is missing authoritative shared hook: ${required}`);
if(runtime.includes('new MutationObserver'))throw new Error('Centralized i18n catalog must not create its own MutationObserver.');
if(runtime.includes('window.fetch=')||runtime.includes('window.fetch ='))throw new Error('Centralized i18n catalog must register a response handler instead of wrapping fetch.');
for(const required of ['DTL_I18N.setCatalog(catalog)','DTL_I18N.registerPatcher(patch)','DTL_I18N.registerResponseHandler(localizeApiError)'])if(!runtime.includes(required))throw new Error(`Centralized i18n runtime is missing shared registration: ${required}`);
if(presenter.includes('new MutationObserver'))throw new Error('Novel presenter must use the shared runtime scheduler.');
if(!presenter.includes('runtime.registerPatcher'))throw new Error('Novel presenter is not registered with the shared scheduler.');

const index=read('public/app/index.html');
for(const asset of ['/app/i18n-core.js','/app/i18n-runtime-v2.js','/app/novel-presenter.js','/app/language-switch.css'])if(!index.includes(asset))throw new Error(`index.html does not load ${asset}`);
for(const legacy of ['/app/locale-sync.js','/app/i18n-inline-fixes.js','/app/i18n-wizard.js','/app/i18n-complete.js','/app/ui-polish.js','/app/language-display-fix.js'])if(index.includes(legacy))throw new Error(`Legacy localization runtime must not be loaded: ${legacy}`);
for(const removed of ['public/app/i18n-wizard.js','public/app/i18n-complete.js','public/app/ui-polish.js'])if(fs.existsSync(new URL(`../${removed}`,import.meta.url)))throw new Error(`Legacy localization runtime must be removed: ${removed}`);

console.log(`Localization audit passed for ${allLocales.length} locales with one catalog, scheduler and response pipeline.`);
