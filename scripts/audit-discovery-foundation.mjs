import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const files={
  migration:read('migrations/0025_discovery_foundation.sql'),
  catalogMigration:read('migrations/0026_discovery_catalog.sql'),
  catalogSourcesMigration:read('migrations/0027_discovery_catalog_sources.sql'),
  legacy:read('src/discovery.ts'),
  rawApi:read('src/discovery-raw-v2.ts'),
  rawProvider:read('src/raw-fucknovelpia.ts'),
  rawCache:read('src/raw-fucknovelpia-cache.ts'),
  catalogApi:read('src/discovery-catalog-api.ts'),
  novelpia:read('src/novelpia-discovery.ts'),
  homepage:read('src/novelpia-homepage-fresh.ts'),
  feed:read('src/discovery-feed.ts'),
  index:read('src/index.ts'),
  html:read('public/app/index.html'),
  discoveryUi:read('public/app/discovery-ui.js'),
  discoverView:read('public/app/view-discover.js'),
  discoverRuntime:read('public/app/discover-page-runtime.js'),
  discoverCss:read('public/app/discover-page.css'),
  suggest:read('public/app/view-suggest.js'),
  bot:read('scripts/configure-bot.mjs'),
};

function need(source,tokens,label){
  for(const token of tokens){
    if(!source.includes(token))throw new Error(`Discovery audit failed: ${label}: missing ${token}`);
  }
}
function ordered(source,tokens,label){
  let cursor=-1;
  for(const token of tokens){
    const at=source.indexOf(token,cursor+1);
    if(at<0||at<cursor)throw new Error(`Discovery audit failed: ${label}: expected ordered token ${token}`);
    cursor=at;
  }
}

need(files.migration,[
  'CREATE TABLE IF NOT EXISTS discovery_interests',
  'PRIMARY KEY (submission_id, user_id)',
  'CREATE TABLE IF NOT EXISTS submission_external_sources',
  'UNIQUE(submission_id, provider)',
],'discovery foundation schema');
need(files.catalogMigration,[
  'CREATE TABLE IF NOT EXISTS discovery_catalog',
  'UNIQUE(provider, external_id)',
  'CREATE TABLE IF NOT EXISTS discovery_catalog_signals',
  'PRIMARY KEY (catalog_id, signal)',
  'CREATE TABLE IF NOT EXISTS discovery_catalog_interests',
  'PRIMARY KEY (catalog_id, user_id)',
  'CREATE TABLE IF NOT EXISTS discovery_ingest_state',
],'catalog schema');
need(files.catalogSourcesMigration,[
  'CREATE TABLE IF NOT EXISTS discovery_catalog_sources',
  "CHECK (verification_status IN ('unknown', 'verified', 'not_found', 'error'))",
  'PRIMARY KEY (catalog_id, provider)',
  'failure_count INTEGER NOT NULL DEFAULT 0',
  'next_check_at TEXT',
  'idx_discovery_catalog_sources_due',
],'catalog source schema');

need(files.legacy,[
  'authenticateMiniAppRequest(request, env)',
  "'/api/app/discovery/interest'",
],'legacy discovery API');
need(files.suggest,[
  'discovery?.renderFinder?.()',
  'discovery?.bindFinder?.()',
  'persistSelectedSource?.(data.submission_id)',
],'Suggest discovery integration');
need(files.discoveryUi,[
  "'/api/app/discovery/interest'",
  "'/api/app/discovery/source'",
],'discovery UI API wiring');
need(files.bot,[
  "await api('setChatMenuButton'",
  'Configure Mini App → Enable Mini App',
  '?startapp',
],'Telegram Mini App wiring');

need(files.novelpia,[
  "url: `${NOVELPIA_ORIGIN}/plus/entry/date?main_genre=`",
  "url: `${NOVELPIA_ORIGIN}/freestory/new/date/1?main_genre=`",
  "url: `${NOVELPIA_ORIGIN}/top100/plus/today/view/all/all?main_genre=`",
  'const MAX_DETAIL_FETCHES = 24',
  'const FETCH_TIMEOUT_MS = 10_000',
  'runNovelpiaDiscoveryIngestion',
  'novelpia_source_no_explicit_ids',
  'fresh_unlinked_count',
  'active_signal_count',
  'discovery_catalog_interests',
  'linkCatalogToSubmission',
  "user_id <> ?",
],'standard NovelPia ingestion');
const explicitExtractor=files.novelpia.slice(
  files.novelpia.indexOf('function extractNovelIds'),
  files.novelpia.indexOf('function minSignalRank'),
);
need(explicitExtractor,[
  'explicitPatterns',
  '/novel\\/(\\d{2,9})',
  'novel_no|novelNo',
],'explicit NovelPia identity extractor');
if(/ori\|thumb\|cover|_\(\\d/.test(explicitExtractor)){
  throw new Error('Discovery audit failed: standard NovelPia ingestion must not derive novel identity from image assets');
}

need(files.homepage,[
  "const HOMEPAGE_CURATION_PATH = '/proc/main_v2'",
  "const INGEST_PROVIDER = 'novelpia_homepage_fresh'",
  "const HOMEPAGE_SIGNAL = 'novelpia_home_plus_new'",
  "const PLUS_NEW_SIGNAL = 'novelpia_plus_new'",
  'const FETCH_TIMEOUT_MS = 8_000',
  'const API_MAX_BYTES = 1_000_000',
  'const MAX_REDIRECTS = 3',
  'const MAX_ITEMS = 12',
  'const REQUEST_HEADER_PROFILES',
  "name: 'browser_xhr'",
  "name: 'minimal_xhr'",
  "referer: `${NOVELPIA_ORIGIN}/`",
  "'sec-fetch-site': 'same-origin'",
  "'x-requested-with': 'XMLHttpRequest'",
  'for (const profile of REQUEST_HEADER_PROFILES)',
  'failures.push(`${profile.name}:${errorMessage(error)}`)',
  'novelpia_homepage_fetch_failed:',
  'runNovelpiaHomepageFreshIngestion',
  'getHomepageFreshIngestState',
  'parseHomepageFreshPayload',
  "url.searchParams.set('cmd', 'new_novel_curation')",
  "url.searchParams.set('novel_category', 'entry')",
  'Number(data.status)',
  'if (!Array.isArray(data.list))',
  'cleanExternalId(row.novel_no)',
  'cleanLinkUrl(row.link_url)',
  'idFromField && idFromLink && idFromField !== idFromLink',
  "return /^\\/novel\\/(\\d{2,9})\\/?$/.exec(value)?.[1] ?? null",
  'parseApiGenres(row.novel_genre ?? row.genre ?? row.genres)',
  'const synopsis = cleanText(row.novel_story, 1200) || null',
  "const publicationStatus = numberValue(row.is_complete) === 1 ? 'completed' : 'ongoing'",
  'viewsCount: nonNegativeInteger(row.count_view)',
  'favoritesCount: nonNegativeInteger(row.count_book)',
  'recommendationsCount: nonNegativeInteger(row.count_good)',
  "raw.startsWith('[')",
  'JSON.parse(raw)',
  "source_tier='plus'",
  "source: 'novelpia_main_v2_new_novel_curation'",
  "source: 'homepage_new_novel_curation'",
  "redirect: 'manual'",
  'fetchJsonLimited',
  'validateApiUrl',
  'readTextLimited',
  "url.protocol !== 'https:' || host !== 'novelpia.com' || url.pathname !== HOMEPAGE_CURATION_PATH",
  'countHomepageSignalsForAttempt(env, now)',
  'novelpia_homepage_persist_mismatch_',
  "s.signal=?",
  'active_count',
  'unlinked_count',
],'homepage curation provider');
if(
  files.homepage.includes('parseHomepageFreshCards')
  || files.homepage.includes('resolveHomepageCardsFromListHtml')
  || files.homepage.includes('fetchNovelDetailHtml')
  || files.homepage.includes('parseNovelDetail')
){
  throw new Error('Discovery audit failed: homepage Fresh must use the curation JSON directly with no rendered-HTML/detail resolver');
}
if(/coverId|imageId|assetId/.test(files.homepage)){
  throw new Error('Discovery audit failed: homepage Fresh identity must not depend on image asset IDs');
}
if((files.homepage.match(/fetch\(/g)||[]).length!==1){
  throw new Error('Discovery audit failed: homepage Fresh must keep one bounded fetch call site');
}
const profileNames=files.homepage.match(/name: '(?:browser_xhr|minimal_xhr)'/g)||[];
if(profileNames.length!==2){
  throw new Error('Discovery audit failed: homepage Fresh request fallback must stay bounded to two profiles');
}
const parseFn=files.homepage.slice(
  files.homepage.indexOf('export function parseHomepageFreshPayload'),
  files.homepage.indexOf('async function fetchHomepageFreshPayload'),
);
ordered(parseFn,[
  'const idFromField = cleanExternalId(row.novel_no)',
  'const linkUrl = cleanLinkUrl(row.link_url)',
  'const idFromLink = extractNovelpiaId(linkUrl)',
  'idFromField && idFromLink && idFromField !== idFromLink',
  'items.push({',
],'homepage canonical identity validation');
const ingestFn=files.homepage.slice(
  files.homepage.indexOf('export async function runNovelpiaHomepageFreshIngestion'),
  files.homepage.indexOf('export async function getHomepageFreshIngestState'),
);
ordered(ingestFn,[
  'const payload = await fetchHomepageFreshPayload()',
  'const parsed = parseHomepageFreshPayload(payload)',
  'await upsertCatalogNovel(env, item, now)',
  'await upsertHomepageSignals(env, row.id, item.rank, now)',
  'const persisted = await countHomepageSignalsForAttempt(env, now)',
  'await writeIngestState(env, {',
],'homepage ingestion execution order');

need(files.rawProvider,[
  'const FETCH_TIMEOUT_MS = 8_000',
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
],'RAW provider');
need(files.rawApi,[
  "const SEARCH_PATH = '/api/app/discovery/search'",
  "const SOURCE_PATH = '/api/app/discovery/source'",
  'authenticateMiniAppRequest(request, env)',
  'searchCachedRawCatalog(env, query, MAX_EXTERNAL_RESULTS)',
  'searchRawFuckNovelpia(query)',
  'provider_source: providerSource',
  "verification_status: inspected ? 'verified' : 'unverified'",
],'RAW discovery API');
need(files.rawCache,[
  'cacheRawResultForCatalog',
  "verification_status = 'verified'",
  'propagateCatalogRawSourceToSubmission',
],'RAW cache');

need(files.catalogApi,[
  "'/api/app/discovery/catalog/search'",
  "'/api/app/discovery/catalog/interest'",
  "'/api/app/discovery/catalog/link'",
  "'/api/app/discovery/catalog/health'",
  "'/api/app/discovery/catalog/refresh'",
  'authenticateMiniAppRequest(request, env)',
  "if (!auth.admin) return miniAppJsonError('forbidden'",
  'getHomepageFreshIngestState(env)',
  "homepage_provider: 'novelpia_homepage_fresh'",
  'homepage_state: homepageState',
  "stages: ['novelpia_homepage', 'novelpia', 'raw_fucknovelpia']",
  'getRawIngestState(env)',
  'propagateCatalogRawSourceToSubmission(env, catalogId, submissionId, now)',
],'catalog API');
ordered(files.catalogApi,[
  'runNovelpiaHomepageFreshIngestion(env, requestedAt)',
  'runNovelpiaDiscoveryIngestion(env, requestedAt)',
  'runRawCatalogEnrichment(env, new Date())',
],'manual source refresh chain');

need(files.index,[
  "import { handleDiscoveryRawV2Request } from './discovery-raw-v2';",
  'await handleDiscoveryRawV2Request(request, env)',
  "import { runRawCatalogEnrichment } from './raw-fucknovelpia';",
  "import { runNovelpiaHomepageFreshIngestion } from './novelpia-homepage-fresh';",
  'scheduledAt.getUTCMinutes() % 20 === 0',
  "runScheduledTask('novelpia_homepage_fresh'",
  "runScheduledTask('novelpia_discovery_ingest'",
  "runScheduledTask('raw_fucknovelpia_enrichment'",
],'Worker discovery wiring');
if(files.index.indexOf('await handleDiscoveryRawV2Request(request, env)')>files.index.indexOf('await handleDiscoveryRequest(request, env)')){
  throw new Error('Discovery audit failed: RAW v2 handler must shadow the legacy discovery handler');
}
ordered(files.index,[
  "runScheduledTask('novelpia_homepage_fresh'",
  "runScheduledTask('novelpia_discovery_ingest'",
  "runScheduledTask('raw_fucknovelpia_enrichment'",
],'scheduled source refresh chain');

need(files.feed,[
  'fresh_novelpia: freshWithRaw',
  'catalogOpportunityScore',
  "out.push('RAW verified')",
  'raw_ingest: ingestPresentation',
  'loadRawCatalogSourceMap',
  "'feed_catalog_mismatch'",
  "'no_unlinked_fresh'",
  "'never_refreshed'",
],'Discover feed');
need(files.discoverView,[
  "['fresh_novelpia','telescope',tx('fresh')]",
  '/api/app/discovery/catalog/search',
  "'/api/app/discovery/catalog/interest'",
  'data-catalog-request',
  'data-catalog-interest',
  "mode='fresh_novelpia'",
  'Fresh from NovelPia',
],'Fresh Discover UI');
need(files.discoverRuntime,[
  'discover-manual-refresh',
  "'/api/app/discovery/catalog/refresh'",
  'Refresh sources',
  'patchVerifiedRawLinks',
  "row.raw_verification_status==='verified'&&row.raw_available&&row.raw_page_url",
  'archive-check',
  'patchFreshEmptyState',
  'waitForRefreshCompletion',
  "'/api/app/discovery/catalog/health'",
  'refreshStagesFinished',
  'refreshAttemptFailed',
  'health?.homepage_state',
  "copy('homepageFailed')",
  'homepage_state?.unlinked_count',
  "'dtl:discover-refresh-ready'",
],'Discover source recovery runtime');
need(files.discoverCss,['.discover-catalog-row'],'Fresh Discover CSS');
need(files.html,[
  '/app/discover-page.css?v=20260811-discover2',
  '/app/view-discover.js?v=20260811-discover2',
  '/app/discover-page-runtime.js?v=20260812-discover5',
],'Discover assets');
if(files.html.indexOf('/app/discovery-ui.js?v=20260811-discovery1')>files.html.indexOf('/app/view-suggest.js?v=20260810-app4&discover=20260811a')){
  throw new Error('Discovery audit failed: discovery UI must load before Suggest view');
}

new Function(files.discoverView);
new Function(files.discoverRuntime);
console.log('Discovery foundation + truthful NovelPia homepage health + NovelPia lists + RAW provider v2 audit passed.');
