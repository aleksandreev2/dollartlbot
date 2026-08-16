import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

const PAGE_SIZE = 60;

export async function handleAdminReaderSecurityRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const publicationReaders = /^\/api\/app\/admin\/publications\/(\d+)\/readers$/.exec(url.pathname);
  const userActivity = /^\/api\/app\/admin\/users\/(\d+)\/reader-activity$/.exec(url.pathname);
  const antiAbuse = url.pathname === '/api/app/admin/security/anti-abuse';
  const assetSecurity = url.pathname === '/api/app/admin/security/assets';
  if (request.method !== 'GET' || (!publicationReaders && !userActivity && !antiAbuse && !assetSecurity)) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (publicationReaders) return publicationReaderReport(Number(publicationReaders[1]), url, env);
  if (userActivity) return userReaderActivity(Number(userActivity[1]), url, env);
  if (antiAbuse) return antiAbuseReport(url, env);
  return assetSecurityReport(url, env);
}

async function publicationReaderReport(publicationId: number, url: URL, env: Env): Promise<Response> {
  const publication = await env.DB.prepare(`
    SELECT p.id,p.internal_title,p.status,p.published_at,p.submission_id,
           COALESCE(NULLIF(s.title,''),NULLIF(p.internal_title,''),'Release #'||p.id) AS display_title
    FROM publications p
    LEFT JOIN submissions s ON s.id=p.submission_id
    WHERE p.id=?
  `).bind(publicationId).first<Record<string, unknown>>();
  if (!publication) return miniAppJsonError('not_found', 'Publication not found.', 404);

  const offset = safeOffset(url);
  const [stats, readers, total, recentEvents] = await Promise.all([
    env.DB.prepare(`SELECT * FROM publication_reader_stats WHERE publication_id=?`)
      .bind(publicationId).first<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT
        ps.user_id,
        COALESCE(NULLIF(u.username,''),NULLIF(ps.username_snapshot,'')) AS username,
        COALESCE(NULLIF(u.first_name,''),NULLIF(ps.first_name_snapshot,'')) AS first_name,
        ps.last_name_snapshot AS last_name,
        ps.thank_you_clicks,ps.delivery_successes,ps.delivery_failures,ps.repeat_deliveries,ps.donate_clicks,
        ps.first_seen_at,ps.last_seen_at,
        c.blocked_at,c.blocked_reason,
        aa.abuse_score,aa.total_limited,aa.total_temp_blocks
      FROM publication_user_stats ps
      LEFT JOIN users u ON u.telegram_id=ps.user_id
      LEFT JOIN user_admin_controls c ON c.user_id=ps.user_id
      LEFT JOIN anti_abuse_user_stats aa ON aa.user_id=ps.user_id
      WHERE ps.publication_id=?
      ORDER BY ps.last_seen_at DESC,ps.user_id DESC
      LIMIT ? OFFSET ?
    `).bind(publicationId, PAGE_SIZE, offset).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM publication_user_stats WHERE publication_id=?`)
      .bind(publicationId).first<{ n: number }>(),
    env.DB.prepare(`
      SELECT id,user_id,username_snapshot,first_name_snapshot,last_name_snapshot,event_type,asset_id,
             source_chat_id,source_message_id,metadata_json,created_at
      FROM publication_reader_events
      WHERE publication_id=?
      ORDER BY id DESC LIMIT 80
    `).bind(publicationId).all<Record<string, unknown>>(),
  ]);

  return miniAppJson({
    publication,
    stats: stats || emptyReaderStats(publicationId),
    readers: readers.results,
    recent_events: recentEvents.results,
    total_readers: Number(total?.n || 0),
    offset,
    limit: PAGE_SIZE,
    has_more: offset + readers.results.length < Number(total?.n || 0),
  });
}

async function userReaderActivity(userId: number, url: URL, env: Env): Promise<Response> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return miniAppJsonError('invalid_user', 'Invalid user id.', 400);
  const user = await env.DB.prepare(`
    SELECT telegram_id,username,first_name,language,created_at,updated_at,last_seen_at
    FROM users WHERE telegram_id=?
  `).bind(userId).first<Record<string, unknown>>();
  if (!user) return miniAppJsonError('not_found', 'User not found.', 404);

  const offset = safeOffset(url);
  const [publicationStats, events, deliveries, abuseStats, abuseEvents] = await Promise.all([
    env.DB.prepare(`
      SELECT ps.*,p.status,p.published_at,
             COALESCE(NULLIF(s.title,''),NULLIF(p.internal_title,''),'Release #'||p.id) AS publication_title
      FROM publication_user_stats ps
      JOIN publications p ON p.id=ps.publication_id
      LEFT JOIN submissions s ON s.id=p.submission_id
      WHERE ps.user_id=?
      ORDER BY ps.last_seen_at DESC
      LIMIT ? OFFSET ?
    `).bind(userId, PAGE_SIZE, offset).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT e.id,e.publication_id,e.asset_id,e.event_type,e.source_chat_id,e.source_message_id,
             e.metadata_json,e.created_at,
             COALESCE(NULLIF(s.title,''),NULLIF(p.internal_title,''),'Release #'||p.id) AS publication_title
      FROM publication_reader_events e
      JOIN publications p ON p.id=e.publication_id
      LEFT JOIN submissions s ON s.id=p.submission_id
      WHERE e.user_id=?
      ORDER BY e.id DESC LIMIT 120
    `).bind(userId).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT d.publication_id,d.asset_id,d.status,d.attempts,d.first_requested_at,d.last_requested_at,
             d.delivered_at,d.telegram_message_id,d.last_error,a.file_name
      FROM publication_deliveries d
      JOIN publication_assets a ON a.id=d.asset_id
      WHERE d.user_id=?
      ORDER BY d.last_requested_at DESC LIMIT 80
    `).bind(userId).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT * FROM anti_abuse_user_stats WHERE user_id=?`)
      .bind(userId).first<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id,action,decision,reason,hits,window_seconds,metadata_json,created_at
      FROM anti_abuse_events WHERE user_id=? ORDER BY id DESC LIMIT 80
    `).bind(userId).all<Record<string, unknown>>(),
  ]);

  return miniAppJson({
    user,
    publication_stats: publicationStats.results,
    reader_events: events.results,
    deliveries: deliveries.results,
    abuse_stats: abuseStats || null,
    abuse_events: abuseEvents.results,
    offset,
    limit: PAGE_SIZE,
  });
}

async function antiAbuseReport(url: URL, env: Env): Promise<Response> {
  const days = safeDays(url);
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [summary, reasons, users, recent] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS events,
        COUNT(DISTINCT user_id) AS users,
        SUM(CASE WHEN decision='limited' THEN 1 ELSE 0 END) AS limited,
        SUM(CASE WHEN reason='temporary_block' THEN 1 ELSE 0 END) AS temporary_blocks
      FROM anti_abuse_events WHERE created_at>=?
    `).bind(since).first<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT reason,COUNT(*) AS events,COUNT(DISTINCT user_id) AS users,MAX(created_at) AS last_seen
      FROM anti_abuse_events WHERE created_at>=?
      GROUP BY reason ORDER BY events DESC LIMIT 20
    `).bind(since).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT a.user_id,u.username,u.first_name,a.total_limited,a.total_temp_blocks,a.abuse_score,
             a.last_action,a.last_decision,a.last_reason,a.last_event_at,c.blocked_at,c.blocked_reason
      FROM anti_abuse_user_stats a
      LEFT JOIN users u ON u.telegram_id=a.user_id
      LEFT JOIN user_admin_controls c ON c.user_id=a.user_id
      WHERE a.last_event_at>=?
      ORDER BY a.abuse_score DESC,a.total_limited DESC,a.last_event_at DESC
      LIMIT 80
    `).bind(since).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT e.id,e.user_id,u.username,u.first_name,e.action,e.decision,e.reason,e.hits,e.window_seconds,e.created_at
      FROM anti_abuse_events e
      LEFT JOIN users u ON u.telegram_id=e.user_id
      WHERE e.created_at>=?
      ORDER BY e.id DESC LIMIT 120
    `).bind(since).all<Record<string, unknown>>(),
  ]);
  return miniAppJson({ days, since, summary: summary || {}, reasons: reasons.results, users: users.results, recent: recent.results });
}

async function assetSecurityReport(url: URL, env: Env): Promise<Response> {
  const status = String(url.searchParams.get('status') || '').trim().slice(0, 32);
  const where = status ? 'WHERE a.scan_status=?' : '';
  const args = status ? [status] : [];
  const [summary, assets, cache] = await Promise.all([
    env.DB.prepare(`
      SELECT scan_status,COUNT(*) AS count,SUM(size_bytes) AS bytes
      FROM publication_assets GROUP BY scan_status ORDER BY count DESC
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT a.id,a.publication_id,a.file_name,a.mime_type,a.detected_mime,a.size_bytes,a.sha256,
             a.scan_status,a.scan_engine,a.scan_engine_version,a.scan_signatures_version,
             a.scan_threat_name,a.scanned_at,a.scan_error,
             COALESCE(NULLIF(s.title,''),NULLIF(p.internal_title,''),'Release #'||p.id) AS publication_title
      FROM publication_assets a
      JOIN publications p ON p.id=a.publication_id
      LEFT JOIN submissions s ON s.id=p.submission_id
      ${where}
      ORDER BY COALESCE(a.scanned_at,a.created_at) DESC,a.id DESC LIMIT 120
    `).bind(...args).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT verdict,COUNT(*) AS count,MAX(scanned_at) AS last_scan
      FROM file_scan_cache GROUP BY verdict ORDER BY count DESC
    `).all<Record<string, unknown>>(),
  ]);
  return miniAppJson({ status: status || null, summary: summary.results, assets: assets.results, scan_cache: cache.results });
}

function safeOffset(url: URL): number {
  const value = Number(url.searchParams.get('offset') || 0);
  return Number.isSafeInteger(value) ? Math.max(0, Math.min(100_000, value)) : 0;
}

function safeDays(url: URL): number {
  const value = Number(url.searchParams.get('days') || 7);
  return [1, 7, 30, 90].includes(value) ? value : 7;
}

function emptyReaderStats(publicationId: number) {
  return {
    publication_id: publicationId,
    thank_you_clicks: 0,
    unique_clickers: 0,
    delivery_successes: 0,
    unique_readers: 0,
    repeat_deliveries: 0,
    delivery_failures: 0,
    access_denied: 0,
    rate_limited: 0,
    donate_clicks: 0,
  };
}
