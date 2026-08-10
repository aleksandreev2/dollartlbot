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
  try{return vm.runInNewContext(`(${source})`,Object.create(null),{timeout:1500});}
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
  for(const locale of expected){if(obj[locale]===undefined)throw new Error(`${label}: missing locale ${locale}`);}
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
    if(missing.length||extra.length){
      throw new Error(`${label}/${locale}: key mismatch${missing.length?`\n  missing: ${missing.join(', ')}`:''}${extra.length?`\n  extra: ${extra.join(', ')}`:''}`);
    }
  }
}
function normalizeText(value){return String(value).normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');}

const complete=read('public/app/i18n-complete.js');
const completeUi=evalObject(between(complete,'const ui = ','\n\n  const rules = '),'i18n-complete ui');
const completeRules=evalObject(between(complete,'const rules = ','\n\n  function locale'),'i18n-complete rules');
assertLocales(completeUi,'i18n-complete ui');assertLocales(completeRules,'i18n-complete rules');
assertSameKeys(completeUi,'i18n-complete ui','ru');assertSameKeys(completeRules,'i18n-complete rules','ru');

const polish=read('public/app/ui-polish.js');
const languageNames=evalObject(between(polish,'const languageNames = ','\n\n  const copy = '),'ui-polish languageNames');
const polishCopy=evalObject(between(polish,'const copy = ','\n\n  const prohibited = '),'ui-polish copy');
assertLocales(languageNames,'ui-polish languageNames',true);assertLocales(polishCopy,'ui-polish copy',true);
assertSameKeys(languageNames,'ui-polish languageNames');assertSameKeys(polishCopy,'ui-polish copy');

const runtime=read('public/app/i18n-runtime-v2.js');
const runtimeCopy=evalObject(between(runtime,'const copy=',';\n\n  const languageLabels='),'i18n-runtime copy');
const runtimeLanguages=evalObject(between(runtime,'const languageLabels=',';\n\n  const tags='),'i18n-runtime language labels');
const runtimeTags=evalObject(between(runtime,'const tags=',';\n\n  const apiErrors='),'i18n-runtime tags');
const runtimeErrors=evalObject(between(runtime,'const apiErrors=',';\n\n  function locale'),'i18n-runtime API errors');
for(const [obj,label] of [[runtimeCopy,'runtime copy'],[runtimeLanguages,'runtime languages'],[runtimeTags,'runtime tags'],[runtimeErrors,'runtime API errors']]){assertExactLocaleSet(obj,label);assertSameKeys(obj,label);}

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
const corpus=[complete,polish,i18nCore,runtime,referrals,onboarding,notifications,quota].join('\n');
const normalizedCorpus=normalizeText(corpus);
const literalHardcoded=['Thank you for supporting novel translations!','Chapter Progress','No requests yet.','No matching requests.','Nothing here.','Complete the novel details.','Add at least one genre or tag.','Describe the sexual content or fetishes.','Request #','Edit','Could not read EPUB structure.','Bad EPUB entry','EPUB compression is not supported on this device.','just now'];
for(const phrase of literalHardcoded){if(!app.includes(phrase))continue;if(!corpus.includes(phrase)&&!normalizedCorpus.includes(normalizeText(phrase)))throw new Error(`Hardcoded Mini App phrase is not covered by localization layers: ${phrase}`);}
const semanticPatches=[
  ['Dollar TL submission flow','guideSetting:t.guideSub'],
  ['Submission and content rules','rulesSetting:t.rulesSub'],
  ['5 requests/month · no 250-chapter restriction','boostySetting:t.boostySub'],
  ['Telegram bot notifications are enabled for request status updates.','patchHardcodedMessages'],
];
for(const [phrase,evidence] of semanticPatches)if(app.includes(phrase)&&!corpus.includes(evidence))throw new Error(`Hardcoded Mini App phrase has no semantic localization patch: ${phrase}`);
for(const tag of ['Fantasy','Romance','Adventure','Academy','Isekai','Reincarnation','Magic','Strong MC','Harem','Slice of Life','Time Travel','System','Villainess','Slow Burn'])for(const locale of allLocales)if(!runtimeTags[locale]?.[tag])throw new Error(`Popular tag ${tag}: missing ${locale} label`);

for(const required of ["'/api/app/bootstrap'","'/api/app/language'",'window.__DTL_LOCALE__','dtl:localechange','patchInlineCopy','registerPatcher','registerResponseHandler'])if(!i18nCore.includes(required))throw new Error(`i18n-core is missing authoritative shared hook: ${required}`);
if(complete.includes('new MutationObserver'))throw new Error('i18n-complete must use the shared i18n scheduler, not create its own MutationObserver.');
if(runtime.includes('new MutationObserver'))throw new Error('i18n runtime must use the shared i18n scheduler, not create its own MutationObserver.');
if(runtime.includes('window.fetch=' )||runtime.includes('window.fetch ='))throw new Error('i18n runtime must register a response handler instead of wrapping fetch.');
for(const required of ['DTL_I18N.registerPatcher(patch)','DTL_I18N.registerResponseHandler(localizeApiError)'])if(!runtime.includes(required))throw new Error(`i18n runtime is missing shared registration: ${required}`);

const index=read('public/app/index.html');
for(const asset of ['/app/i18n-core.js','/app/i18n-complete.js','/app/i18n-runtime-v2.js','/app/language-switch.css'])if(!index.includes(asset))throw new Error(`index.html does not load ${asset}`);
for(const legacy of ['/app/locale-sync.js','/app/i18n-inline-fixes.js','/app/i18n-wizard.js','/app/language-display-fix.js'])if(index.includes(legacy))throw new Error(`Legacy i18n runtime must not be loaded: ${legacy}`);
if(fs.existsSync(new URL('../public/app/i18n-wizard.js',import.meta.url)))throw new Error('Empty legacy i18n-wizard.js must not be reintroduced.');

console.log(`Localization audit passed for ${allLocales.length} locales with one shared Mini App i18n scheduler/fetch pipeline.`);
