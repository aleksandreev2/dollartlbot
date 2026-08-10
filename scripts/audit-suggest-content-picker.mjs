import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const exists=(path)=>fs.existsSync(new URL(`../${path}`,import.meta.url));
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};
const forbid=(source,needle,label)=>{if(source.includes(needle))throw new Error(`${label}: forbidden ${needle}`);};

const js=read('public/app/suggest-content-picker.js');
const api=read('public/app/suggest-content-api.js');
const view=read('public/app/view-suggest.js');
const css=read('public/app/suggest-content-picker.css');
const wizardCss=read('public/app/file-picked-fix.css');
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
  'window.DTL_SUGGEST_CONTENT = Object.freeze({ render })',
  "source: 'canonical-content-api'",
  "event.stopImmediatePropagation()",
  ".querySelector('.suggest-content-page')",
]) need(api,token,'canonical Suggest content API');
new Function(api);

for(const token of [
  'function renderCanonicalContent()',
  'window.DTL_SUGGEST_CONTENT',
  'if(state.wizardStep===3)return renderCanonicalContent()',
  "ico('upload')",
  "ico('lock')",
  "ico('languages')",
  "ico('book-open')",
  "ico('shield')",
  "ico('send')",
]) need(view,token,'canonical Suggest view');

for(const bad of [
  'function renderContentStep()',
  'data-add-tag',
  'data-remove-tag',
  "['none','◇'",
  "['suggestive','♢'",
  '⇧',
  '◇',
  '✦',
  '▤',
  '🌐',
  '▱',
  '▣',
]) forbid(view,bad,'legacy Suggest view');

for(const token of [
  '.suggest-wizard-page .upload-illustration svg',
  '.suggest-inline-note',
  '.review-file-name',
  '@media (max-width: 460px)',
]) need(wizardCss,token,'Suggest wizard polish CSS');

if(exists('public/app/suggest-content-activation.js'))throw new Error('Temporary Suggest activation bridge must be removed.');
need(index,'/app/file-picked-fix.css?v=20260810-file2','Suggest wizard polish asset');
need(index,'/app/suggest-content-picker.css?v=20260810-content4','Suggest picker CSS asset');
need(index,'/app/view-suggest.js?v=20260810-app4','canonical Suggest view asset');
need(index,'/app/suggest-content-picker.js?v=20260810-content4','Suggest picker JS asset');
need(index,'/app/suggest-content-api.js?v=20260810-content4','canonical Suggest content API asset');
forbid(index,'suggest-content-activation.js','legacy Suggest activation asset');

const viewIndex=index.indexOf('/app/view-suggest.js?v=20260810-app4');
const pickerIndex=index.indexOf('/app/suggest-content-picker.js?v=20260810-content4');
const apiIndex=index.indexOf('/app/suggest-content-api.js?v=20260810-content4');
const bootstrap=index.indexOf('/app/app.js?v=20260810-app1');
if(viewIndex<0||pickerIndex<0||apiIndex<0||bootstrap<0||pickerIndex<=viewIndex||apiIndex<=pickerIndex||apiIndex>=bootstrap)throw new Error('Canonical Suggest picker/API must load after the Suggest view and before app bootstrap.');

need(headers,'/app/\n  Cache-Control: no-store, max-age=0','Mini App document cache policy');
need(headers,'/app/index.html\n  Cache-Control: no-store, max-age=0','Mini App index cache policy');
need(wrangler,'MINI_APP_URL','versioned Mini App URL');
if(!/\/app\/\?build=[A-Za-z0-9._-]+/.test(wrangler))throw new Error('Mini App URL must retain a non-empty build query for Telegram WebView freshness.');

console.log('Suggest content picker audit passed: one canonical step-3 renderer, no temporary DOM activation bridge, Lucide wizard icons, mobile polish, and fresh Mini App assets.');
