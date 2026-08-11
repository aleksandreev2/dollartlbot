import {
  AdminStateError,
  applyAdminSubmissionAction,
  type AdminSubmissionAction,
} from './admin-state';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import type { TelegramClient } from './telegram';

const ACTIONS = new Set<AdminSubmissionAction>([
  'accept',
  'reject',
  'return',
  'start',
  'complete',
  'backqueue',
  'reopen',
  'progress',
  'up',
  'down',
]);

export async function handleAdminActionV2(
  request: Request,
  env: Env,
  telegram: TelegramClient,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/api/app/admin/action') return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  const body = await readJson<{ id?: number; action?: string; current_chapter?: number }>(request);
  const id = Number(body.id);
  const action = String(body.action ?? '') as AdminSubmissionAction;
  if (!Number.isSafeInteger(id) || id <= 0 || !ACTIONS.has(action)) {
    return miniAppJsonError('invalid_action', 'Invalid admin action.', 400);
  }

  if (action === 'accept') {
    const review = await env.DB.prepare(`
      SELECT COALESCE(review_state,'ready') AS review_state,withdrawn_at
      FROM submissions WHERE id=?
    `).bind(id).first<{ review_state: string; withdrawn_at: string | null }>();
    if (review?.withdrawn_at) {
      return miniAppJsonError('request_withdrawn', 'The requester withdrew this request.', 409);
    }
    if (review && review.review_state !== 'ready') {
      return miniAppJsonError(
        'review_unresolved',
        review.review_state === 'needs_info'
          ? 'This request is waiting for information from the requester.'
          : 'The requester replied. Review the new information and mark it reviewed before accepting.',
        409,
        { review_state: review.review_state },
      );
    }
  }

  try {
    const novel = await applyAdminSubmissionAction(env, telegram, id, action, {
      adminUserId: auth.telegramUser.id,
      currentChapter: body.current_chapter,
    });
    return miniAppJson({ ok: true, novel, counts: await counts(env) });
  } catch (error) {
    if (error instanceof AdminStateError) {
      return miniAppJsonError(error.code, error.message, error.status);
    }
    console.error(JSON.stringify({
      event: 'admin_submission_action_failed',
      admin_user_id: auth.telegramUser.id,
      submission_id: id,
      action,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }));
    return miniAppJsonError('temporary_error', 'Could not apply the admin action. Please try again.', 500);
  }
}

async function counts(env: Env) {
  const row = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,
      SUM(CASE WHEN status='accepted' AND queue_status='queued' THEN 1 ELSE 0 END) queued,
      SUM(CASE WHEN status='accepted' AND queue_status='in_progress' THEN 1 ELSE 0 END) in_progress,
      SUM(CASE WHEN status='accepted' AND queue_status='completed' THEN 1 ELSE 0 END) completed,
      COUNT(*) total
    FROM submissions
  `).first<Record<string, number>>();
  return {
    pending: Number(row?.pending ?? 0),
    queued: Number(row?.queued ?? 0),
    in_progress: Number(row?.in_progress ?? 0),
    completed: Number(row?.completed ?? 0),
    total: Number(row?.total ?? 0),
  };
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}
