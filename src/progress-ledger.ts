import type { SubmissionRow } from './domain';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

type ProgressEventKind = 'baseline' | 'admin_progress' | 'completed' | 'reopened' | 'publication_release';
type AdminProgressAction = 'progress' | 'complete' | 'reopen' | string;

type ProgressEventRow = {
  id: number;
  submission_id: number;
  from_chapter: number | null;
  to_chapter: number | null;
  event_kind: ProgressEventKind;
  publication_id: number | null;
  admin_user_id: number | null;
  metadata_json: string | null;
  created_at: string;
};

type PublicationProgressRow = {
  id: number;
  submission_id: number | null;
  status: string;
  chapter_start: number | null;
  chapter_end: number | null;
  published_at: string | null;
};

export async function handleProgressLedgerRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/app/progress-history') return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  const submissionId = positiveId(url.searchParams.get('submission_id'));
  if (!submissionId) return miniAppJsonError('invalid_submission', 'Invalid request ID.', 400);

  const submission = await env.DB.prepare('SELECT id,user_id,status FROM submissions WHERE id=?')
    .bind(submissionId)
    .first<{ id: number; user_id: number; status: string }>();
  if (!submission) return miniAppJsonError('not_found', 'Request not found.', 404);
  if (submission.status !== 'accepted' && submission.user_id !== auth.telegramUser.id && !auth.admin) {
    return miniAppJsonError('forbidden', 'You cannot view this progress history.', 403);
  }

  const rows = await env.DB.prepare(`
    SELECT id,submission_id,from_chapter,to_chapter,event_kind,publication_id,admin_user_id,metadata_json,created_at
    FROM submission_progress_events
    WHERE submission_id=?
    ORDER BY id DESC
    LIMIT 100
  `).bind(submissionId).all<ProgressEventRow>();

  return miniAppJson({
    submission_id: submissionId,
    events: rows.results.reverse().map((row) => ({
      ...row,
      metadata: parseObject(row.metadata_json),
      metadata_json: undefined,
    })),
  });
}

export async function recordAdminProgressEvent(
  env: Env,
  before: SubmissionRow,
  after: SubmissionRow,
  action: AdminProgressAction,
  adminUserId: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const kind = adminEventKind(action);
  if (!kind) return;
  const fromChapter = nullableChapter(before.current_chapter);
  const toChapter = nullableChapter(after.current_chapter);
  if (kind === 'admin_progress' && fromChapter === toChapter) return;

  await insertProgressEvent(env, {
    submissionId: after.id,
    fromChapter,
    toChapter,
    kind,
    publicationId: null,
    adminUserId,
    metadata: {
      queue_status_before: before.queue_status,
      queue_status_after: after.queue_status,
      ...(metadata || {}),
    },
    createdAt: new Date().toISOString(),
  });
}

export async function syncPublishedReleaseProgress(
  env: Env,
  publicationId: number,
  now = new Date(),
): Promise<{
  publication_id: number;
  submission_id: number | null;
  recorded: boolean;
  progress_updated: boolean;
  from_chapter: number | null;
  to_chapter: number | null;
}> {
  const publication = await env.DB.prepare(`
    SELECT id,submission_id,status,chapter_start,chapter_end,published_at
    FROM publications WHERE id=?
  `).bind(publicationId).first<PublicationProgressRow>();

  if (!publication || publication.status !== 'published' || !publication.submission_id || !positiveChapter(publication.chapter_end)) {
    return {
      publication_id: publicationId,
      submission_id: publication?.submission_id ?? null,
      recorded: false,
      progress_updated: false,
      from_chapter: null,
      to_chapter: null,
    };
  }

  const submission = await env.DB.prepare(`
    SELECT id,status,queue_status,current_chapter,chapter_count
    FROM submissions WHERE id=?
  `).bind(publication.submission_id).first<{
    id: number;
    status: string;
    queue_status: string | null;
    current_chapter: number | null;
    chapter_count: number;
  }>();
  if (!submission) {
    return {
      publication_id: publicationId,
      submission_id: publication.submission_id,
      recorded: false,
      progress_updated: false,
      from_chapter: null,
      to_chapter: null,
    };
  }

  const fromChapter = nullableChapter(submission.current_chapter);
  const releaseEnd = Number(publication.chapter_end);
  let progressUpdated = false;
  let resultingChapter = fromChapter;
  const nowIso = now.toISOString();

  if (submission.status === 'accepted' && submission.queue_status === 'in_progress') {
    const current = Math.max(0, Number(submission.current_chapter ?? 0));
    if (releaseEnd > current) {
      const updated = await env.DB.prepare(`
        UPDATE submissions
        SET current_chapter=?,
            chapter_count=CASE WHEN chapter_count<? THEN ? ELSE chapter_count END,
            progress_updated_at=?,updated_at=?
        WHERE id=? AND status='accepted' AND queue_status='in_progress'
          AND COALESCE(current_chapter,0)<?
      `).bind(releaseEnd, releaseEnd, releaseEnd, nowIso, nowIso, submission.id, releaseEnd).run();
      progressUpdated = Number(updated.meta.changes ?? 0) === 1;
      if (progressUpdated) resultingChapter = releaseEnd;
    }
  }

  await env.DB.prepare(`
    INSERT INTO submission_progress_events (
      submission_id,from_chapter,to_chapter,event_kind,publication_id,admin_user_id,metadata_json,created_at
    ) VALUES (?,?,?,'publication_release',?,NULL,?,?)
    ON CONFLICT(publication_id,event_kind) DO UPDATE SET
      submission_id=excluded.submission_id,
      from_chapter=excluded.from_chapter,
      to_chapter=excluded.to_chapter,
      metadata_json=excluded.metadata_json
  `).bind(
    submission.id,
    fromChapter,
    releaseEnd,
    publication.id,
    JSON.stringify({
      chapter_start: publication.chapter_start,
      chapter_end: publication.chapter_end,
      progress_advanced: progressUpdated,
      queue_status: submission.queue_status,
    }),
    publication.published_at || nowIso,
  ).run();

  return {
    publication_id: publication.id,
    submission_id: submission.id,
    recorded: true,
    progress_updated: progressUpdated,
    from_chapter: fromChapter,
    to_chapter: progressUpdated ? resultingChapter : releaseEnd,
  };
}

export async function progressBeforeLatestCompletion(
  env: Env,
  submissionId: number,
  chapterCount: number,
): Promise<{ currentChapter: number | null; progressUpdatedAt: string | null } | null> {
  const row = await env.DB.prepare(`
    SELECT from_chapter,created_at
    FROM submission_progress_events
    WHERE submission_id=? AND event_kind='completed'
    ORDER BY id DESC
    LIMIT 1
  `).bind(submissionId).first<{ from_chapter: number | null; created_at: string }>();
  if (!row) return null;
  const chapter = nullableChapter(row.from_chapter);
  if (chapter !== null && chapter > chapterCount) return null;
  return { currentChapter: chapter, progressUpdatedAt: row.created_at || null };
}

async function insertProgressEvent(
  env: Env,
  input: {
    submissionId: number;
    fromChapter: number | null;
    toChapter: number | null;
    kind: ProgressEventKind;
    publicationId: number | null;
    adminUserId: number | null;
    metadata: Record<string, unknown>;
    createdAt: string;
  },
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO submission_progress_events (
      submission_id,from_chapter,to_chapter,event_kind,publication_id,admin_user_id,metadata_json,created_at
    ) VALUES (?,?,?,?,?,?,?,?)
  `).bind(
    input.submissionId,
    input.fromChapter,
    input.toChapter,
    input.kind,
    input.publicationId,
    input.adminUserId,
    JSON.stringify(input.metadata),
    input.createdAt,
  ).run();
}

function adminEventKind(action: AdminProgressAction): ProgressEventKind | null {
  if (action === 'progress') return 'admin_progress';
  if (action === 'complete') return 'completed';
  if (action === 'reopen') return 'reopened';
  return null;
}

function nullableChapter(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const chapter = Number(value);
  return Number.isInteger(chapter) && chapter >= 0 ? chapter : null;
}

function positiveChapter(value: unknown): number | null {
  const chapter = Number(value);
  return Number.isSafeInteger(chapter) && chapter > 0 ? chapter : null;
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseObject(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}
