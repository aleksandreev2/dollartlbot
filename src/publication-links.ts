import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

export async function handlePublicationLinksRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const linkMatch = /^\/api\/app\/admin\/publications\/(\d+)\/link-request$/.exec(url.pathname);
  const isList = request.method === 'GET' && url.pathname === '/api/app/admin/publication-links';
  const isLink = request.method === 'POST' && Boolean(linkMatch);
  if (!isList && !isLink) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (isList) {
    const rows = await env.DB.prepare(`
      SELECT s.id, s.title, s.queue_status, s.current_chapter, s.chapter_count,
             COALESCE(NULLIF(u.username,''), NULLIF(s.username_snapshot,'')) AS requester_username,
             u.first_name
      FROM submissions s
      LEFT JOIN users u ON u.telegram_id = s.user_id
      WHERE s.status = 'accepted'
      ORDER BY
        CASE s.queue_status
          WHEN 'in_progress' THEN 0
          WHEN 'completed' THEN 1
          WHEN 'queued' THEN 2
          ELSE 3
        END,
        s.id DESC
      LIMIT 250
    `).all<Record<string, unknown>>();
    return miniAppJson({ requests: rows.results });
  }

  const publicationId = Number(linkMatch![1]);
  if (!Number.isSafeInteger(publicationId) || publicationId <= 0) {
    return miniAppJsonError('invalid_publication', 'Invalid publication.', 400);
  }

  let body: { submission_id?: number | null } = {};
  try {
    body = await request.json() as { submission_id?: number | null };
  } catch {
    return miniAppJsonError('bad_request', 'Invalid request body.', 400);
  }

  const publication = await env.DB.prepare(
    'SELECT id,status FROM publications WHERE id=?',
  ).bind(publicationId).first<{ id: number; status: string }>();
  if (!publication) return miniAppJsonError('not_found', 'Publication not found.', 404);
  if (publication.status !== 'draft' && publication.status !== 'failed') {
    return miniAppJsonError('invalid_state', 'Only a draft publication can be linked to a request.', 409);
  }

  if (body.submission_id == null) {
    await env.DB.prepare(`
      UPDATE publications
      SET submission_id=NULL, requester_username_snapshot=NULL, updated_at=?
      WHERE id=?
    `).bind(new Date().toISOString(), publicationId).run();
    return miniAppJson({ ok: true, submission_id: null, requester_username: null });
  }

  const submissionId = Number(body.submission_id);
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
    return miniAppJsonError('invalid_submission', 'Invalid request link.', 400);
  }

  const submission = await env.DB.prepare(`
    SELECT s.id, s.status,
           COALESCE(NULLIF(u.username,''), NULLIF(s.username_snapshot,'')) AS requester_username
    FROM submissions s
    LEFT JOIN users u ON u.telegram_id = s.user_id
    WHERE s.id=?
  `).bind(submissionId).first<{ id: number; status: string; requester_username: string | null }>();
  if (!submission) return miniAppJsonError('submission_not_found', 'Request not found.', 404);
  if (submission.status !== 'accepted') {
    return miniAppJsonError('submission_not_publishable', 'Only an accepted request can be linked to a publication.', 409);
  }

  const username = cleanUsername(submission.requester_username);
  await env.DB.prepare(`
    UPDATE publications
    SET submission_id=?, requester_username_snapshot=?, updated_at=?
    WHERE id=?
  `).bind(submissionId, username || null, new Date().toISOString(), publicationId).run();

  return miniAppJson({
    ok: true,
    submission_id: submissionId,
    requester_username: username || null,
  });
}

function cleanUsername(value: string | null): string {
  const raw = String(value || '').trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{5,32}$/.test(raw) ? raw : '';
}
