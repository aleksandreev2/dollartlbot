import { authenticateMiniAppRequest, miniAppJsonError } from './miniapp-auth';

type RequestMutationGuard = {
  submissionId: number;
  userId: number;
  previousReviewState: 'ready' | 'needs_info' | 'user_replied';
  previousReviewResolvedAt: string | null;
  previousUpdatedAt: string;
};

type GuardRow = {
  id: number;
  user_id: number;
  status: string;
  review_state: 'ready' | 'needs_info' | 'user_replied';
  review_resolved_at: string | null;
  withdrawn_at: string | null;
  updated_at: string;
};

/**
 * Marks a pending request as containing unreviewed requester changes before the
 * edit / RAW / message handler starts. The lock is intentionally placed after
 * Telegram authentication and owner verification, but before multipart parsing
 * or Telegram file transfer. Admin Accept also checks review_state in its UPDATE,
 * so a stale admin screen cannot win a race against a requester mutation.
 */
export async function prepareRequestSelfServiceMutation(
  request: Request,
  env: Env,
): Promise<RequestMutationGuard | Response | null> {
  const match = mutationMatch(request);
  if (!match) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  const submissionId = Number(match[1]);
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
    return miniAppJsonError('invalid_request', 'Invalid request ID.', 400);
  }

  const row = await env.DB.prepare(`
    SELECT id,user_id,status,COALESCE(review_state,'ready') AS review_state,
           review_resolved_at,withdrawn_at,updated_at
    FROM submissions
    WHERE id=?
  `).bind(submissionId).first<GuardRow>();
  if (!row || row.user_id !== auth.telegramUser.id) {
    return miniAppJsonError('not_found', 'Request not found.', 404);
  }
  if (row.status !== 'pending' || row.withdrawn_at) {
    return null;
  }

  const guard: RequestMutationGuard = {
    submissionId,
    userId: auth.telegramUser.id,
    previousReviewState: row.review_state,
    previousReviewResolvedAt: row.review_resolved_at,
    previousUpdatedAt: row.updated_at,
  };

  const locked = await env.DB.prepare(`
    UPDATE submissions
    SET review_state='user_replied',review_resolved_at=NULL
    WHERE id=? AND user_id=? AND status='pending' AND withdrawn_at IS NULL
      AND updated_at=?
  `).bind(submissionId, guard.userId, guard.previousUpdatedAt).run();
  if (Number(locked.meta.changes ?? 0) !== 1) {
    return miniAppJsonError(
      'stale_request',
      'This request changed before your update started. Reopen it and try again.',
      409,
    );
  }
  return guard;
}

/**
 * A successful mutation keeps the fail-closed user_replied state. If validation,
 * upload, or another pre-write step failed, restore the previous review state
 * only when updated_at proves that the actual request payload never changed.
 */
export async function finalizeRequestSelfServiceMutation(
  request: Request,
  response: Response,
  env: Env,
  guard: RequestMutationGuard | null,
): Promise<Response> {
  if (!guard || !mutationMatch(request) || response.ok) return response;

  await env.DB.prepare(`
    UPDATE submissions
    SET review_state=?,review_resolved_at=?
    WHERE id=? AND user_id=? AND status='pending' AND withdrawn_at IS NULL
      AND updated_at=? AND review_state='user_replied'
  `).bind(
    guard.previousReviewState,
    guard.previousReviewResolvedAt,
    guard.submissionId,
    guard.userId,
    guard.previousUpdatedAt,
  ).run();
  return response;
}

function mutationMatch(request: Request): RegExpExecArray | null {
  if (request.method !== 'POST') return null;
  return /^\/api\/app\/requests\/(\d+)\/(edit|raw|message)$/.exec(new URL(request.url).pathname);
}
