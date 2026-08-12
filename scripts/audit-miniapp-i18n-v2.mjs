import fs from 'node:fs';
import ts from 'typescript';

const legacyLocales=['en','ru','es','fil','hi','pt','id','vi','fr','de'];
const allLocales=[...legacyLocales,'ur'];
const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

function parse(path){
  const source=read(path);
  return {source,file:ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,path.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS)};
}
function nameText(name){
  if(!name)return null;
  if(ts.isIdentifier(name)||ts.isPrivateIdentifier(name))return name.text;
  if(ts.isStringLiteral(name)||ts.isNumericLiteral(name)||ts.isNoSubstitutionTemplateLiteral(name))return name.text;
  return null;
}
function unwrapExpression(node){
  let current=node;
  while(current){
    if(ts.isParenthesizedExpression(current)||ts.isAsExpression(current)||ts.isTypeAssertionExpression(current)||ts.isSatisfiesExpression(current)){
      current=current.expression;
      continue;
    }
    return current;
  }
  return current;
}
function objectLiteral(node){
  const value=unwrapExpression(node);
  return value&&ts.isObjectLiteralExpression(value)?value:null;
}
function objectKeys(node){
  node=objectLiteral(node);
  if(!node)return [];
  return node.properties.flatMap(prop=>{
    if(ts.isSpreadAssignment(prop))return [];
    const name=nameText(prop.name);
    return name===null?[]:[name];
  });
}
function objectProperty(node,key){
  node=objectLiteral(node);
  if(!node)return null;
  for(const prop of node.properties){
    if(ts.isPropertyAssignment(prop)||ts.isShorthandPropertyAssignment(prop)||ts.isMethodDeclaration(prop)){
      if(nameText(prop.name)===key)return ts.isPropertyAssignment(prop)?prop.initializer:prop;
    }
  }
  return null;
}
function variableObject(path,name){
  const {file}=parse(path);
  let found=null;
  const visit=node=>{
    if(found)return;
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text===name&&node.initializer){
      const value=objectLiteral(node.initializer);
      if(value)found=value;
    }
    ts.forEachChild(node,visit);
  };
  visit(file);
  if(!found)throw new Error(`${path}: object variable ${name} not found`);
  return found;
}
function exportedObject(path,name){
  const {file}=parse(path);
  let found=null;
  const visit=node=>{
    if(found)return;
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text===name&&node.initializer){
      const value=objectLiteral(node.initializer);
      if(value)found=value;
    }
    ts.forEachChild(node,visit);
  };
  visit(file);
  if(!found)throw new Error(`${path}: exported object ${name} not found`);
  return found;
}
function localeObjects(path,name){
  const root=variableObject(path,name);
  const out={};
  for(const locale of objectKeys(root)){
    const value=objectLiteral(objectProperty(root,locale));
    if(value)out[locale]=value;
  }
  return out;
}
function assertExactLocales(map,label,expected=legacyLocales){
  const actual=Object.keys(map).sort(),wanted=[...expected].sort();
  const missing=wanted.filter(x=>!actual.includes(x)),extra=actual.filter(x=>!wanted.includes(x));
  if(missing.length||extra.length)throw new Error(`${label}: locale mismatch; missing=${missing.join(',')} extra=${extra.join(',')}`);
}
function assertObjectKeys(node,label,expected){
  const actual=objectKeys(node).sort(),wanted=[...expected].sort();
  const missing=wanted.filter(x=>!actual.includes(x)),extra=actual.filter(x=>!wanted.includes(x));
  if(missing.length||extra.length)throw new Error(`${label}: key mismatch; missing=${missing.join(',')} extra=${extra.join(',')}`);
}
function assertSameKeys(map,label,reference='en'){
  const ref=objectKeys(map[reference]).sort();
  for(const [locale,obj] of Object.entries(map)){
    const keys=objectKeys(obj).sort();
    const missing=ref.filter(k=>!keys.includes(k)),extra=keys.filter(k=>!ref.includes(k));
    if(missing.length||extra.length)throw new Error(`${label}/${locale}: key mismatch; missing=${missing.join(',')} extra=${extra.join(',')}`);
  }
}
function childObject(root,key,label){
  const value=objectLiteral(objectProperty(root,key));
  if(!value)throw new Error(`${label}: object ${key} not found`);
  return value;
}
function explicitKeys(path,name){return new Set(objectKeys(exportedObject(path,name)));}

// Legacy Mini App catalog remains unchanged for the original ten locales.
const runtimePath='public/app/i18n-runtime-v2.js';
for(const name of ['languageLabels','tags','copy','guide','rules','apiErrors']){
  const map=localeObjects(runtimePath,name);assertExactLocales(map,`runtime ${name}`);assertSameKeys(map,`runtime ${name}`);
}
const runtimeUi=localeObjects(runtimePath,'uiFallback');
for(const locale of legacyLocales.filter(x=>x!=='en'))if(!runtimeUi[locale])throw new Error(`runtime uiFallback: missing ${locale}`);
const requiredCopy=['thanks','regular','guideSub','rulesSub','chatSub','boostySub','progress','noRequests','noMatching','edit','reader','justNow','minAgo','hourAgo','dayAgo','epubRead','epubEntry','epubCompression','completeDetails','addTag','describeSex','notifications'];
const runtimeCopy=localeObjects(runtimePath,'copy');
for(const locale of legacyLocales){const keys=new Set(objectKeys(runtimeCopy[locale]));for(const key of requiredCopy)if(!keys.has(key))throw new Error(`runtime copy/${locale}: missing ${key}`);}

// Urdu Mini App extension is one additive catalog, not ten duplicated historical files.
const urduPath='public/app/i18n-urdu.js';
const urLanguage=variableObject(urduPath,'urLanguageLabels');
const urTags=variableObject(urduPath,'urTags');
const urCopy=variableObject(urduPath,'urCopy');
const urGuide=variableObject(urduPath,'urGuide');
const urRules=variableObject(urduPath,'urRules');
const urUi=variableObject(urduPath,'urUi');
const urErrors=variableObject(urduPath,'urApiErrors');
const enLanguages=objectKeys(localeObjects(runtimePath,'languageLabels').en);
for(const key of [...enLanguages,'ur'])if(!objectKeys(urLanguage).includes(key))throw new Error(`Urdu language labels: missing ${key}`);
for(const key of objectKeys(localeObjects(runtimePath,'tags').en))if(!objectKeys(urTags).includes(key))throw new Error(`Urdu tags: missing ${key}`);
for(const key of requiredCopy)if(!objectKeys(urCopy).includes(key))throw new Error(`Urdu shared copy: missing ${key}`);
for(const key of objectKeys(localeObjects(runtimePath,'apiErrors').en))if(!objectKeys(urErrors).includes(key))throw new Error(`Urdu API errors: missing ${key}`);
for(const key of ['Account','Language','Help / Guide','Rules','Open Telegram Chat','Boosty Subscription','Pending','In Queue','In Progress','Completed','Rejected','Confirm','Cancel','Save','Try Again'])if(!objectKeys(urUi).includes(key))throw new Error(`Urdu UI fallback: missing ${key}`);
for(const [obj,label] of [[urGuide,'guide'],[urRules,'rules']])if(!obj)throw new Error(`Urdu ${label}: missing`);
const urduSource=read(urduPath);
for(const required of ['window.DTL_LOCALE_EXTENSIONS=',"languagePatterns:{ur:","languageLabels:{ur:urLanguageLabels}","tags:{ur:urTags}","copy:{ur:urCopy}","guide:{ur:urGuide}","rules:{ur:urRules}","uiFallback:{ur:urUi}","apiErrors:{ur:urApiErrors}",'runtime?.registerPatcher?.(patchUrdu)','runtime?.registerResponseHandler?.(localizeUrduError)'])need(urduSource,required,'Urdu Mini App extension');
forbid(urduSource,'new MutationObserver','Urdu Mini App extension');
forbid(urduSource,'window.fetch=','Urdu Mini App extension');

// Final Telegram dictionary: every English key across all historical layers must be explicitly translated in Urdu.
const englishKeys=new Set(objectKeys(exportedObject('src/i18n/en.ts','en')));
for(const [path,name] of [
  ['src/i18n/features.ts','featureTranslations'],['src/i18n/policy.ts','policyTranslations'],['src/i18n/policy_override.ts','policyOverrideTranslations'],['src/i18n/status_override.ts','statusOverrideTranslations'],['src/i18n/quality_override.ts','qualityOverrideTranslations'],['src/i18n/rules_quality_override.ts','rulesQualityOverrideTranslations'],['src/i18n/interface_polish.ts','interfacePolishTranslations'],['src/i18n/locale_cleanup.ts','localeCleanupTranslations'],['src/i18n/access_gate.ts','accessGateTranslations'],
]){
  const root=exportedObject(path,name);
  const en=childObject(root,'en',`${path}/${name}`);
  for(const key of objectKeys(en))englishKeys.add(key);
  const locales=objectKeys(root).filter(key=>Boolean(objectLiteral(objectProperty(root,key))));
  const missing=legacyLocales.filter(locale=>!locales.includes(locale));
  if(missing.length)throw new Error(`${path}/${name}: legacy locales missing ${missing.join(',')}`);
}
const urRoot=exportedObject('src/i18n/ur.ts','ur');
const urExplicit=new Set(objectKeys(urRoot));
const untranslated=[...englishKeys].filter(key=>!urExplicit.has(key)).sort();
if(untranslated.length)throw new Error(`Urdu Telegram dictionary still falls back to English for: ${untranslated.join(',')}`);
for(const key of ['accessRequiredTitle','accessRequiredText','accessJoinButton','accessRetryButton','accessGranted','accessCheckUnavailableTitle','accessCheckUnavailableText','accessRestrictedTitle','accessRestrictedText'])if(!urExplicit.has(key))throw new Error(`Access gate/ur: missing ${key}`);

// Locale typed entry points and standalone user-facing lifecycle copy must know Urdu.
const types=read('src/i18n/types.ts');
need(types,"{ code: 'ur', label: '🇵🇰 اردو' }",'supported languages');
const index=read('src/i18n/index.ts');
need(index,"import { ur } from './ur'",'backend i18n index');need(index,'ur: { ...ur }','backend i18n index');
const ui=read('src/ui.ts');need(ui,"ur: 'ur-PK'",'Telegram Intl locale');need(ui,"ur: '📱 Dollar TL کھولیں'",'Telegram Mini App button');
const referrals=read('src/referrals.ts');
for(const needle of ["ur: { earned:","ur:'ریفرل بونس اپ ڈیٹ ہو گیا'","ur: {\n    title: '🎁 آپ کو Dollar TL میں مدعو کیا گیا ہے'"])need(referrals,needle,'src/referrals.ts');

const notificationCopy=localeObjects('src/notifications.ts','REQUEST_COPY');
assertExactLocales(notificationCopy,'notification request lifecycle',allLocales);assertSameKeys(notificationCopy,'notification request lifecycle');
const notificationTitles=Object.fromEntries(Object.entries(notificationCopy).map(([locale,obj])=>[locale,childObject(obj,'titles',`notification request lifecycle/${locale}`)]));
assertSameKeys(notificationTitles,'notification request lifecycle titles');
assertObjectKeys(variableObject('src/notifications.ts','OPEN_LABEL'),'notification open labels',allLocales);
assertObjectKeys(variableObject('src/notifications.ts','RELEASE_TITLE'),'notification release titles',allLocales);

const followCopy=localeObjects('src/title-following.ts','COPY');
assertExactLocales(followCopy,'following lifecycle',allLocales);assertSameKeys(followCopy,'following lifecycle');

// Product Analytics is now genuinely localized for all eleven locales.
const analyticsMap=localeObjects('public/app/admin-product-analytics.js','COPY');
assertExactLocales(analyticsMap,'Product Analytics copy',allLocales);assertSameKeys(analyticsMap,'Product Analytics copy');
const analyticsSource=read('public/app/admin-product-analytics.js');need(analyticsSource,"ur:'ur-PK'",'Product Analytics Urdu Intl locale');need(analyticsSource,"document.addEventListener('dtl:localechange'",'Product Analytics locale rerender');

// Central runtime owns locale direction. Urdu extension owns no extra observers/fetch wrappers. Admin remains LTR.
const core=read('public/app/i18n-core.js');
for(const required of ["'en','es','fil','hi','pt','id','vi','fr','de','ru','ur'",'mergeLocaleExtensions',"document.documentElement.dir = next === 'ur' ? 'rtl' : 'ltr'",'registerPatcher','registerResponseHandler'])need(core,required,'i18n core');
const rtl=read('public/app/rtl.css');for(const required of ['html[dir="rtl"] body','html[dir="rtl"] input','html[dir="rtl"] .bottom-nav','html[dir="rtl"] .admin-v2','direction:ltr'])need(rtl,required,'Urdu RTL CSS');

const html=read('public/app/index.html');
for(const asset of ['/app/i18n-core.js?v=20260812-urdu1','/app/i18n-urdu.js?v=20260812-urdu1','/app/i18n-runtime-v2.js','/app/view-i18n.js?v=20260810-app2&urdu=20260812a','/app/rtl.css?v=20260812-urdu1','/app/admin-product-analytics.js?v=20260812-analytics1&urdu=20260812a'])need(html,asset,'index localization assets');
if(html.indexOf('/app/i18n-urdu.js')>html.indexOf('/app/i18n-runtime-v2.js'))throw new Error('Urdu extension must load before the legacy catalog is registered');
if(html.indexOf('/app/view-i18n.js')>html.indexOf('/app/view-home.js'))throw new Error('view-i18n must load before view modules');

console.log(`AST localization audit passed for ${allLocales.length} locales, including explicit Urdu backend coverage, RTL, lifecycle copy and Product Analytics.`);
