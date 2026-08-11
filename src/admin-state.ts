import { getSubmission } from './db';
import { notifySubmissionStatus, resetProgressNotificationState, type RequestNotificationKind } from './notifications';
import { normalizeQueuePositions } from './queue';
import { notifySubmissionFollowers, type FollowLifecycleKind } from './title-following';
import type { SubmissionRow } from './domain';
import type { TelegramClient } from './telegram';

export type AdminSubmissionAction =
  | 'accept'
  | 'reject'
  | 'return'
  | 'start'
  | 'complete'
  | 'backqueue'
  | 'reopen'
  | 'progress'
  | 'up'
  | 'down';

export class AdminStateError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = 'AdminStateError';
  }
}

type ApplyOptions = {
  adminUserId: number;
  currentChapter?: number;
};

type StateSnapshot = {
  status: string;
  slot_returned: number;
  queue_status: string | null;
  queue_position: number | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  current_chapter: number | null;
  progress_updated_at: string | null;
};

export async function applyAdminSubmissionAction(
  env: Env,
  telegram: TelegramClient,
  submissionId: number,
  action: AdminSubmissionAction,
  options: ApplyOptions,
): Promise<SubmissionRow> {
  const before = await getSubmission(env, submissionId);
  if (!before) throw new AdminStateError('not_found', 'Request not found.', 404);

  const now = new Date().toISOString();
  let changed = false;
  let normalizeQueue = false;
  let notification: RequestNotificationKind | null = null;
  let auditMeta: Record<string, unknown> | undefined;

  switch (action) {
    case 'accept': {
      requireState(before.status === 'pending', 'Request is no longer pending.');
      requireState(
        (before.review_state ?? 'ready') === 'ready' && !before.withdrawn_at,
        'Review the requester’s latest information before accepting this request.',
      );
      const result = await env.DB.prepare(`
        UPDATE submissions
        SET status='accepted',
            queue_status='queued',
            queue_position=(
              SELECT COALESCE(MAX(queue_position),0)+1
              FROM submissions
              WHERE status='accepted' AND queue_status='queued'
            ),
            queued_at=COALESCE(queued_at,?),
            started_at=NULL,
            completed_at=NULL,
            current_chapter=NULL,
            progress_updated_at=NULL,
            updated_at=?
        WHERE id=? AND status='pending'
          AND COALESCE(review_state,'ready')='ready'
          AND withdrawn_at IS NULL
      `).bind(now, now, submissionId).run();
      changed = oneRow(result);
      normalizeQueue = true;
      notification = 'accepted';
      break;
    }

    case 'reject':
    case 'return': {
      requireState(before.status === 'pending', 'Request is no longer pending.');
      const returned = action === 'return' ? 1 : 0;
      const result = await env.DB.prepare(`
        UPDATE submissions
        SET status='rejected',
            slot_returned=?,
            queue_status=NULL,
            queue_position=NULL,
            queued_at=NULL,
            started_at=NULL,
            completed_at=NULL,
            current_chapter=NULL,
            progress_updated_at=NULL,
            updated_at=?
        WHERE id=? AND status='pending'
      `).bind(returned, now, submissionId).run();
      changed = oneRow(result);
      notification = returned ? 'rejected_returned' : 'rejected';
      break;
    }

    case 'start': {
      requireState(
        before.status === 'accepted' && before.queue_status === 'queued',
        'Only a queued request can be started.',
      );
      const result = await env.DB.prepare(`
        UPDATE submissions
        SET queue_status='in_progress',
            queue_position=NULL,
            started_at=COALESCE(started_at,?),
            completed_at=NULL,
            updated_at=?
        WHERE id=? AND status='accepted' AND queue_status='queued'
      `).bind(now, now, submissionId).run();
      changed = oneRow(result);
      if (changed) await resetProgressNotificationState(env, submissionId);
      normalizeQueue = true;
      notification = 'started';
      break;
    }

    case 'complete': {
      requireState(
        before.status === 'accepted' && before.queue_status === 'in_progress',
        'Only a translation that is currently in progress can be completed.',
      );
      const result = await env.DB.prepare(`
        UPDATE submissions
        SET queue_status='completed',
            queue_position=NULL,
            completed_at=?,
            current_chapter=chapter_count,
            progress_updated_at=?,
            updated_at=?
        WHERE id=? AND status='accepted' AND queue_status='in_progress'
      `).bind(now, now, now, submissionId).run();
      changed = oneRow(result);
      notification = 'completed';
      break;
    }

    case 'backqueue': {
      requireState(
        before.status === 'accepted' && before.queue_status === 'in_progress',
        'Only a translation that is currently in progress can be returned to the queue.',
      );
      const result = await env.DB.prepare(`
        UPDATE submissions
        SET queue_status='queued',
            queue_position=(
              SELECT COALESCE(MAX(queue_position),0)+1
              FROM submissions
              WHERE status='accepted' AND queue_status='queued'
            ),
            started_at=NULL,
            completed_at=NULL,
            updated_at=?
        WHERE id=? AND status='accepted' AND queue_status='in_progress'
      `).bind(now, submissionId).run();
      changed = oneRow(result);
      if (changed) await resetProgressNotificationState(env, submissionId);
      normalizeQueue = true;
      break;
    }

    case 'reopen': {
      requireState(
        before.status === 'accepted' && before.queue_status === 'completed',
        'Only a completed translation can be reopened.',
      );
      const restored = await previousProgressBeforeCompletion(env, submissionId, before.chapter_count);
      const result = await env.DB.prepare(`
        UPDATE submissions
        SET queue_status='in_progress',
            queue_position=NULL,
            completed_at=NULL,
            current_chapter=?,
            progress_updated_at=?,
            started_at=COALESCE(started_at,?),
            updated_at=?
        WHERE id=? AND status='accepted' AND queue_status='completed'
      `).bind(restored.currentChapter, restored.progressUpdatedAt, now, now, submissionId).run();
      changed = oneRow(result);
      if (changed) await resetProgressNotificationState(env, submissionId, restored.currentChapter);
      auditMeta = {
        restored_current_chapter: restored.currentChapter,
        restored_from_audit: restored.fromAudit,
      };
      break;
    }

    case 'progress': {
      requireState(
        before.status === 'accepted' && before.queue_status === 'in_progress',
        'Start the translation before setting progress.',
      );
      const chapter = Number(options.currentChapter);
      if (!Number.isInteger(chapter) || chapter < 0 || chapter > before.chapter_count) {
        throw new AdminStateError(
          'invalid_progress',
          `Current chapter must be between 0 and ${before.chapter_count}.`,
          400,
        );
      }
      if (before.current_chapter === chapter) return before;
      const result = await env.DB.prepare(`
        UPDATE submissions
        SET current_chapter=?, progress_updated_at=?, updated_at=?
        WHERE id=? AND status='accepted' AND queue_status='in_progress'
      `).bind(chapter, now, now, submissionId).run();
      changed = oneRow(result);
      notification = 'progress';
      auditMeta = { requested_current_chapter: chapter };
      break;
    }

    case 'up':
    case 'down': {
      requireState(
        before.status === 'accepted' && before.queue_status === 'queued',
        'Only queued requests can be reordered.',
      );
      changed = await moveQueueItem(env, submissionId, action === 'up' ? -1 : 1, now);
      normalizeQueue = changed;
      break;
    }
  }

  if (!changed) {
    if (action === 'up' || action === 'down') return before;
    throw new AdminStateError(
      'stale_state',
      'The request changed before this action was applied. Refresh the admin page and try again.',
      409,
    );
  }

  if (normalizeQueue) await normalizeQueuePositions(env);

  const after = await getSubmission(env, submissionId);
  if (!after) throw new AdminStateError('not_found', 'Request disappeared after the update.', 500);

  await writeAudit(env, options.adminUserId, action, submissionId, before, after, auditMeta);

  if (notification) {
    await notifySubmissionStatus(env, telegram, submissionId, notification);
    if (['accepted', 'started', 'completed', 'progress'].includes(notification)) {
      await notifySubmissionFollowers(env, telegram, submissionId, notification as FollowLifecycleKind);
    }
  }

  return after;
}

function requireState(ok: boolean, message: string): void {
  if (!ok) throw new AdminStateError('invalid_state', message, 409);
}

function oneRow(result: D1Result<unknown>): boolean {
  return Number(result.meta.changes ?? 0) === 1;
}

function snapshot(row: SubmissionRow): StateSnapshot {
  return {
    status: row.status,
    slot_returned: row.slot_returned,
    queue_status: row.queue_status,
    queue_position: row.queue_position,
    queued_at: row.queued_at,
    started_at: row.started_at,
    completed_at: row.completed_at,
    current_chapter: row.current_chapter,
    progress_updated_at: row.progress_updated_at,
  };
}

async function writeAudit(
  env: Env,
  adminUserId: number,
  action: AdminSubmissionAction,
  submissionId: number,
  before: SubmissionRow,
  after: SubmissionRow,
  meta?: Record<string, unknown>,
): Promise<void> {
  const details = JSON.stringify({
    before: snapshot(before),
    after: snapshot(after),
    ...(meta ? { meta } : {}),
  });
  await env.DB.prepare(`
    INSERT INTO admin_audit_log (
      admin_user_id, action, target_type, target_id, details, created_at
    ) VALUES (?, ?, 'submission', ?, ?, ?)
  `).bind(
    adminUserId,
    `submission_${action}`,
    String(submissionId),
    details,
    new Date().toISOString(),
  ).run();
}

async function previousProgressBeforeCompletion(
  env: Env,
  submissionId: number,
  chapterCount: number,
): Promise<{ currentChapter: number | null; progressUpdatedAt: string | null; fromAudit: boolean }> {
  const row = await env.DB.prepare(`
    SELECT details
    FROM admin_audit_log
    WHERE target_type='submission'
      AND target_id=?
      AND action='submission_complete'
    ORDER BY id DESC
    LIMIT 1
  `).bind(String(submissionId)).first<{ details: string | null }>();

  if (!row?.details) return { currentChapter: null, progressUpdatedAt: null, fromAudit: false };

  try {
    const parsed = JSON.parse(row.details) as {
      before?: { current_chapter?: unknown; progress_updated_at?: unknown };
    };
    const rawChapter = parsed.before?.current_chapter;
    const chapter = rawChapter === null || rawChapter === undefined ? null : Number(rawChapter);
    const validChapter = chapter === null
      ? null
      : Number.isInteger(chapter) && chapter >= 0 && chapter <= chapterCount
        ? chapter
        : null;
    const progressUpdatedAt = typeof parsed.before?.progress_updated_at === 'string'
      ? parsed.before.progress_updated_at
      : null;
    return { currentChapter: validChapter, progressUpdatedAt, fromAudit: true };
  } catch {
    return { currentChapter: null, progressUpdatedAt: null, fromAudit: false };
  }
}

async function moveQueueItem(
  env: Env,
  submissionId: number,
  direction: -1 | 1,
  now: string,
): Promise<boolean> {
  const current = await env.DB.prepare(`
    SELECT queue_position
    FROM submissions
    WHERE id=? AND status='accepted' AND queue_status='queued'
  `).bind(submissionId).first<{ queue_position: number | null }>();
  if (!current?.queue_position) return false;

  const operator = direction < 0 ? '<' : '>';
  const order = direction < 0 ? 'DESC' : 'ASC';
  const adjacent = await env.DB.prepare(`
    SELECT id, queue_position
    FROM submissions
    WHERE status='accepted'
      AND queue_status='queued'
      AND queue_position ${operator} ?
    ORDER BY queue_position ${order}, id ${order}
    LIMIT 1
  `).bind(current.queue_position).first<{ id: number; queue_position: number }>();
  if (!adjacent) return false;

  const temp = -submissionId;
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE submissions
      SET queue_position=?, updated_at=?
      WHERE id=? AND status='accepted' AND queue_status='queued' AND queue_position=?
    `).bind(temp, now, submissionId, current.queue_position),
    env.DB.prepare(`
      UPDATE submissions
      SET queue_position=?, updated_at=?
      WHERE id=? AND status='accepted' AND queue_status='queued' AND queue_position=?
    `).bind(current.queue_position, now, adjacent.id, adjacent.queue_position),
    env.DB.prepare(`
      UPDATE submissions
      SET queue_position=?, updated_at=?
      WHERE id=? AND status='accepted' AND queue_status='queued' AND queue_position=?
    `).bind(adjacent.queue_position, now, submissionId, temp),
  ]);

  return results.length === 3 && results.every((result) => Number(result.meta.changes ?? 0) === 1);
}
