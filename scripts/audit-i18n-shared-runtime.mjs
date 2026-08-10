import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const core=read('public/app/i18n-core.js');
const runtime=read('public/app/i18n-runtime-v2.js');
const presenter=read('public/app/novel-presenter.js');
const index=read('public/app/index.html');

for(const token of ['setCatalog','detectLanguage','languageLabel','registerPatcher','registerResponseHandler','const patchers = new Set()','const responseHandlers = new Set()','new MutationObserver(schedule)']){
  if(!core.includes(token))throw new Error(`i18n-core missing shared runtime primitive: ${token}`);
}
if((core.match(/new MutationObserver/g)||[]).length!==1)throw new Error('i18n-core must own exactly one MutationObserver.');
if((core.match(/window\.fetch\s*=/g)||[]).length!==1)throw new Error('i18n-core must own exactly one fetch wrapper.');
for(const [name,source] of [['i18n-runtime-v2',runtime],['novel-presenter',presenter]]){
  if(source.includes('new MutationObserver'))throw new Error(`${name} must not create a MutationObserver.`);
  if(/window\.fetch\s*=/.test(source))throw new Error(`${name} must not wrap fetch directly.`);
}
for(const token of ['DTL_I18N.setCatalog(catalog)','DTL_I18N.registerPatcher(patch)','DTL_I18N.registerResponseHandler(localizeApiError)'])if(!runtime.includes(token))throw new Error(`i18n-runtime-v2 missing shared registration: ${token}`);
if(!presenter.includes('runtime.registerPatcher'))throw new Error('novel-presenter is not registered with the shared scheduler.');
for(const legacy of ['/app/i18n-wizard.js','/app/i18n-complete.js','/app/ui-polish.js'])if(index.includes(legacy))throw new Error(`Legacy localization runtime must not be loaded: ${legacy}`);
for(const removed of ['public/app/i18n-wizard.js','public/app/i18n-complete.js','public/app/ui-polish.js'])if(fs.existsSync(new URL(`../${removed}`,import.meta.url)))throw new Error(`Legacy localization runtime must be removed: ${removed}`);

const order=['/app/i18n-core.js','/app/i18n-runtime-v2.js','/app/novel-presenter.js','/app/app.js'];
let previous=-1;
for(const asset of order){const at=index.indexOf(asset);if(at<0)throw new Error(`Missing runtime asset: ${asset}`);if(at<=previous)throw new Error(`Runtime asset order is invalid around ${asset}`);previous=at;}

console.log('Shared Mini App runtime audit passed: one observer, one fetch wrapper, one localization catalog, deterministic load order.');
