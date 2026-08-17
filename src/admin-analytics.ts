import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { handleProductAnalyticsEventRequest } from './product-analytics';

const DAY_MS=86_400_000;
const SUPPORTED_PERIODS=new Set([0,7,30,90,365]);

type NumberRow=Record<string,number>;

export async function handleAdminAnalyticsRequest(request:Request,env:Env):Promise<Response|null>{
  const productEventResponse=await handleProductAnalyticsEventRequest(request,env);
  if(productEventResponse)return productEventResponse;

  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/app/admin/analytics')return null;
  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);

  const requested=Number(url.searchParams.get('days')||30);
  const days=SUPPORTED_PERIODS.has(requested)?requested:30;
  const since=days===0?new Date('1970-01-01T00:00:00.000Z'):startOfUtcDay(new Date(Date.now()-(days-1)*DAY_MS));
  const sinceIso=since.toISOString();
  const previousEnd=days===0?null:sinceIso;
  const previousStart=days===0?null:startOfUtcDay(new Date(since.getTime()-days*DAY_MS)).toISOString();

  const [summary,previous]=await Promise.all([
    periodSummary(env,sinceIso,null),
    previousStart&&previousEnd?periodSummary(env,previousStart,previousEnd):Promise.resolve(null),
  ]);

  const [
    daily,languages,referrals,publishing,topUsers,
    productEvents,productFunnel,zeroResults,suggestSteps,trackingStart,
    requestStates,requestTiming,readerDetails,topReleases,
  ]=await Promise.all([
    env.DB.prepare(`
      SELECT day,
             SUM(new_users) AS new_users,
             SUM(requests) AS requests,
             SUM(completed) AS completed,
             SUM(publications) AS publications,
             SUM(thank_you) AS thank_you,
             SUM(deliveries) AS deliveries,
             SUM(donations) AS donations
      FROM (
        SELECT substr(created_at,1,10) AS day,COUNT(*) AS new_users,0 requests,0 completed,0 publications,0 thank_you,0 deliveries,0 donations
        FROM users WHERE created_at>=? GROUP BY substr(created_at,1,10)
        UNION ALL
        SELECT substr(created_at,1,10),0,COUNT(*),0,0,0,0,0
        FROM submissions WHERE created_at>=? GROUP BY substr(created_at,1,10)
        UNION ALL
        SELECT substr(completed_at,1,10),0,0,COUNT(*),0,0,0,0
        FROM submissions WHERE completed_at IS NOT NULL AND completed_at>=? GROUP BY substr(completed_at,1,10)
        UNION ALL
        SELECT substr(published_at,1,10),0,0,0,COUNT(*),0,0,0
        FROM publications WHERE status='published' AND published_at IS NOT NULL AND published_at>=? GROUP BY substr(published_at,1,10)
        UNION ALL
        SELECT substr(created_at,1,10),0,0,0,0,
               SUM(CASE WHEN event_type='thank_you_click' THEN 1 ELSE 0 END),
               SUM(CASE WHEN event_type='delivery_success' THEN 1 ELSE 0 END),
               SUM(CASE WHEN event_type='donate_click' THEN 1 ELSE 0 END)
        FROM publication_reader_events WHERE created_at>=? GROUP BY substr(created_at,1,10)
      ) GROUP BY day ORDER BY day
    `).bind(sinceIso,sinceIso,sinceIso,sinceIso,sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT original_language AS language,COUNT(*) AS count FROM submissions WHERE created_at>=? GROUP BY original_language ORDER BY count DESC LIMIT 12`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) AS started,
      SUM(CASE WHEN status='pending' AND created_at>=? THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='qualified' AND qualified_at>=? THEN 1 ELSE 0 END) AS qualified,
      SUM(CASE WHEN status='cancelled' AND updated_at>=? THEN 1 ELSE 0 END) AS cancelled
      FROM referrals`).bind(sinceIso,sinceIso,sinceIso,sinceIso).first<NumberRow>(),
    env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN comments_check_status='complete' THEN 1 ELSE 0 END) AS comments_complete,
      SUM(CASE WHEN comments_check_status='needs_attention' THEN 1 ELSE 0 END) AS needs_attention,
      (SELECT COUNT(*) FROM publication_assets WHERE delivery_status='sent' AND created_at>=?) AS files_sent,
      (SELECT COUNT(*) FROM publication_assets WHERE delivery_status='failed' AND created_at>=?) AS files_failed
      FROM publications WHERE created_at>=?`).bind(sinceIso,sinceIso,sinceIso).first<NumberRow>(),
    env.DB.prepare(`SELECT u.telegram_id,u.username,u.first_name,COUNT(s.id) AS requests
      FROM users u JOIN submissions s ON s.user_id=u.telegram_id
      WHERE s.created_at>=?
      GROUP BY u.telegram_id,u.username,u.first_name
      ORDER BY requests DESC,u.telegram_id DESC LIMIT 10`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT event_name,COUNT(*) AS events,COUNT(DISTINCT user_id) AS users
      FROM product_events WHERE created_at>=?
      GROUP BY event_name ORDER BY events DESC,event_name ASC`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT
      (SELECT COUNT(DISTINCT user_id) FROM product_events WHERE event_name='discover_search' AND created_at>=?) AS search_users,
      (SELECT COUNT(DISTINCT user_id) FROM product_events WHERE event_name IN ('title_open','catalog_open') AND created_at>=?) AS open_users,
      (SELECT COUNT(DISTINCT user_id) FROM product_events WHERE event_name IN ('interest_add','follow_add') AND created_at>=?) AS intent_users,
      (SELECT COUNT(DISTINCT user_id) FROM product_events WHERE event_name='request_submitted' AND created_at>=?) AS request_users,
      (SELECT COUNT(*) FROM submissions WHERE created_at>=?) AS requests,
      (SELECT COUNT(*) FROM discovery_interests WHERE created_at>=?) +
        (SELECT COUNT(*) FROM discovery_catalog_interests WHERE created_at>=?) AS demand_adds,
      (SELECT COUNT(*) FROM title_follows WHERE created_at>=?) AS follow_adds
    `).bind(sinceIso,sinceIso,sinceIso,sinceIso,sinceIso,sinceIso,sinceIso,sinceIso).first<NumberRow>(),
    env.DB.prepare(`SELECT query_text,COUNT(*) AS count,COUNT(DISTINCT user_id) AS users,MAX(created_at) AS last_seen
      FROM product_events
      WHERE event_name='discover_zero_result' AND created_at>=? AND query_text IS NOT NULL AND query_text<>''
      GROUP BY query_text ORDER BY count DESC,last_seen DESC LIMIT 20`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT event_value AS step,COUNT(*) AS events,COUNT(DISTINCT user_id) AS users
      FROM product_events
      WHERE event_name='suggest_step' AND created_at>=? AND event_value IS NOT NULL
      GROUP BY event_value ORDER BY CASE event_value WHEN 'upload' THEN 1 WHEN 'details' THEN 2 WHEN 'content' THEN 3 WHEN 'review' THEN 4 ELSE 9 END,events DESC`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT MIN(created_at) AS tracking_since FROM product_events`).first<{tracking_since:string|null}>(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN status='accepted' AND queue_status='queued' THEN 1 ELSE 0 END) AS queued,
      SUM(CASE WHEN status='accepted' AND queue_status='in_progress' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status='accepted' AND queue_status='completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status='accepted' THEN chapter_count ELSE 0 END) AS accepted_chapters,
      SUM(CASE WHEN status='accepted' AND queue_status='queued' THEN chapter_count ELSE 0 END) AS queued_chapters,
      SUM(CASE WHEN status='accepted' AND queue_status='in_progress' THEN chapter_count ELSE 0 END) AS active_chapters
      FROM submissions WHERE created_at>=?`).bind(sinceIso).first<NumberRow>(),
    env.DB.prepare(`SELECT
      AVG(CASE WHEN queued_at IS NOT NULL AND started_at IS NOT NULL THEN (julianday(started_at)-julianday(queued_at))*24 END) AS wait_hours,
      AVG(CASE WHEN started_at IS NOT NULL AND completed_at IS NOT NULL THEN (julianday(completed_at)-julianday(started_at))*24 END) AS work_hours,
      AVG(CASE WHEN completed_at IS NOT NULL THEN (julianday(completed_at)-julianday(created_at))*24 END) AS total_hours
      FROM submissions WHERE completed_at IS NOT NULL AND completed_at>=?`).bind(sinceIso).first<Record<string,number|null>>(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN event_type='download_open' THEN 1 ELSE 0 END) AS download_opens,
      SUM(CASE WHEN event_type='thank_you_click' THEN 1 ELSE 0 END) AS thank_you_clicks,
      COUNT(DISTINCT CASE WHEN event_type='thank_you_click' THEN user_id END) AS unique_clickers,
      SUM(CASE WHEN event_type='delivery_success' THEN 1 ELSE 0 END) AS deliveries,
      COUNT(DISTINCT CASE WHEN event_type='delivery_success' THEN user_id END) AS unique_readers,
      SUM(CASE WHEN event_type='delivery_success' AND metadata_json LIKE '%\"repeat\":true%' THEN 1 ELSE 0 END) AS repeat_deliveries,
      SUM(CASE WHEN event_type='delivery_failed' THEN 1 ELSE 0 END) AS delivery_failures,
      SUM(CASE WHEN event_type='access_denied' THEN 1 ELSE 0 END) AS access_denied,
      SUM(CASE WHEN event_type='rate_limited' THEN 1 ELSE 0 END) AS rate_limited,
      SUM(CASE WHEN event_type='donate_click' THEN 1 ELSE 0 END) AS donate_clicks
      FROM publication_reader_events WHERE created_at>=?`).bind(sinceIso).first<NumberRow>(),
    env.DB.prepare(`SELECT
      p.id,
      COALESCE(NULLIF(s.title,''),NULLIF(p.internal_title,''),'Публикация #'||p.id) AS title,
      p.published_at,
      COUNT(CASE WHEN e.event_type='thank_you_click' THEN 1 END) AS thank_you_clicks,
      COUNT(DISTINCT CASE WHEN e.event_type='thank_you_click' THEN e.user_id END) AS clickers,
      COUNT(CASE WHEN e.event_type='delivery_success' THEN 1 END) AS deliveries,
      COUNT(DISTINCT CASE WHEN e.event_type='delivery_success' THEN e.user_id END) AS readers,
      COUNT(CASE WHEN e.event_type='donate_click' THEN 1 END) AS donate_clicks
      FROM publications p
      LEFT JOIN submissions s ON s.id=p.submission_id
      LEFT JOIN publication_reader_events e ON e.publication_id=p.id AND e.created_at>=?
      WHERE p.status='published'
      GROUP BY p.id,s.title
      HAVING p.published_at>=? OR COUNT(e.id)>0
      ORDER BY readers DESC,thank_you_clicks DESC,deliveries DESC,p.published_at DESC
      LIMIT 10`).bind(sinceIso,sinceIso).all<Record<string,unknown>>(),
  ]);

  const eventMap=Object.fromEntries(productEvents.results.map(row=>[
    String(row.event_name||''),
    {events:Number(row.events||0),users:Number(row.users||0)},
  ]));
  const searches=Number(eventMap.discover_search?.events||0);
  const zeroResultEvents=Number(eventMap.discover_zero_result?.events||0);
  const suggestStarted=Number(eventMap.suggest_started?.users||0);
  const suggestAbandoned=Number(eventMap.suggest_abandoned?.users||0);
  const suggestSubmitted=Number(eventMap.request_submitted?.users||0);

  return miniAppJson({
    days,
    since:sinceIso,
    previous_since:previousStart,
    summary,
    previous,
    daily:daily.results,
    languages:languages.results,
    referrals:mapNumbers(referrals),
    publishing:mapNumbers(publishing),
    top_users:topUsers.results,
    requests:{
      states:mapNumbers(requestStates),
      timing:mapNullableNumbers(requestTiming),
    },
    readers:mapNumbers(readerDetails),
    top_releases:topReleases.results,
    product:{
      tracking_since:trackingStart?.tracking_since||null,
      events_total:productEvents.results.reduce((sum,row)=>sum+Number(row.events||0),0),
      events_by_name:productEvents.results,
      searches,
      search_users:Number(eventMap.discover_search?.users||0),
      zero_results:zeroResultEvents,
      zero_result_rate:searches?Math.round((zeroResultEvents/searches)*1000)/10:0,
      title_opens:Number(eventMap.title_open?.events||0)+Number(eventMap.catalog_open?.events||0),
      raw_opens:Number(eventMap.raw_open?.events||0),
      interest_adds:Number(eventMap.interest_add?.events||0),
      follow_adds:Number(eventMap.follow_add?.events||0),
      duplicates_intercepted:Number(eventMap.duplicate_intercepted?.events||0),
      shares:Number(eventMap.share_title?.events||0),
      release_opens:Number(eventMap.release_open?.events||0),
      boosty_clicks:Number(eventMap.boosty_click?.events||0),
      funnel:mapNumbers(productFunnel),
      zero_result_queries:zeroResults.results,
      suggest:{
        started_users:suggestStarted,
        abandoned_users:suggestAbandoned,
        submitted_users:suggestSubmitted,
        completion_rate:suggestStarted?Math.round((Math.min(suggestStarted,suggestSubmitted)/suggestStarted)*1000)/10:0,
        steps:suggestSteps.results,
      },
    },
  });
}

async function periodSummary(env:Env,start:string,end:string|null):Promise<Record<string,number>>{
  const condition=(column:string)=>`${column}>=?${end?` AND ${column}<?`:''}`;
  const windowArgs=()=>end?[start,end]:[start];
  const occurrences=12;
  const bindArgs=Array.from({length:occurrences},()=>windowArgs()).flat();
  const row=await env.DB.prepare(`SELECT
    (SELECT COUNT(*) FROM users) AS users_total,
    (SELECT COUNT(*) FROM users WHERE ${condition('created_at')}) AS users_new,
    (SELECT COUNT(*) FROM (
      SELECT user_id FROM product_events WHERE ${condition('created_at')}
      UNION
      SELECT user_id FROM submissions WHERE ${condition('created_at')}
      UNION
      SELECT user_id FROM publication_reader_events WHERE ${condition('created_at')}
    )) AS active_users,
    (SELECT COUNT(*) FROM submissions WHERE ${condition('created_at')}) AS submissions,
    (SELECT COUNT(*) FROM submissions WHERE status='pending') AS pending_now,
    (SELECT COUNT(*) FROM submissions WHERE status='accepted' AND queue_status='in_progress') AS translating_now,
    (SELECT COUNT(*) FROM submissions WHERE status='accepted' AND queue_status='completed' AND ${condition('completed_at')}) AS completed,
    (SELECT COUNT(*) FROM publications WHERE status='published' AND published_at IS NOT NULL AND ${condition('published_at')}) AS publications,
    (SELECT COUNT(*) FROM referrals WHERE status='qualified' AND qualified_at IS NOT NULL AND ${condition('qualified_at')}) AS referrals_qualified,
    (SELECT COUNT(DISTINCT user_id) FROM publication_reader_events WHERE event_type='delivery_success' AND ${condition('created_at')}) AS unique_readers,
    (SELECT COUNT(*) FROM publication_reader_events WHERE event_type='thank_you_click' AND ${condition('created_at')}) AS thank_you_clicks,
    (SELECT COUNT(*) FROM publication_reader_events WHERE event_type='delivery_success' AND ${condition('created_at')}) AS deliveries,
    (SELECT COUNT(*) FROM publication_reader_events WHERE event_type='donate_click' AND ${condition('created_at')}) AS donate_clicks
  `).bind(...bindArgs).first<NumberRow>();
  return mapNumbers(row);
}

function startOfUtcDay(value:Date){value.setUTCHours(0,0,0,0);return value;}
function mapNumbers(row:Record<string,number>|null){const out:Record<string,number>={};for(const [k,v] of Object.entries(row||{}))out[k]=Number(v||0);return out;}
function mapNullableNumbers(row:Record<string,number|null>|null){const out:Record<string,number|null>={};for(const [k,v] of Object.entries(row||{}))out[k]=v==null?null:Number(v);return out;}
