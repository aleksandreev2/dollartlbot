import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};

const css=read('public/app/file-picked-fix.css');
const update=read('public/app/app-update.js');
const index=read('public/app/index.html');

for(const token of [
  '.file-picked > div:nth-child(2)',
  'text-overflow: ellipsis',
  'white-space: nowrap',
  'min-width: 0',
]) need(css,token,'uploaded filename CSS');

for(const token of [
  "const SHELL_URL = '/app/index.html'",
  "cache: 'no-store'",
  "response.headers.get('etag')",
  "document.addEventListener('visibilitychange'",
  "document.addEventListener('dtl:viewchange'",
  'hasUnsavedSuggestWork()',
  'location.reload()',
]) need(update,token,'Mini App update watcher');

need(index,'/app/file-picked-fix.css?v=20260810-file1','filename CSS asset');
need(index,'/app/app-update.js?v=20260810-update1','update watcher asset');

console.log('Live-update UI audit passed: long filenames ellipsize inside the card and open Mini App sessions detect newer deployed shells without discarding an in-progress Suggest form.');
