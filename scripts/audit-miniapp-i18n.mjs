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

// Core Mini App localization layers.
const complete=read('public/app/i18n-complete.js');
const completeUi=evalObject(between(complete,'const ui = ','\n\n  const rules = '),'i18n-complete ui');
const completeRules=evalObject(between(complete,'const rules = ','\n\n  function locale'),'i18n-complete rules');
assertLocales(completeUi,'i18n-complete ui');
assertLocales(completeRules,'i18n-complete rules');
assertSameKeys(completeUi,'i18n-complete ui','ru');
assertSameKeys(completeRules,'i18n-complete rules','ru');

const wizard=read('public/app/i18n-wizard.js');
const wizardMaps=evalObject(between(wizard,'const maps=','\n  function locale'),'i18n-wizard maps');
assertLocales(wizardMaps,'i18n-wizard maps');
assertSameKeys(wizardMaps,'i18n-wizard maps','ru');

const polish=read('public/app/ui-polish.js');
const languageNames=evalObject(between(polish,'const languageNames = ','\n\n  const copy = '),'ui-polish languageNames');
const polishCopy=evalObject(between(polish,'const copy = ','\n\n  const prohibited = '),'ui-polish copy');
assertLocales(languageNames,'ui-polish languageNames',true);
assertLocales(polishCopy,'ui-polish copy',true);
assertSameKeys(languageNames,'ui-polish languageNames');
assertSameKeys(polishCopy,'ui-polish copy');

const runtime=read('public/app/i18n-runtime-v2.js');
const runtimeCopy=evalObject(between(runtime,'const copy=',';\n\n  const languageLabels='),'i18n-runtime-v2 copy');
const runtimeLanguages=evalObject(between(runtime,'const languageLabels=',';\n\n  const tags='),'i18n-runtime-v2 language labels');
const runtimeTags=evalObject(between(runtime,'const tags=',';\n\n  const apiErrors='),'i18n-runtime-v2 tags');
const runtimeErrors=evalObject(between(runtime,'const apiErrors=',';\n\n  function locale'),'i18n-runtime-v2 API errors');
for(const [obj,label] of [[runtimeCopy,'runtime copy'],[runtimeLanguages,'runtime languages'],[runtimeTags,'runtime tags'],[runtimeErrors,'runtime API errors']]){
  assertExactLocaleSet(obj,label);assertSameKeys(obj,label);
}

// Independent feature pages must also be complete.
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

// The classic Telegram bot must not silently fall back to English because one
// locale forgot a key.
const base={};
for(const locale of allLocales)base[locale]=evalExportObject(`src/i18n/${locale}.ts`,locale);
assertSameKeys(base,'Telegram bot base dictionaries');

for(const [path,name] of [
  ['src/i18n/features.ts','featureTranslations'],
  ['src/i18n/policy.ts','policyTranslations'],
  ['src/i18n/policy_override.ts','policyOverrideTranslations'],
  ['src/i18n/status_override.ts','statusOverrideTranslations'],
  ['src/i18n/quality_override.ts','qualityOverrideTranslations'],
  ['src/i18n/rules_quality_override.ts','rulesQualityOverrideTranslations'],
  ['src/i18n/interface_polish.ts','interfacePolishTranslations'],
  ['src/i18n/locale_cleanup.ts','localeCleanupTranslations'],
]){
  const obj=evalExportObject(path,name);assertExactLocaleSet(obj,`${path}/${name}`);assertSameKeys(obj,`${path}/${name}`);
}

// Known hardcoded user-facing strings in app.js must have explicit coverage.
const app=read('public/app/app.js');
const corpus=[complete,wizard,polish,read('public/app/i18n-inline-fixes.js'),runtime,referrals,onboarding,notifications,quota].join('\n');
const normalizedCorpus=normalizeText(corpus);
const hardcoded=[
  'Thank you for supporting novel translations!',
  'Chapter Progress','No requests yet.','No matching requests.','Nothing here.',
  'Complete the novel details.','Add at least one genre or tag.','Describe the sexual content or fetishes.',
  'Telegram bot notifications are enabled for request status updates.','Request #','Edit',
  'Dollar TL submission flow','Submission and content rules','5 requests/month · no 250-chapter restriction',
  'Could not read EPUB structure.','Bad EPUB entry','EPUB compression is not supported on this device.','just now'
];
for(const phrase of hardcoded){
  if(!app.includes(phrase))continue;
  if(!corpus.includes(phrase)&&!normalizedCorpus.includes(normalizeText(phrase))){
    throw new Error(`Hardcoded Mini App phrase is not covered by localization layers: ${phrase}`);
  }
}
for(const tag of ['Fantasy','Romance','Adventure','Academy','Isekai','Reincarnation','Magic','Strong MC','Harem','Slice of Life','Time Travel','System','Villainess','Slow Burn']){
  for(const locale of allLocales)if(!runtimeTags[locale]?.[tag])throw new Error(`Popular tag ${tag}: missing ${locale} label`);
}

const localeSync=read('public/app/locale-sync.js');
for(const required of ["'/api/app/bootstrap'","'/api/app/language'",'window.__DTL_LOCALE__','dtl:localechange']){
  if(!localeSync.includes(required))throw new Error(`locale-sync is missing authoritative switching hook: ${required}`);
}
const index=read('public/app/index.html');
for(const asset of ['/app/i18n-runtime-v2.js','/app/language-switch.css'])if(!index.includes(asset))throw new Error(`index.html does not load ${asset}`);

console.log(`Localization audit passed for ${allLocales.length} locales across Mini App, feature pages, API errors and classic bot dictionaries.`);
