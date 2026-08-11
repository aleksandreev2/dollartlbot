import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0025_discovery_foundation.sql');
const catalogMigration=read('migrations/0026_discovery_catalog.sql');
const server=read('src/discovery.ts');
const catalogApi=read('src/discovery-catalog-api.ts');
const novelpia=read('src/novelpia-discovery.ts');
const feed=read('src/discovery-feed.ts');
const index=read('src/index.ts');
const html=read('public/app/index.html');
const ui=read('public/app/discovery-ui.js');
const discoverView=read('public/app/view-discover.js');
const discoverRuntime=read('public/app/discover-page-runtime.js');
const discoverCss=read('public/app/discover-page.css');
const suggest=read('public/app/view-suggest.js');
const bot=read('scripts/configure-bot.mjs');

const requireText=(source,needle,label)=>{
  if(!source.includes(needle))throw new Error(`Discovery audit failed: ${label}: missing ${needle}`);
};

requireText(migration,'CREATE TABLE IF NOT EXISTS discovery_interests','interest table');
requireText(migration,'PRIMARY KEY (submission_id, user_id)','interest dedupe');
requireText(migration,'CREATE TABLE IF NOT EXISTS submission_external_sources','generic external source table');
requireText(migration,'UNIQUE(submission_id, provider)','one provider link per submission');
requireText(server,'authenticateMiniAppRequest(request, env)','authenticated discovery API');
requireText(server,"body.provider !== 'raw_fucknovelpia'",'provider allowlist');
requireText(server,"hostname === 'raw-fucknovelpia.com'",'RAW host allowlist');
requireText(server,"/^\\/novel\\/raw-[a-z0-9-]+$/i",'RAW page allowlist');
requireText(server,"'/api/app/discovery/search'",'search endpoint');
requireText(server,"'/api/app/discovery/interest'",'interest endpoint');
requireText(server,"'/api/app/discovery/source'",'source endpoint');
requireText(index,"import { handleDiscoveryRequest } from './discovery';",'worker route import');
requireText(index,'await handleDiscoveryRequest(request, env)','worker route invocation');
requireText(html,'/app/discovery-ui.css?v=20260811-discovery1','discovery CSS asset');
requireText(html,'/app/discovery-ui.js?v=20260811-discovery1','discovery JS asset');
if(html.indexOf('/app/discovery-ui.js?v=20260811-discovery1')>html.indexOf('/app/view-suggest.js?v=20260810-app4&discover=20260811a')){
  throw new Error('Discovery audit failed: discovery UI must load before Suggest view');
}
requireText(suggest,'discovery?.renderFinder?.()','finder mounted in Suggest');
requireText(suggest,'discovery?.bindFinder?.()','finder lifecycle bound in Suggest');
requireText(suggest,'persistSelectedSource?.(data.submission_id)','external source linked after successful submission');
requireText(ui,"'/api/app/discovery/interest'",'demand action wired to discovery API');
requireText(ui,"'/api/app/discovery/source'",'source persistence wired to discovery API');
requireText(bot,"await api('setChatMenuButton'",'Telegram chat menu Mini App button');
requireText(bot,'Configure Mini App → Enable Mini App','BotFather Main Mini App guidance');
requireText(bot,'?startapp','Main Mini App direct link guidance');

for(const token of [
  'CREATE TABLE IF NOT EXISTS discovery_catalog',
  'UNIQUE(provider, external_id)',
  'CREATE TABLE IF NOT EXISTS discovery_catalog_signals',
  'PRIMARY KEY (catalog_id, signal)',
  'CREATE TABLE IF NOT EXISTS discovery_catalog_interests',
  'PRIMARY KEY (catalog_id, user_id)',
  'CREATE TABLE IF NOT EXISTS discovery_ingest_state',
])requireText(catalogMigration,token,'external discovery catalog schema');

for(const token of [
  "url: `${NOVELPIA_ORIGIN}/plus/entry/date?main_genre=`",
  "url: `${NOVELPIA_ORIGIN}/freestory/new/date/1?main_genre=`",
  "url: `${NOVELPIA_ORIGIN}/top100/plus/today/view/all/all?main_genre=`",
  'const MAX_DETAIL_FETCHES = 24',
  'const FETCH_TIMEOUT_MS = 10_000',
  "hostname === 'novelpia.com' || hostname === 'www.novelpia.com'",
  "url.hostname !== 'images.novelpia.com'",
  'runNovelpiaDiscoveryIngestion',
  'discovery_catalog_interests',
  'linkCatalogToSubmission',
  "user_id <> ?",
])requireText(novelpia,token,'safe NovelPia ingestion pipeline');

for(const token of [
  "'/api/app/discovery/catalog/search'",
  "'/api/app/discovery/catalog/interest'",
  "'/api/app/discovery/catalog/link'",
  "'/api/app/discovery/catalog/health'",
  "'/api/app/discovery/catalog/refresh'",
  'authenticateMiniAppRequest(request, env)',
  "if (!auth.admin) return miniAppJsonError('forbidden'",
  'ctx.waitUntil(',
  'runNovelpiaDiscoveryIngestion(env, requestedAt)',
])requireText(catalogApi,token,'authenticated discovery catalog API');

requireText(index,"import { handleDiscoveryCatalogRequest } from './discovery-catalog-api';",'catalog API route import');
requireText(index,'await handleDiscoveryCatalogRequest(request, env, ctx)','catalog API route invocation with background context');
requireText(index,"import { runNovelpiaDiscoveryIngestion } from './novelpia-discovery';",'ingestion import');
requireText(index,"scheduledAt.getUTCMinutes() % 20 === 0",'bounded 20-minute ingestion cadence');
requireText(index,"runScheduledTask('novelpia_discovery_ingest'",'isolated scheduled ingestion task');
requireText(feed,'fresh_novelpia: freshNovelpia','Fresh NovelPia feed section');
requireText(feed,'catalogOpportunityScore','NovelPia opportunity score');
requireText(feed,'novelpia_ingest: ingestPresentation','ingestion health projection');

for(const token of [
  "['fresh_novelpia','telescope',tx('fresh')]",
  '/api/app/discovery/catalog/search',
  "'/api/app/discovery/catalog/interest'",
  'data-catalog-request',
  'data-catalog-interest',
  "mode='fresh_novelpia'",
  'Fresh from NovelPia',
])requireText(discoverView,token,'Fresh NovelPia Discover UI');
for(const token of [
  'discover-manual-refresh',
  "'/api/app/discovery/catalog/refresh'",
  'Refresh NovelPia',
])requireText(discoverRuntime,token,'admin NovelPia refresh control');
requireText(discoverCss,'.discover-catalog-row','Fresh catalog responsive row styling');
requireText(html,'/app/discover-page.css?v=20260811-discover2','Fresh Discover CSS cache bust');
requireText(html,'/app/view-discover.js?v=20260811-discover2','Fresh Discover JS cache bust');
requireText(html,'/app/discover-page-runtime.js?v=20260811-discover2','Fresh runtime cache bust');

new Function(discoverView);
new Function(discoverRuntime);
console.log('Discovery foundation + automatic NovelPia ingestion audit passed.');
