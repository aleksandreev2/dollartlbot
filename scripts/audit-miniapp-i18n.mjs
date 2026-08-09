import fs from 'node:fs';
import vm from 'node:vm';

const locales=['ru','es','fil','hi','pt','id','vi','fr','de'];

function read(path){return fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');}
function between(source,start,end){
  const a=source.indexOf(start);if(a<0)throw new Error(`Missing marker: ${start}`);
  const b=source.indexOf(end,a+start.length);if(b<0)throw new Error(`Missing end marker: ${end}`);
  return source.slice(a+start.length,b).trim().replace(/;$/,'');
}
function evalObject(source,label){
  try{return vm.runInNewContext(`(${source})`,Object.create(null),{timeout:1000});}
  catch(error){throw new Error(`Could not parse ${label}: ${error.message}`);}
}
function assertLocales(obj,label,includeEnglish=false){
  const expected=includeEnglish?['en',...locales]:locales;
  for(const locale of expected){if(!obj[locale])throw new Error(`${label}: missing locale ${locale}`);}
}
function assertSameKeys(obj,label,reference){
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
const polishCopy=evalObject(between(polish,'const copy = ','\n  const genericBlocked'),'ui-polish copy');
assertLocales(languageNames,'ui-polish languageNames',true);
assertLocales(polishCopy,'ui-polish copy',true);
assertSameKeys(languageNames,'ui-polish languageNames','en');
assertSameKeys(polishCopy,'ui-polish copy','en');

const app=read('public/app/app.js');
const dangerous=[
  'Thank you for supporting novel translations!',
  'Chapter Progress',
  'No requests yet.',
  'No matching requests.',
  'Complete the novel details.',
  'Add at least one genre or tag.',
  'Describe the sexual content or fetishes.',
  'Telegram bot notifications are enabled for request status updates.',
  'Request #',
  'Nothing here.'
];
const localizationCorpus=[complete,wizard,polish,read('public/app/i18n-inline-fixes.js')].join('\n');
for(const phrase of dangerous){
  if(app.includes(phrase)&&!localizationCorpus.includes(phrase)){
    throw new Error(`Hardcoded Mini App phrase is not covered by localization layers: ${phrase}`);
  }
}

console.log(`Mini App i18n audit passed for ${locales.length+1} locales.`);
