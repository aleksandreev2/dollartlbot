import { errorText } from './db';

export type SecuritySeverity = 'info' | 'warning' | 'critical';

export async function recordSecurityEvent(
  env: Env,
  eventType: string,
  source: string,
  options: {
    userId?: number | null;
    severity?: SecuritySeverity;
    metadata?: Record<string, unknown> | null;
    createdAt?: string;
  } = {},
): Promise<void> {
  const event = String(eventType || '').trim().slice(0, 80);
  const eventSource = String(source || '').trim().slice(0, 60);
  if (!event || !eventSource) return;
  try {
    await env.DB.prepare(`
      INSERT INTO security_events(user_id,event_type,severity,source,metadata_json,created_at)
      VALUES (?,?,?,?,?,?)
    `).bind(
      options.userId ?? null,
      event,
      options.severity ?? 'info',
      eventSource,
      options.metadata ? JSON.stringify(options.metadata).slice(0, 3000) : null,
      options.createdAt ?? new Date().toISOString(),
    ).run();
  } catch (error) {
    console.warn(JSON.stringify({ event: 'security_event_write_failed', type: event, error: errorText(error) }));
  }
}

export async function recentUserSecurityEvents(env: Env, userId: number, limit = 80) {
  try {
    const rows = await env.DB.prepare(`
      SELECT id,event_type,severity,source,metadata_json,created_at
      FROM security_events
      WHERE user_id=?
      ORDER BY id DESC LIMIT ?
    `).bind(userId, Math.max(1, Math.min(200, limit))).all<Record<string, unknown>>();
    return rows.results;
  } catch {
    return [];
  }
}
