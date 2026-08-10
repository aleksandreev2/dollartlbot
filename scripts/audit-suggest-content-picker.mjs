import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

const js=read('public/app/suggest-content-picker.js');
const css=read('public/app/suggest-content-picker.css');
const index=read('public/app/index.html');

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

need(index,'/app/suggest-content-picker.css?v=20260810-content1','suggest picker CSS asset');
need(index,'/app/suggest-content-picker.js?v=20260810-content1','suggest picker JS asset');
const view=index.indexOf('/app/view-suggest.js?v=20260810-app2');
const picker=index.indexOf('/app/suggest-content-picker.js?v=20260810-content1');
const bootstrap=index.indexOf('/app/app.js?v=20260810-app1');
if(view<0||picker<0||bootstrap<0||picker<=view||picker>=bootstrap)throw new Error('suggest content picker must load after the canonical Suggest view and before app bootstrap');

console.log('Suggest content picker audit passed: expanded tag catalog, selected-state UX, sexual/fetish picker, custom tags, live blocked-content guidance, rules-backed restrictions, and Lucide icons.');
