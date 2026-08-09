import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

export async function handleAdminAnalyticsRequest(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);
  if(request.method!=='GET'||url.pathname!=='/api/app/admin/analytics')return null;
  const auth=await authenticateMiniAppRequest(request,env);
  if(auth instanceof Response)return auth;
  if(!auth.admin)return miniAppJsonError('forbidden','Admin access required.',403);

  const raw=Number(url.searchParams.get('days')||30);
  const days=[7,30,90].includes(raw)?raw:30;
  const since=new Date(Date.now()-(days-1)*86400000);since.setUTCHours(0,0,0,0);
  const sinceIso=since.toISOString();

  const [summary,daily,languages,referrals,publishing,topUsers]=await Promise.all([
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
  ]);

  return miniAppJson({
    days,
    since:sinceIso,
    summary:mapNumbers(summary),
    daily:daily.results,
    languages:languages.results,
    referrals:mapNumbers(referrals),
    publishing:mapNumbers(publishing),
    top_users:topUsers.results,
  });
}

function mapNumbers(row:Record<string,number>|null){const out:Record<string,number>={};for(const [k,v] of Object.entries(row||{}))out[k]=Number(v||0);return out;}
