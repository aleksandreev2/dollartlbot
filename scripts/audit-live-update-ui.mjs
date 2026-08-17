import fs from 'node:fs';

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const need=(source,needle,label)=>{if(!source.includes(needle))throw new Error(`${label}: missing ${needle}`);};

const css=read('public/app/file-picked-fix.css');
const update=read('public/app/app-update.js');
const suggest=read('public/app/view-suggest.js');
const home=read('public/app/home-v2.js');
const reader=read('public/app/reader-title-ui.js');
const history=read('public/app/title-release-history.js');
const prepare=read('scripts/prepare-vendor.mjs');
const index=read('public/app/index.html');
const manifest=JSON.parse(read('public/app/build.json'));

for(const token of [
  '.file-picked > div:nth-child(2)',
  'text-overflow: ellipsis',
  'white-space: nowrap',
  'min-width: 0',
  '.review-file-name',
]) need(css,token,'uploaded filename CSS');
need(suggest,'review-file-name','review filename clamp');

for(const token of [
  "const BUILD_URL = '/app/build.json'",
  "const SHELL_URL = '/app/index.html'",
  'const CHECK_INTERVAL_MS = 30 * 1000',
  "cache: 'no-store'",
  "response.headers.get('etag')",
  'window.DTL_BUILD_ID',
  "document.addEventListener('visibilitychange'",
  "window.addEventListener('focus'",
  "window.addEventListener('pageshow'",
  "document.addEventListener('dtl:viewchange'",
  "new CustomEvent('dtl:datarefresh'",
  'refreshBootstrap?.(false)',
  'hasUnsavedSuggestWork()',
  'location.replace(',
]) need(update,token,'Mini App update watcher');

for(const token of [
  "crypto.createHash('sha256')",
  "const manifestPath = path.join(appDir, 'build.json')",
  "const BUILD_PARAM = 'dtl_build'",
  'normalizeIndex(',
  'stampIndex(',
  'rewriteLocalAppAssets(',
]) need(prepare,token,'Mini App build fingerprint generator');

for(const [source,label] of [[home,'Home library'],[reader,'Reader title'],[history,'Release history']]) {
  need(source,"document.addEventListener('dtl:datarefresh'",`${label} live data refresh`);
}
need(home,'window.DTL_BUILD_ID','dynamic reader asset cache busting');

if(!/^[a-f0-9]{16}$/.test(String(manifest.build_id||'')))throw new Error('Mini App build manifest has an invalid build_id.');
if(Number(manifest.asset_count||0)<10)throw new Error('Mini App build manifest asset_count is unexpectedly small.');
need(index,`<meta name="dtl-build" content="${manifest.build_id}">`,'built Mini App shell');

const localAssets=[...index.matchAll(/(?:src|href)=["'](\/app\/[^"']+)["']/g)].map(match=>match[1]);
const unstamped=localAssets.filter(asset=>{
  const parsed=new URL(asset,'https://dollartl.invalid');
  return parsed.searchParams.get('dtl_build')!==manifest.build_id;
});
if(unstamped.length)throw new Error(`Mini App shell contains assets without the current build fingerprint: ${unstamped.join(', ')}`);

need(index,'/app/file-picked-fix.css?v=20260810-file2','filename CSS asset');
need(index,'/app/app-update.js?v=20260810-update1','update watcher asset');

console.log(`Live-update UI audit passed for build ${manifest.build_id}: deployed assets are fingerprinted, open sessions self-refresh, and visible reader data revalidates without discarding in-progress Suggest work.`);
