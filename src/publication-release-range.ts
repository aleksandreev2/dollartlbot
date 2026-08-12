import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { syncPublishedReleaseProgress } from './progress-ledger';

type RangePayload = {
  chapter_start?: unknown;
  chapter_end?: unknown;
};

type RangeValue = {
  chapter_start: number | null;
  chapter_end: number | null;
};

const MAX_CHAPTER = 1_000_000;

export async function handlePublicationReleaseRangeRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  const draftPath = '/api/app/admin/publication-release-range/draft';
  const publicationMatch = /^\/api\/app\/admin\/publications\/(\d+)\/release-range$/.exec(url.pathname);
  if (url.pathname !== draftPath && !publicationMatch) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (url.pathname === draftPath && request.method === 'GET') {
    const draft = await env.DB.prepare(`
      SELECT chapter_start, chapter_end, updated_at
      FROM publication_release_range_drafts
      WHERE admin_user_id = ?
    `).bind(auth.telegramUser.id).first<{ chapter_start: number | null; chapter_end: number | null; updated_at: string }>();
    return miniAppJson({ draft: draft || null });
  }

  if (url.pathname === draftPath && request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM publication_release_range_drafts WHERE admin_user_id = ?')
      .bind(auth.telegramUser.id).run();
    return miniAppJson({ ok: true });
  }

  if (url.pathname === draftPath && request.method === 'POST') {
    const parsed = validateRange(await readJson<RangePayload>(request));
    if (parsed instanceof Response) return parsed;
    if (!parsed.chapter_start || !parsed.chapter_end) {
      await env.DB.prepare('DELETE FROM publication_release_range_drafts WHERE admin_user_id = ?')
        .bind(auth.telegramUser.id).run();
      return miniAppJson({ ok: true, draft: null });
    }
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO publication_release_range_drafts (admin_user_id, chapter_start, chapter_end, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(admin_user_id) DO UPDATE SET
        chapter_start = excluded.chapter_start,
        chapter_end = excluded.chapter_end,
        updated_at = excluded.updated_at
    `).bind(auth.telegramUser.id, parsed.chapter_start, parsed.chapter_end, now).run();
    return miniAppJson({ ok: true, draft: { ...parsed, updated_at: now } });
  }

  if (publicationMatch && request.method === 'POST') {
    const id = Number(publicationMatch[1]);
    const publication = await env.DB.prepare('SELECT id, status FROM publications WHERE id = ?')
      .bind(id).first<{ id: number; status: string }>();
    if (!publication) return miniAppJsonError('not_found', 'Publication not found.', 404);
    const parsed = validateRange(await readJson<RangePayload>(request));
    if (parsed instanceof Response) return parsed;
    await env.DB.prepare(`
      UPDATE publications
      SET chapter_start = ?, chapter_end = ?, updated_at = ?
      WHERE id = ?
    `).bind(parsed.chapter_start, parsed.chapter_end, new Date().toISOString(), id).run();

    const progressSync = publication.status === 'published' && parsed.chapter_end
      ? await syncPublishedReleaseProgress(env, id)
      : null;
    return miniAppJson({ ok: true, publication_id: id, ...parsed, progress_sync: progressSync });
  }

  return miniAppJsonError('not_found', 'Release range route not found.', 404);
}

function validateRange(body: RangePayload): RangeValue | Response {
  const start = optionalChapter(body.chapter_start);
  const end = optionalChapter(body.chapter_end);
  if (start === 'invalid' || end === 'invalid') {
    return miniAppJsonError('invalid_chapter_range', `Chapter numbers must be integers between 1 and ${MAX_CHAPTER}.`, 400);
  }
  if ((start === null) !== (end === null)) {
    return miniAppJsonError('incomplete_chapter_range', 'Enter both the first and last chapter, or leave both empty.', 400);
  }
  if (start !== null && end !== null && end < start) {
    return miniAppJsonError('invalid_chapter_range', 'The last chapter cannot be lower than the first chapter.', 400);
  }
  return { chapter_start: start, chapter_end: end };
}

function optionalChapter(value: unknown): number | null | 'invalid' {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 1 && number <= MAX_CHAPTER ? number : 'invalid';
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}
