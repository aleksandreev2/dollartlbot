import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

export async function handleSourceWatchReviewRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const isStatus = request.method === 'GET' && url.pathname === '/api/app/admin/source-watch/status';
  const isAcknowledge = request.method === 'POST' && url.pathname === '/api/app/admin/source-watch/acknowledge';
  if (!isStatus && !isAcknowledge) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (isAcknowledge) {
    const body = await readJson<{ submission_id?: unknown }>(request);
    const submissionId = positiveId(body.submission_id);
    if (!submissionId) return miniAppJsonError('invalid_submission', 'Invalid request ID.', 400);

    const exists = await env.DB.prepare(`
      SELECT s.id,s.title
      FROM submissions s
      JOIN submission_source_watch w ON w.submission_id=s.id
      WHERE s.id=?
    `).bind(submissionId).first<{ id: number; title: string }>();
    if (!exists) return miniAppJsonError('not_watchable', 'Source watch is not enabled for this request.', 404);

    const now = new Date().toISOString();
    const reviewed = await env.DB.prepare(`
      UPDATE submission_source_events
      SET reviewed_at=?,reviewed_by=?
      WHERE submission_id=? AND action='review_required' AND reviewed_at IS NULL
    `).bind(now, auth.telegramUser.id, submissionId).run();
    const count = Number(reviewed.meta.changes ?? 0);

    await env.DB.prepare(`
      INSERT INTO admin_audit_log (admin_user_id,action,target_type,target_id,details,created_at)
      VALUES (?,'source_watch_acknowledged','submission',?,?,?)
    `).bind(
      auth.telegramUser.id,
      String(submissionId),
      JSON.stringify({ reviewed_events: count }),
      now,
    ).run().catch(() => undefined);

    return miniAppJson({ ok: true, submission_id: submissionId, reviewed_events: count, ...(await statusPayload(env, submissionId)) });
  }

  const submissionId = positiveId(url.searchParams.get('submission_id'));
  if (url.searchParams.has('submission_id') && !submissionId) {
    return miniAppJsonError('invalid_submission', 'Invalid request ID.', 400);
  }
  return miniAppJson(await statusPayload(env, submissionId));
}

async function statusPayload(env: Env, submissionId: number | null) {
  const now = new Date().toISOString();
  const summaryBinds = submissionId ? [now, submissionId] : [now];
  const rowBinds = submissionId ? [submissionId] : [];

  const [summary, rows, attention, ingest] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS watched,
        SUM(CASE WHEN w.next_check_at IS NULL OR w.next_check_at<=? THEN 1 ELSE 0 END) AS due,
        SUM(CASE WHEN w.last_error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
        SUM(CASE WHEN EXISTS (
          SELECT 1 FROM submission_source_events e
          WHERE e.submission_id=w.submission_id AND e.action='review_required' AND e.reviewed_at IS NULL
        ) THEN 1 ELSE 0 END) AS attention,
        MAX(w.last_success_at) AS last_success_at
      FROM submission_source_watch w
      ${submissionId ? 'WHERE w.submission_id=?' : ''}
    `).bind(...summaryBinds).first<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT
        w.submission_id,w.external_id,w.last_attempt_at,w.last_success_at,w.next_check_at,
        w.failure_count,w.last_error,w.last_remote_chapter_count,w.last_remote_publication_status,
        w.last_remote_title,w.last_change_at,
        s.title,s.chapter_count,s.publication_status,s.queue_status,s.current_chapter,
        (SELECT COUNT(*) FROM submission_source_events e
          WHERE e.submission_id=w.submission_id AND e.action='review_required' AND e.reviewed_at IS NULL) AS attention_count,
        (SELECT e.field_name FROM submission_source_events e
          WHERE e.submission_id=w.submission_id AND e.action='review_required' AND e.reviewed_at IS NULL
          ORDER BY e.id DESC LIMIT 1) AS attention_field,
        (SELECT e.old_value FROM submission_source_events e
          WHERE e.submission_id=w.submission_id AND e.action='review_required' AND e.reviewed_at IS NULL
          ORDER BY e.id DESC LIMIT 1) AS attention_old_value,
        (SELECT e.new_value FROM submission_source_events e
          WHERE e.submission_id=w.submission_id AND e.action='review_required' AND e.reviewed_at IS NULL
          ORDER BY e.id DESC LIMIT 1) AS attention_new_value,
        (SELECT e.created_at FROM submission_source_events e
          WHERE e.submission_id=w.submission_id AND e.action='review_required' AND e.reviewed_at IS NULL
          ORDER BY e.id DESC LIMIT 1) AS attention_created_at
      FROM submission_source_watch w
      JOIN submissions s ON s.id=w.submission_id
      ${submissionId ? 'WHERE w.submission_id=?' : ''}
      ORDER BY
        CASE WHEN EXISTS (
          SELECT 1 FROM submission_source_events e
          WHERE e.submission_id=w.submission_id AND e.action='review_required' AND e.reviewed_at IS NULL
        ) THEN 0 ELSE 1 END,
        COALESCE(w.last_change_at,w.last_success_at,w.updated_at) DESC,
        w.submission_id DESC
      LIMIT 250
    `).bind(...rowBinds).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT e.id,e.submission_id,e.field_name,e.old_value,e.new_value,e.metadata_json,e.created_at,s.title
      FROM submission_source_events e
      JOIN submissions s ON s.id=e.submission_id
      WHERE e.action='review_required' AND e.reviewed_at IS NULL
        ${submissionId ? 'AND e.submission_id=?' : ''}
      ORDER BY e.id DESC
      LIMIT 50
    `).bind(...rowBinds).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT provider,last_attempt_at,last_success_at,last_error,last_item_count,updated_at
      FROM discovery_ingest_state WHERE provider='novelpia_source_watch'
    `).first<Record<string, unknown>>(),
  ]);

  return {
    generated_at: now,
    summary: {
      watched: number(summary?.watched),
      due: number(summary?.due),
      errors: number(summary?.errors),
      attention: number(summary?.attention),
      last_success_at: summary?.last_success_at ?? null,
    },
    watches: rows.results,
    attention: attention.results.map((row) => ({
      ...row,
      metadata: parseObject(row.metadata_json),
      metadata_json: undefined,
    })),
    ingest: ingest || null,
  };
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; } catch { return {} as T; }
}
