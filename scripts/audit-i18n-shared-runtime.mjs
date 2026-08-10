import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const core=read('public/app/i18n-core.js');
const complete=read('public/app/i18n-complete.js');
const runtime=read('public/app/i18n-runtime-v2.js');
const index=read('public/app/index.html');

for(const token of ['registerPatcher','registerResponseHandler','const patchers = new Set()','const responseHandlers = new Set()','new MutationObserver(schedule)']){
  if(!core.includes(token))throw new Error(`i18n-core missing shared runtime primitive: ${token}`);
}
if((core.match(/new MutationObserver/g)||[]).length!==1)throw new Error('i18n-core must own exactly one MutationObserver.');
for(const [name,source] of [['i18n-complete',complete],['i18n-runtime-v2',runtime]]){
  if(source.includes('new MutationObserver'))throw new Error(`${name} must not create a MutationObserver.`);
}
if(runtime.includes('window.fetch=')||runtime.includes('window.fetch ='))throw new Error('i18n-runtime-v2 must not wrap fetch directly.');
if(!complete.includes('DTL_I18N.registerPatcher(patch)'))throw new Error('i18n-complete is not registered with shared scheduler.');
if(!runtime.includes('DTL_I18N.registerPatcher(patch)'))throw new Error('i18n-runtime-v2 is not registered with shared scheduler.');
if(!runtime.includes('DTL_I18N.registerResponseHandler(localizeApiError)'))throw new Error('i18n-runtime-v2 is not registered with shared response pipeline.');
if(index.includes('/app/i18n-wizard.js'))throw new Error('Empty i18n-wizard.js must not be loaded.');
if(fs.existsSync(new URL('../public/app/i18n-wizard.js',import.meta.url)))throw new Error('Empty i18n-wizard.js must be removed.');
console.log('Shared i18n runtime audit passed.');
