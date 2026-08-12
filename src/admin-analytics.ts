import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { handleProductAnalyticsEventRequest } from './product-analytics';

export async function handleAdminAnalyticsRequest(request:Request,env:Env):Promise<Response|null>{
  const productEventResponse=await handleProductAnalyticsEventRequest(request,env);
  if(productEventResponse)return productEventResponse;

  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/app/admin/analytics')return null;
  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);

  const raw=Number(url.searchParams.get('days')||30);
  const days=[7,30,90].includes(raw)?raw:30;
  const since=new Date(Date.now()-(days-1)*86400000);since.setUTCHours(0,0,0,0);
  const sinceIso=since.toISOString();

  const [
    summary,daily,languages,referrals,publishing,topUsers,
    productEvents,productFunnel,zeroResults,suggestSteps,trackingStart,
  ]=await Promise.all([
    env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM users) AS users_total,
      (SELECT COUNT(*) FROM users WHERE created_at>=?) AS users_new,
      (SELECT COUNT(*) FROM submissions WHERE created_at>=?) AS submissions,
      (SELECT COUNT(*) FROM submissions WHERE status='pending') AS pending_now,
      (SELECT COUNT(*) FROM submissions WHERE status='accepted' AND queue_status='in_progress') AS translating_now,
      (SELECT COUNT(*) FROM submissions WHERE status='accepted' AND queue_status='completed' AND completed_at>=?) AS completed,
      (SELECT COUNT(*) FROM publications WHERE status='published' AND published_at>=?) AS publications,
      (SELECT COUNT(*) FROM referrals WHERE status='qualified' AND qualified_at>=?) AS referrals_qualified
    `).bind(sinceIso,sinceIso,sinceIso,sinceIso,sinceIso).first<Record<string,number>>(),
    env.DB.prepare(`SELECT substr(created_at,1,10) AS day,COUNT(*) AS requests,COUNT(DISTINCT user_id) AS users FROM submissions WHERE created_at>=? GROUP BY substr(created_at,1,10) ORDER BY day`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT original_language AS language,COUNT(*) AS count FROM submissions WHERE created_at>=? GROUP BY original_language ORDER BY count DESC LIMIT 10`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT
      SUM(CASE WHEN created_at>=? THEN 1 ELSE 0 END) AS started,
      SUM(CASE WHEN status='pending' AND created_at>=? THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='qualified' AND qualified_at>=? THEN 1 ELSE 0 END) AS qualified,
      SUM(CASE WHEN status='cancelled' AND updated_at>=? THEN 1 ELSE 0 END) AS cancelled
      FROM referrals`).bind(sinceIso,sinceIso,sinceIso,sinceIso).first<Record<string,number>>(),
    env.DB.prepare(`SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='published' THEN 1 ELSE 0 END) AS published,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN comments_check_status='complete' THEN 1 ELSE 0 END) AS comments_complete,
      SUM(CASE WHEN comments_check_status='needs_attention' THEN 1 ELSE 0 END) AS needs_attention,
      (SELECT COUNT(*) FROM publication_assets WHERE delivery_status='sent') AS files_sent,
      (SELECT COUNT(*) FROM publication_assets WHERE delivery_status='failed') AS files_failed
      FROM publications WHERE created_at>=?`).bind(sinceIso).first<Record<string,number>>(),
    env.DB.prepare(`SELECT u.telegram_id,u.username,u.first_name,COUNT(s.id) AS requests FROM users u JOIN submissions s ON s.user_id=u.telegram_id WHERE s.created_at>=? GROUP BY u.telegram_id,u.username,u.first_name ORDER BY requests DESC LIMIT 8`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT event_name,COUNT(*) AS events,COUNT(DISTINCT user_id) AS users
      FROM product_events WHERE created_at>=?
      GROUP BY event_name ORDER BY events DESC,event_name ASC`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT
      (SELECT COUNT(DISTINCT user_id) FROM product_events WHERE event_name='discover_search' AND created_at>=?) AS search_users,
      (SELECT COUNT(DISTINCT user_id) FROM product_events WHERE event_name IN ('title_open','catalog_open') AND created_at>=?) AS open_users,
      (SELECT COUNT(DISTINCT user_id) FROM (
        SELECT user_id FROM discovery_interests WHERE created_at>=?
        UNION SELECT user_id FROM discovery_catalog_interests WHERE created_at>=?
        UNION SELECT user_id FROM title_follows WHERE created_at>=?
      )) AS intent_users,
      (SELECT COUNT(DISTINCT user_id) FROM submissions WHERE created_at>=?) AS request_users,
      (SELECT COUNT(*) FROM submissions WHERE created_at>=?) AS requests,
      (SELECT COUNT(*) FROM discovery_interests WHERE created_at>=?) +
        (SELECT COUNT(*) FROM discovery_catalog_interests WHERE created_at>=?) AS demand_adds,
      (SELECT COUNT(*) FROM title_follows WHERE created_at>=?) AS follow_adds
    `).bind(
      sinceIso,sinceIso,sinceIso,sinceIso,sinceIso,sinceIso,sinceIso,sinceIso,sinceIso,sinceIso,
    ).first<Record<string,number>>(),
    env.DB.prepare(`SELECT query_text,COUNT(*) AS count,COUNT(DISTINCT user_id) AS users,MAX(created_at) AS last_seen
      FROM product_events
      WHERE event_name='discover_zero_result' AND created_at>=? AND query_text IS NOT NULL AND query_text<>''
      GROUP BY query_text ORDER BY count DESC,last_seen DESC LIMIT 20`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT event_value AS step,COUNT(*) AS events,COUNT(DISTINCT user_id) AS users
      FROM product_events
      WHERE event_name='suggest_step' AND created_at>=? AND event_value IS NOT NULL
      GROUP BY event_value ORDER BY CASE event_value WHEN 'upload' THEN 1 WHEN 'details' THEN 2 WHEN 'content' THEN 3 WHEN 'review' THEN 4 ELSE 9 END,events DESC`).bind(sinceIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT MIN(created_at) AS tracking_since FROM product_events`).first<{tracking_since:string|null}>(),
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
    summary:mapNumbers(summary),
    daily:daily.results,
    languages:languages.results,
    referrals:mapNumbers(referrals),
    publishing:mapNumbers(publishing),
    top_users:topUsers.results,
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

function mapNumbers(row:Record<string,number>|null){const out:Record<string,number>={};for(const [k,v] of Object.entries(row||{}))out[k]=Number(v||0);return out;}
