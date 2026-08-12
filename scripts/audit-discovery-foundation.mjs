import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const migration=read('migrations/0025_discovery_foundation.sql');
const catalogMigration=read('migrations/0026_discovery_catalog.sql');
const catalogSourcesMigration=read('migrations/0027_discovery_catalog_sources.sql');
const legacyServer=read('src/discovery.ts');
const rawApi=read('src/discovery-raw-v2.ts');
const rawProvider=read('src/raw-fucknovelpia.ts');
const rawCache=read('src/raw-fucknovelpia-cache.ts');
const catalogApi=read('src/discovery-catalog-api.ts');
const novelpia=read('src/novelpia-discovery.ts');
const homepageFresh=read('src/novelpia-homepage-fresh.ts');
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
requireText(legacyServer,'authenticateMiniAppRequest(request, env)','authenticated legacy discovery API');
requireText(legacyServer,"'/api/app/discovery/interest'",'legacy interest endpoint retained');
requireText(index,"import { handleDiscoveryRequest } from './discovery';",'legacy worker route import');
requireText(index,'await handleDiscoveryRequest(request, env)','legacy worker route invocation');
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
  'CREATE TABLE IF NOT EXISTS discovery_catalog_sources',
  "CHECK (verification_status IN ('unknown', 'verified', 'not_found', 'error'))",
  'PRIMARY KEY (catalog_id, provider)',
  'failure_count INTEGER NOT NULL DEFAULT 0',
  'next_check_at TEXT',
  'idx_discovery_catalog_sources_due',
])requireText(catalogSourcesMigration,token,'verified catalog source schema');

for(const token of [
  "url: `${NOVELPIA_ORIGIN}/plus/entry/date?main_genre=`",
  "url: `${NOVELPIA_ORIGIN}/freestory/new/date/1?main_genre=`",
  "url: `${NOVELPIA_ORIGIN}/top100/plus/today/view/all/all?main_genre=`",
  'const MAX_DETAIL_FETCHES = 24',
  'const FETCH_TIMEOUT_MS = 10_000',
  "hostname === 'novelpia.com' || hostname === 'www.novelpia.com'",
  "url.hostname !== 'images.novelpia.com'",
  'runNovelpiaDiscoveryIngestion',
  'novelpia_source_no_explicit_ids',
  'fresh_unlinked_count',
  'active_signal_count',
  'discovery_catalog_interests',
  'linkCatalogToSubmission',
  "user_id <> ?",
])requireText(novelpia,token,'safe NovelPia ingestion pipeline');
const extractorBlock=novelpia.slice(novelpia.indexOf('function extractNovelIds'),novelpia.indexOf('function minSignalRank'));
if(/ori\|thumb\|cover|_\(\\d/.test(extractorBlock)){
  throw new Error('Discovery audit failed: NovelPia candidate extraction must never use cover/image asset IDs');
}
for(const token of ['explicitPatterns','/novel\\/(\\d{2,9})','novel_no|novelNo'])requireText(extractorBlock,token,'explicit NovelPia identity extraction');

for(const token of [
  "const HOMEPAGE_URL = `${NOVELPIA_ORIGIN}/`",
  "const PLUS_NEW_URL = `${NOVELPIA_ORIGIN}/plus/entry/date?main_genre=`",
  "const INGEST_PROVIDER = 'novelpia_homepage_fresh'",
  "const HOMEPAGE_SIGNAL = 'novelpia_home_plus_new'",
  'const MAX_FALLBACK_DETAIL_FETCHES = 20',
  'runNovelpiaHomepageFreshIngestion',
  'getHomepageFreshIngestState',
  'parseHomepageFreshCards',
  "html.indexOf('따끈따끈 신규 작품')",
  "scope.includes('신규 PLUS 작품')",
  'nov-tit',
  'nov-writer',
  'resolveHomepageCardsFromListHtml',
  'detailMatchesCard',
  'catalogMatchesCard',
  'normalizeIdentityText(detail.title) !== normalizeIdentityText(card.title)',
  "event: 'novelpia_homepage_detail_probe_failed'",
  "event: 'novelpia_homepage_detail_failed'",
  "redirect: 'manual'",
  'const MAX_HTML_BYTES = 3_000_000',
  'const MAX_REDIRECTS = 3',
  'readTextLimited',
  "url.protocol !== 'https:' || host !== 'novelpia.com'",
  "source: 'homepage_hot_new'",
  "source: 'official_novelpia_homepage_fresh'",
  'novelpia_homepage_unresolved:',
])requireText(homepageFresh,token,'authoritative NovelPia homepage Fresh source');
const homepageResolverBlock=homepageFresh.slice(
  homepageFresh.indexOf('function resolveHomepageCardsFromListHtml'),
  homepageFresh.indexOf('async function loadCatalogRow'),
);
for(const forbidden of ['_ori','coverId','imageId','assetId','<img','img src']){
  if(homepageResolverBlock.includes(forbidden)){
    throw new Error(`Discovery audit failed: homepage Fresh identity resolver uses forbidden asset identity hint: ${forbidden}`);
  }
}
if(!homepageFresh.includes('card.author && detail.author && normalizeIdentityText(detail.author) !== normalizeIdentityText(card.author)')){
  throw new Error('Discovery audit failed: homepage detail resolution must validate compatible author identity');
}

for(const token of [
  "const FETCH_TIMEOUT_MS = 8_000",
  'const MAX_HTML_BYTES = 2_000_000',
  'const MAX_REDIRECTS = 3',
  "redirect: 'manual'",
  'signal: controller.signal',
  "hostname === 'raw-fucknovelpia.com' || hostname === 'www.raw-fucknovelpia.com'",
  "/^\\/novel\\/(?:raw-[a-z0-9-]+|\\d{2,9})\\/?$/i",
  'readResponseTextLimited',
  'provider_response_too_large',
  'runRawCatalogEnrichment',
  "verification_status = 'error'",
  "verification_status = 'not_found'",
  "verification_status = 'verified'",
  'next_check_at',
  'propagateCatalogRawSourceToSubmission',
])requireText(rawProvider,token,'safe RAW FuckNovelPia provider v2');

for(const token of [
  "const SEARCH_PATH = '/api/app/discovery/search'",
  "const SOURCE_PATH = '/api/app/discovery/source'",
  'authenticateMiniAppRequest(request, env)',
  'searchCachedRawCatalog(env, query, MAX_EXTERNAL_RESULTS)',
  'searchRawFuckNovelpia(query)',
  'provider_source: providerSource',
  "verification_status: inspected ? 'verified' : 'unverified'",
])requireText(rawApi,token,'cache-first RAW discovery API');

for(const token of [
  'cacheRawResultForCatalog',
  "verification_status = 'verified'",
  'propagateCatalogRawSourceToSubmission',
])requireText(rawCache,token,'live RAW result cache helper');

for(const token of [
  "'/api/app/discovery/catalog/search'",
  "'/api/app/discovery/catalog/interest'",
  "'/api/app/discovery/catalog/link'",
  "'/api/app/discovery/catalog/health'",
  "'/api/app/discovery/catalog/refresh'",
  'authenticateMiniAppRequest(request, env)',
  "if (!auth.admin) return miniAppJsonError('forbidden'",
  'ctx.waitUntil(',
  'getHomepageFreshIngestState(env)',
  "homepage_provider: 'novelpia_homepage_fresh'",
  'homepage_state: homepageState',
  'runNovelpiaHomepageFreshIngestion(env, requestedAt)',
  'runNovelpiaDiscoveryIngestion(env, requestedAt)',
  'runRawCatalogEnrichment(env, new Date())',
  "stages: ['novelpia_homepage', 'novelpia', 'raw_fucknovelpia']",
  'getRawIngestState(env)',
  'propagateCatalogRawSourceToSubmission(env, catalogId, submissionId, now)',
])requireText(catalogApi,token,'authenticated discovery catalog API');
const manualHomepage=catalogApi.indexOf('runNovelpiaHomepageFreshIngestion(env, requestedAt)');
const manualRegular=catalogApi.indexOf('runNovelpiaDiscoveryIngestion(env, requestedAt)');
const manualRaw=catalogApi.indexOf('runRawCatalogEnrichment(env, new Date())');
if(manualHomepage<0||manualRegular<0||manualRaw<0||!(manualHomepage<manualRegular&&manualRegular<manualRaw)){
  throw new Error('Discovery audit failed: manual refresh must run homepage Fresh -> NovelPia lists -> RAW');
}

requireText(index,"import { handleDiscoveryRawV2Request } from './discovery-raw-v2';",'RAW v2 API route import');
requireText(index,'await handleDiscoveryRawV2Request(request, env)','RAW v2 API route invocation');
if(index.indexOf('await handleDiscoveryRawV2Request(request, env)')>index.indexOf('await handleDiscoveryRequest(request, env)')){
  throw new Error('Discovery audit failed: RAW v2 search/source handler must shadow legacy discovery handler');
}
requireText(index,"import { runRawCatalogEnrichment } from './raw-fucknovelpia';",'RAW enrichment import');
requireText(index,"import { runNovelpiaHomepageFreshIngestion } from './novelpia-homepage-fresh';",'homepage Fresh import');
requireText(index,"scheduledAt.getUTCMinutes() % 20 === 0",'bounded 20-minute ingestion cadence');
requireText(index,"runScheduledTask('novelpia_homepage_fresh'",'isolated homepage Fresh task');
requireText(index,"runScheduledTask('novelpia_discovery_ingest'",'isolated NovelPia ingestion task');
requireText(index,"runScheduledTask('raw_fucknovelpia_enrichment'",'isolated RAW enrichment task');
const cronHomepage=index.indexOf("runScheduledTask('novelpia_homepage_fresh'");
const cronRegular=index.indexOf("runScheduledTask('novelpia_discovery_ingest'");
const cronRaw=index.indexOf("runScheduledTask('raw_fucknovelpia_enrichment'");
if(cronHomepage<0||cronRegular<0||cronRaw<0||!(cronHomepage<cronRegular&&cronRegular<cronRaw)){
  throw new Error('Discovery audit failed: cron must run homepage Fresh -> NovelPia lists -> RAW');
}
requireText(feed,'fresh_novelpia: freshWithRaw','Fresh NovelPia feed with verified RAW overlay');
requireText(feed,'catalogOpportunityScore','NovelPia opportunity score');
requireText(feed,"out.push('RAW verified')",'verified RAW opportunity signal');
requireText(feed,'raw_ingest: ingestPresentation','RAW ingestion health projection');
requireText(feed,'loadRawCatalogSourceMap','verified RAW source overlay');
requireText(feed,"'feed_catalog_mismatch'",'Fresh catalog/feed mismatch diagnostics');
requireText(feed,"'no_unlinked_fresh'",'legitimate empty Fresh diagnostics');
requireText(feed,"'never_refreshed'",'never-refreshed Fresh diagnostics');

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
  'Refresh sources',
  'patchVerifiedRawLinks',
  "row.raw_verification_status==='verified'&&row.raw_available&&row.raw_page_url",
  'archive-check',
  'patchFreshEmptyState',
  'waitForRefreshCompletion',
  "'/api/app/discovery/catalog/health'",
  "'dtl:discover-refresh-ready'",
])requireText(discoverRuntime,token,'verified RAW Discover runtime');
requireText(discoverCss,'.discover-catalog-row','Fresh catalog responsive row styling');
requireText(html,'/app/discover-page.css?v=20260811-discover2','Fresh Discover CSS cache bust');
requireText(html,'/app/view-discover.js?v=20260811-discover2','Fresh Discover JS cache bust');
requireText(html,'/app/discover-page-runtime.js?v=20260812-discover4','Discover source recovery runtime cache bust');

new Function(discoverView);
new Function(discoverRuntime);
console.log('Discovery foundation + NovelPia homepage Fresh + NovelPia lists + RAW provider v2 audit passed.');
