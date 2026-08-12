import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');
const need=(source,token,label)=>{if(!source.includes(token))throw new Error(`${label}: missing ${token}`);};
const forbid=(source,token,label)=>{if(source.includes(token))throw new Error(`${label}: forbidden ${token}`);};

const migration=read('migrations/0031_product_analytics.sql');
const backend=read('src/product-analytics.ts');
const analytics=read('src/admin-analytics.ts');
const runtime=read('public/app/product-analytics.js');
const adminUi=read('public/app/admin-product-analytics.js');
const css=read('public/app/product-analytics.css');
const index=read('public/app/index.html');

for(const token of [
  'CREATE TABLE IF NOT EXISTS product_events',
  'event_id TEXT',
  'event_name TEXT NOT NULL',
  'user_id INTEGER',
  'session_id TEXT',
  'event_value TEXT',
  'query_text TEXT',
  "source TEXT NOT NULL DEFAULT 'client'",
  'idx_product_events_event_id',
  'idx_product_events_name_created',
  'idx_product_events_user_created',
  'idx_product_events_query_created',
  'CREATE TABLE IF NOT EXISTS product_analytics_state',
])need(migration,token,'0031 migration');
if(/^\s*CREATE\s+TRIGGER\b/im.test(migration))throw new Error('0031 must remain remote-D1-safe and contain no CREATE TRIGGER body');

for(const token of [
  "'/api/app/analytics/events'",
  'MAX_BODY_BYTES = 32 * 1024',
  'MAX_BATCH = 16',
  'PRODUCT_EVENT_NAMES',
  "'discover_search'",
  "'discover_zero_result'",
  "'interest_add'",
  "'follow_add'",
  "'duplicate_intercepted'",
  "'suggest_abandoned'",
  "'request_submitted'",
  'INSERT OR IGNORE INTO product_events',
  'auth.telegramUser.id',
  'EVENT_ID_RE',
  'SESSION_ID_RE',
  'MAX_QUERY = 300',
  'MAX_METADATA_BYTES = 1200',
  'METADATA_KEYS',
  'EVENT_RETENTION_MS = 180',
  "state_key='retention_day'",
  'DELETE FROM product_events WHERE created_at<?',
])need(backend,token,'product analytics backend');
for(const token of ['event.user_id','body.user_id','telegram_init_data','initDataUnsafe','file_name','file_content'])forbid(backend,token,'product analytics privacy boundary');

for(const token of [
  'handleProductAnalyticsEventRequest(request,env)',
  "event_name='discover_search'",
  "event_name IN ('title_open','catalog_open')",
  "event_name IN ('interest_add','follow_add')",
  "event_name='request_submitted'",
  "event_name='discover_zero_result'",
  "event_name='suggest_step'",
  'COUNT(DISTINCT user_id)',
  'discovery_interests',
  'discovery_catalog_interests',
  'title_follows',
  'product:{',
  'zero_result_rate',
  'zero_result_queries',
  'completion_rate',
])need(analytics,token,'admin product analytics response');

for(const token of [
  "const ENDPOINT='/api/app/analytics/events'",
  'const MAX_QUEUE=48',
  'const FLUSH_BATCH=12',
  'const SEARCH_SETTLE_MS=650',
  "'discover_search'",
  "'discover_zero_result'",
  "'interest_add'",
  "'follow_add'",
  "'duplicate_intercepted'",
  "'request_submitted'",
  "path==='/api/app/discovery/search'",
  "path==='/api/app/submission/preflight'",
  "path==='/api/app/submit'",
  "path==='/api/app/discovery/interest'",
  "path==='/api/app/discovery/catalog/interest'",
  "path==='/api/app/following/submission'",
  "path==='/api/app/following/catalog'",
  "target.matches('.public-title-share')",
  "target.matches('.title-release-open')",
  "host==='raw-fucknovelpia.com'",
  "host==='boosty.to'",
  "track('suggest_started'",
  "track('suggest_step'",
  "track('suggest_abandoned'",
  "sessionStorage.getItem(key)",
  "'x-telegram-init-data':window.Telegram?.WebApp?.initData||''",
  'keepalive:true',
  'window.DTL_PRODUCT_ANALYTICS',
])need(runtime,token,'product analytics runtime');
if(runtime.includes('new MutationObserver'))throw new Error('Product analytics runtime must reuse canonical runtime lifecycle and own no MutationObserver');
for(const token of ['state.draft','state.file','file.text()','sexual_content','sensitive_content','notes'])forbid(runtime,token,'product analytics content privacy');

for(const token of [
  "context.pathname==='/api/app/admin/analytics'",
  "admin.activeRoute()!=='tools:analytics'",
  'data-product-analytics',
  'PRODUCT ANALYTICS',
  'Основная воронка',
  'Suggest drop-off',
  'Что ищут и не находят',
  'Дальнейшие действия',
  'zero_result_queries',
  'suggest.started_users',
])need(adminUi,token,'product analytics admin UI');
if(adminUi.includes('new MutationObserver'))throw new Error('Product analytics admin UI must not own a MutationObserver');
for(const token of ['.product-analytics-v2','.product-analytics-kpis','.product-funnel-row','.suggest-step-row','.product-zero-row','@media(max-width:560px)'])need(css,token,'product analytics CSS');

for(const token of [
  '/app/product-analytics.css?v=20260812-analytics1',
  '/app/product-analytics.js?v=20260812-analytics1',
  '/app/admin-product-analytics.js?v=20260812-analytics1',
])need(index,token,'product analytics assets');
const userRuntimeAt=index.indexOf('/app/product-analytics.js?v=20260812-analytics1');
const adminRuntimeAt=index.indexOf('/app/admin-product-analytics.js?v=20260812-analytics1');
const appAt=index.indexOf('/app/app.js?v=20260810-app1');
if(userRuntimeAt<0||adminRuntimeAt<0||appAt<0||!(userRuntimeAt<adminRuntimeAt&&adminRuntimeAt<appAt))throw new Error('Product analytics runtimes must register before app bootstrap');

new Function(runtime);
new Function(adminUi);
console.log('Product Analytics 2.0 safety audit passed.');
