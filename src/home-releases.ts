import { authenticateMiniAppRequest, miniAppJson } from './miniapp-auth';

type ReleaseRow = {
  id: number;
  submission_id: number | null;
  internal_title: string;
  body_html: string;
  image_key: string | null;
  channel_message_id: number | null;
  published_at: string | null;
  file_count: number;
  chapter_start: number | null;
  chapter_end: number | null;
};

export async function handleHomeReleasesRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.pathname !== '/api/app/releases') return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  const submissionId = positiveInt(url.searchParams.get('submission_id'));
  const limit = boundedInt(url.searchParams.get('limit'), submissionId ? 12 : 8, 1, 20);
  const submissionClause = submissionId ? 'AND p.submission_id = ?' : '';
  const binds = submissionId ? [submissionId, limit] : [limit];

  const [rows, channel] = await Promise.all([
    env.DB.prepare(`
      SELECT
        p.id,
        p.submission_id,
        p.internal_title,
        p.body_html,
        p.image_key,
        p.channel_message_id,
        p.published_at,
        p.chapter_start,
        p.chapter_end,
        (SELECT COUNT(*) FROM publication_assets a WHERE a.publication_id = p.id) AS file_count
      FROM publications p
      WHERE p.status = 'published'
        AND p.telegram_deleted_at IS NULL
        AND p.published_at IS NOT NULL
        ${submissionClause}
      ORDER BY p.published_at DESC, p.id DESC
      LIMIT ?
    `).bind(...binds).all<ReleaseRow>(),
    env.DB.prepare("SELECT value FROM app_settings WHERE key='publish_channel_id'").first<{ value: string }>(),
  ]);

  const channelUsername = normalizePublicChannel(channel?.value ?? '');
  const releases = rows.results.map((row) => ({
    id: Number(row.id),
    submission_id: row.submission_id === null ? null : Number(row.submission_id),
    title: row.internal_title,
    excerpt: compactText(row.body_html, 180),
    has_image: Boolean(row.image_key),
    image_url: row.image_key ? `/media/publications/${row.id}/image` : null,
    file_count: Number(row.file_count ?? 0),
    chapter_start: validChapter(row.chapter_start),
    chapter_end: validChapter(row.chapter_end),
    published_at: row.published_at,
    telegram_url: channelUsername && row.channel_message_id
      ? `https://t.me/${channelUsername}/${row.channel_message_id}`
      : null,
  }));

  return miniAppJson({ releases });
}

function normalizePublicChannel(value: string): string | null {
  const clean = value.trim().replace(/^@/, '');
  return /^[A-Za-z0-9_]{5,}$/.test(clean) ? clean : null;
}

function compactText(value: string, max: number): string {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function positiveInt(value: string | null): number | null {
  const parsed = Number(value);
  return value && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function boundedInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return value && Number.isSafeInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function validChapter(value: number | null): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
