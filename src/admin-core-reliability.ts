import { evaluateAccessPolicy } from './access-policy';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { collectSecurityFindings } from './production-alerts';
import { recentUserSecurityEvents } from './security-events';
import { TelegramClient } from './telegram';

export async function handleAdminCoreReliabilityRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const dashboard = url.pathname === '/api/app/admin/security/core-reliability';
  const userMatch = /^\/api\/app\/admin\/users\/(\d+)\/security-timeline$/.exec(url.pathname);
  if ((!dashboard && !userMatch) || request.method !== 'GET') return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (dashboard) return reliabilityDashboard(env);
  return userSecurityTimeline(Number(userMatch![1]), env);
}

async function reliabilityDashboard(env: Env): Promise<Response> {
  const [findings, alerts, entitlement, events] = await Promise.all([
    collectSecurityFindings(env),
    env.DB.prepare(`SELECT alert_key,status,last_fired_at,last_value,updated_at FROM incident_alert_state ORDER BY updated_at DESC LIMIT 40`)
      .all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] })),
    env.DB.prepare(`
      SELECT
        COUNT(*) AS cached,
        SUM(CASE WHEN subscriber=1 THEN 1 ELSE 0 END) AS positive,
        SUM(CASE WHEN verification_error=1 THEN 1 ELSE 0 END) AS errors,
        SUM(CASE WHEN expires_at>datetime('now') THEN 1 ELSE 0 END) AS fresh
      FROM subscription_entitlement_cache
    `).first<Record<string, number>>().catch(() => null),
    env.DB.prepare(`
      SELECT id,user_id,event_type,severity,source,metadata_json,created_at
      FROM security_events ORDER BY id DESC LIMIT 60
    `).all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] })),
  ]);

  const penalty = findings.reduce((sum, finding) => sum + (finding.severity === 'critical' ? 20 : 8), 0);
  return miniAppJson({
    score: Math.max(0, 100 - penalty),
    status: findings.some((f) => f.severity === 'critical') ? 'critical' : findings.length ? 'warning' : 'healthy',
    findings,
    alerts: alerts.results,
    entitlement_cache: {
      cached: Number(entitlement?.cached || 0),
      positive: Number(entitlement?.positive || 0),
      errors: Number(entitlement?.errors || 0),
      fresh: Number(entitlement?.fresh || 0),
    },
    recent_security_events: events.results,
  });
}

async function userSecurityTimeline(userId: number, env: Env): Promise<Response> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return miniAppJsonError('invalid_user', 'Invalid user id.', 400);
  const user = await env.DB.prepare(`
    SELECT telegram_id,username,first_name,country_code,country_verified_at,country_source,last_seen_at
    FROM users WHERE telegram_id=?
  `).bind(userId).first<Record<string, unknown>>();
  if (!user) return miniAppJsonError('not_found', 'User not found.', 404);

  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);
  const [policy, events, leave, deliveries, abuse] = await Promise.all([
    evaluateAccessPolicy(userId, env, telegram),
    recentUserSecurityEvents(env, userId, 100),
    env.DB.prepare(`
      SELECT status,leave_count,left_at,banned_at,unbanned_at,exemption_reason,last_error,updated_at
      FROM channel_leave_auto_bans WHERE user_id=? ORDER BY left_at DESC LIMIT 10
    `).bind(userId).all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] })),
    env.DB.prepare(`
      SELECT publication_id,asset_id,status,attempts,last_requested_at,delivered_at,last_error
      FROM publication_deliveries WHERE user_id=? ORDER BY last_requested_at DESC LIMIT 30
    `).bind(userId).all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] })),
    env.DB.prepare(`
      SELECT action,decision,reason,hits,window_seconds,created_at
      FROM anti_abuse_events WHERE user_id=? ORDER BY id DESC LIMIT 30
    `).bind(userId).all<Record<string, unknown>>().catch(() => ({ results: [] as Record<string, unknown>[] })),
  ]);

  return miniAppJson({ user, policy, security_events: events, channel_leave: leave.results, deliveries: deliveries.results, abuse: abuse.results });
}
