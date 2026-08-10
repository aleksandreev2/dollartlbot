import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

const js=read('public/app/suggest-content-picker.js');
const activation=read('public/app/suggest-content-activation.js');
const css=read('public/app/suggest-content-picker.css');
const index=read('public/app/index.html');
const headers=read('public/_headers');
const wrangler=read('wrangler.jsonc');

for(const token of [
  "const TAG_GROUPS =",
  "const SEXUAL_TAGS =",
  "const BLOCKED_ALIASES =",
  "data-tag-toggle",
  "data-sexual-toggle",
  "sexual_tags",
  "sexual_notes",
  "function renderTagSearch(",
  "function openCatalog(",
  "function openBlocked(",
  "app.i18nTable('rules')",
  "rules.blocked",
  "choice('none','shield-check'",
  "choice('suggestive','eye'",
  "choice('explicit','alert-triangle'",
  "document.addEventListener('dtl:suggest'",
]) need(js,token,'suggest content picker');

for(const bad of [
  "['Villainess'",
  "'Villainess','Slow Burn'",
  "['none','◇'",
  "['suggestive','♢'",
  'new MutationObserver',
  'window.fetch =',
]) forbid(js,bad,'suggest content picker');

for(const token of [
  '.content-chip.selected',
  '.content-choice-grid',
  '.content-choice.active',
  '.blocked-content-button',
  '.blocked-rule-list',
  '.content-picker-sheet',
  '.review-chip-list',
]) need(css,token,'suggest content picker CSS');

for(const token of [
  "app.state.view !== 'suggest'",
  'app.state.wizardStep !== 3',
  ".querySelector('.suggest-content-page')",
  "source: 'activation-fallback'",
  'new MutationObserver(schedule)',
  'viewObserver.observe(app.viewRoot, { childList: true })',
  "document.addEventListener('dtl:viewrender'",
  "document.addEventListener('visibilitychange'",
  "window.addEventListener('pageshow'",
]) need(activation,token,'suggest picker activation');
new Function(activation);

need(index,'/app/suggest-content-picker.css?v=20260810-content3','suggest picker CSS asset');
need(index,'/app/suggest-content-picker.js?v=20260810-content3','suggest picker JS asset');
need(index,'/app/suggest-content-activation.js?v=20260810-content3','suggest activation asset');
const view=index.indexOf('/app/view-suggest.js?v=20260810-app2');
const picker=index.indexOf('/app/suggest-content-picker.js?v=20260810-content3');
const activationIndex=index.indexOf('/app/suggest-content-activation.js?v=20260810-content3');
const bootstrap=index.indexOf('/app/app.js?v=20260810-app1');
if(view<0||picker<0||activationIndex<0||bootstrap<0||picker<=view||activationIndex<=picker||activationIndex>=bootstrap)throw new Error('Suggest picker and local-render activation bridge must load after the canonical Suggest view and before app bootstrap');

need(headers,'/app/\n  Cache-Control: no-store, max-age=0','Mini App document cache policy');
need(headers,'/app/index.html\n  Cache-Control: no-store, max-age=0','Mini App index cache policy');
need(wrangler,'MINI_APP_URL','versioned Mini App URL');
need(wrangler,'?build=20260810-content3','versioned Mini App URL');

console.log('Suggest content picker audit passed: expanded content picker, local wizard-render activation bridge, fresh document URL, and no-store Mini App shell caching.');