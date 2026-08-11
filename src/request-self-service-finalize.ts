import { miniAppJson } from './miniapp-auth';

/**
 * Any successful requester-authored mutation of a pending request invalidates
 * an admin's previously viewed snapshot. Mark it as a fresh user update even
 * when the admin had not explicitly asked for more information yet. This keeps
 * Accept fail-closed until the team has reviewed the newest details / RAW.
 */
export async function finalizeRequestSelfServiceMutation(
  request: Request,
  response: Response,
  env: Env,
): Promise<Response> {
  if (!response.ok) return response;
  const url = new URL(request.url);
  const match = /^\/api\/app\/requests\/(\d+)\/(edit|raw|message)$/.exec(url.pathname);
  if (request.method !== 'POST' || !match) return response;
  const submissionId = Number(match[1]);
  if (!Number.isSafeInteger(submissionId) || submissionId <= 0) return response;

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE submissions
    SET review_state='user_replied', review_resolved_at=NULL, updated_at=?
    WHERE id=? AND status='pending' AND withdrawn_at IS NULL
  `).bind(now, submissionId).run();

  let payload: any;
  try {
    payload = await response.json();
  } catch {
    return response;
  }
  if (payload?.request && Number(payload.request.id) === submissionId) {
    payload.request = {
      ...payload.request,
      review_state: 'user_replied',
      review_resolved_at: null,
      updated_at: now,
    };
  }
  return miniAppJson(payload, response.status);
}
