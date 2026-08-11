import {
  authenticateMiniAppRequest,
  miniAppApiHeaders,
  miniAppJson,
  miniAppJsonError,
  type MiniAppAuthContext,
} from './miniapp-auth';
import {
  extractNovelpiaId,
  inspectRawFuckNovelpiaPage,
  normalizeRawPageUrl,
  searchRawFuckNovelpia,
  type RawFuckNovelpiaResult,
} from './raw-fucknovelpia';

const SEARCH_PATH = '/api/app/discovery/search';
const SOURCE_PATH = '/api/app/discovery/source';
const MAX_QUERY = 160;
const MAX_EXTERNAL_RESULTS = 4;

type LocalDiscoveryRow = {
  id: number;
  user_id: number;
  title: string;
  original_language: string;
  chapter_count: number;
  publication_status: string;
  source_url: string | null;
  status: string;
  queue_status: string | null;
  queue_position: number | null;
  current_chapter: number | null;
  demand_count: number;
  viewer_interested: number;
  raw_available: number;
  raw_page_url: string | null;
  raw_external_id: string | null;
};

export async function handleDiscoveryRawV2Request(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== SEARCH_PATH && url.pathname !== SOURCE_PATH) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: miniAppApiHeaders() });
  }

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  try {
    if (request.method === 'GET' && url.pathname === SEARCH_PATH) {
      const query = String(url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY);
      if (query.length < 2) {
        return miniAppJson({ query, local: [], external: [], provider_status: 'idle', provider_source: 'none' });
      }

      const [local, cachedRaw] = await Promise.all([
        searchLocal(env, auth, query),
        searchCachedRawCatalog(env, query, MAX_EXTERNAL_RESULTS),
      ]);
      let external = cachedRaw;
      let providerStatus: 'ok' | 'unavailable' | 'skipped' = cachedRaw.length ? 'ok' : 'skipped';
      let providerSource: 'cache' | 'live' | 'none' = cachedRaw.length ? 'cache' : 'none';

      const directLookup = Boolean(normalizeRawPageUrl(query) || extractNovelpiaId(query) || /^\d{2,9}$/.test(query));
      if (directLookup || (!cachedRaw.length && query.length >= 3)) {
        try {
          const live = await searchRawFuckNovelpia(query);
          external = mergeExternalResults(cachedRaw, live, query);
          providerStatus = 'ok';
          providerSource = live.length ? 'live' : cachedRaw.length ? 'cache' : 'live';
        } catch (error) {
          providerStatus = cachedRaw.length ? 'ok' : 'unavailable';
          providerSource = cachedRaw.length ? 'cache' : 'none';
          console.warn(JSON.stringify({
            event: 'discovery_provider_search_failed',
            provider: 'raw_fucknovelpia',
            query_kind: directLookup ? 'direct' : 'text',
            error: errorMessage(error),
          }));
        }
      }

      const localKeys = new Set(local.flatMap((row) => [
        normalizeSearchText(row.title),
        row.raw_external_id ? `novelpia:${row.raw_external_id}` : '',
        extractNovelpiaId(row.source_url) ? `novelpia:${extractNovelpiaId(row.source_url)}` : '',
      ]).filter(Boolean));
      external = external.filter((row) => {
        const keys = [
          normalizeSearchText(row.title),
          normalizeSearchText(row.original_title ?? ''),
          row.external_id ? `novelpia:${row.external_id}` : '',
        ].filter(Boolean);
        return !keys.some((key) => localKeys.has(key));
      }).slice(0, MAX_EXTERNAL_RESULTS);

      return miniAppJson({
        query,
        local,
        external,
        provider_status: providerStatus,
        provider_source: providerSource,
      });
    }

    if (request.method === 'POST' && url.pathname === SOURCE_PATH) {
      const body = await readJson<{
        submission_id?: number;
        provider?: string;
        external_id?: string | null;
        page_url?: string;
        source_url?: string | null;
        raw_available?: boolean;
        metadata?: Record<string, unknown>;
      }>(request);
      const submissionId = Number(body.submission_id);
      if (!Number.isSafeInteger(submissionId) || submissionId <= 0) {
        return miniAppJsonError('invalid_submission', 'Invalid submission.', 400);
      }
      const submission = await env.DB.prepare('SELECT id, user_id FROM submissions WHERE id = ?')
        .bind(submissionId).first<{ id: number; user_id: number }>();
      if (!submission) return miniAppJsonError('not_found', 'Novel request not found.', 404);
      if (submission.user_id !== auth.telegramUser.id && !auth.admin) {
        return miniAppJsonError('forbidden', 'You cannot attach sources to this request.', 403);
      }
      if (body.provider !== 'raw_fucknovelpia' || !body.page_url) {
        return miniAppJsonError('invalid_provider', 'Unsupported discovery source.', 400);
      }

      const safePage = normalizeRawPageUrl(body.page_url);
      if (!safePage) return miniAppJsonError('invalid_source', 'Invalid RAW source URL.', 400);

      const existing = await env.DB.prepare(`
        SELECT external_id, page_url, original_url, raw_available, metadata_json, last_checked_at
        FROM submission_external_sources
        WHERE submission_id = ? AND provider = 'raw_fucknovelpia'
      `).bind(submissionId).first<any>();

      let inspected: RawFuckNovelpiaResult | null = null;
      let inspectionError: string | null = null;
      try {
        inspected = await inspectRawFuckNovelpiaPage(safePage, cleanExternalId(body.external_id));
      } catch (error) {
        inspectionError = errorMessage(error).slice(0, 400);
      }

      const externalId = inspected?.external_id ?? cleanExternalId(body.external_id) ?? cleanExternalId(existing?.external_id);
      const pageUrl = inspected?.page_url ?? safePage;
      const sourceUrl = inspected?.source_url ?? safeHttpUrl(body.source_url) ?? safeHttpUrl(existing?.original_url) ?? null;
      const rawAvailable = inspected
        ? inspected.raw_available
        : Boolean(existing?.raw_available) || Boolean(body.raw_available);
      const now = new Date().toISOString();
      const metadata = {
        ...parseJsonObject(existing?.metadata_json),
        ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
        verification_status: inspected ? 'verified' : 'unverified',
        verification_error: inspectionError,
        ...(inspected ? {
          title: inspected.title,
          original_title: inspected.original_title,
          author: inspected.author,
          cover_url: inspected.cover_url,
          genres_tags: inspected.genres_tags,
          synopsis: inspected.synopsis,
          raw_format: inspected.raw_format,
          password_required: inspected.password_required,
          verified_at: inspected.verified_at,
        } : {}),
      };

      try {
        await env.DB.prepare(`
          INSERT INTO submission_external_sources (
            submission_id, provider, external_id, page_url, original_url,
            raw_available, metadata_json, last_checked_at, created_at, updated_at
          ) VALUES (?, 'raw_fucknovelpia', ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(submission_id, provider) DO UPDATE SET
            external_id = excluded.external_id,
            page_url = excluded.page_url,
            original_url = excluded.original_url,
            raw_available = excluded.raw_available,
            metadata_json = excluded.metadata_json,
            last_checked_at = excluded.last_checked_at,
            updated_at = excluded.updated_at
        `).bind(
          submissionId,
          externalId,
          pageUrl,
          sourceUrl,
          rawAvailable ? 1 : 0,
          JSON.stringify(metadata).slice(0, 8000),
          now,
          now,
          now,
        ).run();
      } catch (error) {
        if (/UNIQUE constraint failed: submission_external_sources\.provider, submission_external_sources\.external_id/i.test(errorMessage(error))) {
          return miniAppJsonError('source_already_linked', 'This RAW source is already linked to another request.', 409);
        }
        throw error;
      }

      return miniAppJson({
        ok: true,
        source: {
          provider: 'raw_fucknovelpia',
          external_id: externalId,
          page_url: pageUrl,
          source_url: sourceUrl,
          raw_available: rawAvailable,
          verification_status: inspected ? 'verified' : 'unverified',
          last_checked_at: now,
        },
      });
    }

    return null;
  } catch (error) {
    console.error(JSON.stringify({
      event: 'discovery_raw_v2_request_failed',
      path: url.pathname,
      error: errorMessage(error),
    }));
    return miniAppJsonError('temporary_error', 'Discovery is temporarily unavailable.', 500);
  }
}

async function searchLocal(env: Env, auth: MiniAppAuthContext, query: string) {
  const needle = `%${escapeLike(query.toLowerCase())}%`;
  const novelpiaId = extractNovelpiaId(query) || (/^\d{2,9}$/.test(query) ? query : null);
  const idNeedle = novelpiaId ? `%/novel/${escapeLike(novelpiaId)}%` : '';
  const rows = await env.DB.prepare(`
    SELECT
      s.id, s.user_id, s.title, s.original_language, s.chapter_count, s.publication_status,
      s.source_url, s.status, s.queue_status, s.queue_position, s.current_chapter,
      1 + (SELECT COUNT(*) FROM discovery_interests di WHERE di.submission_id = s.id) AS demand_count,
      CASE WHEN s.user_id = ? OR EXISTS (
        SELECT 1 FROM discovery_interests di2 WHERE di2.submission_id = s.id AND di2.user_id = ?
      ) THEN 1 ELSE 0 END AS viewer_interested,
      COALESCE((SELECT MAX(es.raw_available) FROM submission_external_sources es WHERE es.submission_id = s.id), 0) AS raw_available,
      (SELECT es.page_url FROM submission_external_sources es WHERE es.submission_id = s.id AND es.provider = 'raw_fucknovelpia' LIMIT 1) AS raw_page_url,
      (SELECT es.external_id FROM submission_external_sources es WHERE es.submission_id = s.id AND es.provider = 'raw_fucknovelpia' LIMIT 1) AS raw_external_id
    FROM submissions s
    WHERE s.status <> 'rejected'
      AND (
        LOWER(s.title) LIKE ? ESCAPE '!'
        OR LOWER(COALESCE(s.source_url,'')) LIKE ? ESCAPE '!'
        OR (? <> '' AND LOWER(COALESCE(s.source_url,'')) LIKE ? ESCAPE '!')
        OR CAST(s.id AS TEXT) = ?
        OR EXISTS (
          SELECT 1 FROM submission_external_sources es2
          WHERE es2.submission_id = s.id
            AND (LOWER(COALESCE(es2.external_id,'')) = LOWER(?) OR LOWER(es2.page_url) LIKE ? ESCAPE '!')
        )
      )
    ORDER BY
      CASE
        WHEN s.status = 'accepted' AND s.queue_status = 'in_progress' THEN 0
        WHEN s.status = 'accepted' AND s.queue_status = 'queued' THEN 1
        WHEN s.status = 'pending' THEN 2
        WHEN s.status = 'accepted' AND s.queue_status = 'completed' THEN 3
        ELSE 4
      END,
      demand_count DESC,
      s.id DESC
    LIMIT 8
  `).bind(
    auth.telegramUser.id,
    auth.telegramUser.id,
    needle,
    needle,
    idNeedle,
    idNeedle,
    /^\d+$/.test(query) ? query : '',
    novelpiaId ?? '',
    needle,
  ).all<LocalDiscoveryRow>();

  return rows.results.map((row) => ({
    kind: 'local' as const,
    id: Number(row.id),
    title: row.title,
    original_language: row.original_language,
    chapter_count: Number(row.chapter_count),
    publication_status: row.publication_status,
    source_url: row.source_url,
    request_status: row.status,
    queue_status: row.queue_status,
    queue_position: row.queue_position == null ? null : Number(row.queue_position),
    current_chapter: row.current_chapter == null ? null : Number(row.current_chapter),
    demand_count: Number(row.demand_count ?? 1),
    viewer_interested: Boolean(row.viewer_interested),
    own_request: Number(row.user_id) === auth.telegramUser.id,
    raw_available: Boolean(row.raw_available),
    raw_page_url: row.raw_page_url,
    raw_external_id: row.raw_external_id,
  }));
}

async function searchCachedRawCatalog(env: Env, query: string, limit: number): Promise<RawFuckNovelpiaResult[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const needle = `%${escapeLike(normalized)}%`;
  const novelpiaId = extractNovelpiaId(query) ?? (/^\d{2,9}$/.test(query.trim()) ? query.trim() : '');
  const result = await env.DB.prepare(`
    SELECT c.external_id AS novelpia_id, c.title, c.original_title, c.author,
      c.publication_status, c.source_url, c.cover_url, c.genres_tags, c.synopsis,
      s.page_url, s.available, s.metadata_json, s.last_checked_at
    FROM discovery_catalog c
    JOIN discovery_catalog_sources s
      ON s.catalog_id = c.id AND s.provider = 'raw_fucknovelpia' AND s.verification_status = 'verified'
    WHERE c.provider = 'novelpia'
      AND (
        LOWER(c.title) LIKE ? ESCAPE '!'
        OR LOWER(COALESCE(c.original_title,'')) LIKE ? ESCAPE '!'
        OR LOWER(COALESCE(c.author,'')) LIKE ? ESCAPE '!'
        OR (? <> '' AND c.external_id = ?)
      )
    ORDER BY CASE WHEN c.external_id = ? THEN 0 ELSE 1 END, c.updated_at DESC
    LIMIT ?
  `).bind(needle, needle, needle, novelpiaId, novelpiaId, novelpiaId, limit).all<any>();

  return result.results.map((row) => {
    const metadata = parseJsonObject(row.metadata_json);
    return {
      provider: 'raw_fucknovelpia',
      external_id: String(row.novelpia_id),
      title: typeof metadata.title === 'string' && metadata.title ? metadata.title : String(row.title),
      original_title: typeof metadata.original_title === 'string'
        ? metadata.original_title
        : row.original_title ? String(row.original_title) : null,
      author: typeof metadata.author === 'string'
        ? metadata.author
        : row.author ? String(row.author) : null,
      original_language: 'Korean',
      chapter_count: null,
      publication_status: row.publication_status === 'completed' ? 'completed' : row.publication_status === 'ongoing' ? 'ongoing' : null,
      source_url: String(row.source_url),
      page_url: String(row.page_url),
      cover_url: typeof metadata.cover_url === 'string'
        ? metadata.cover_url
        : row.cover_url ? String(row.cover_url) : null,
      raw_available: Boolean(row.available),
      genres_tags: typeof metadata.genres_tags === 'string' && metadata.genres_tags
        ? metadata.genres_tags
        : String(row.genres_tags ?? ''),
      synopsis: typeof metadata.synopsis === 'string'
        ? metadata.synopsis
        : row.synopsis ? String(row.synopsis) : null,
      raw_format: typeof metadata.raw_format === 'string' ? metadata.raw_format : null,
      password_required: Boolean(metadata.password_required),
      verified_at: String(row.last_checked_at ?? ''),
    } satisfies RawFuckNovelpiaResult;
  });
}

function mergeExternalResults(
  cached: RawFuckNovelpiaResult[],
  live: RawFuckNovelpiaResult[],
  query: string,
): RawFuckNovelpiaResult[] {
  const out = new Map<string, RawFuckNovelpiaResult>();
  for (const item of [...live, ...cached]) {
    const key = item.external_id ? `novelpia:${item.external_id}` : item.page_url;
    const current = out.get(key);
    if (!current || scoreExternal(item, query) > scoreExternal(current, query)) out.set(key, item);
  }
  return [...out.values()]
    .sort((a, b) => scoreExternal(b, query) - scoreExternal(a, query))
    .slice(0, MAX_EXTERNAL_RESULTS);
}

function scoreExternal(row: RawFuckNovelpiaResult, query: string): number {
  if (row.external_id === query) return 110;
  const needle = normalizeSearchText(query);
  const title = normalizeSearchText(row.title);
  const original = normalizeSearchText(row.original_title ?? '');
  if (title === needle || original === needle) return 100;
  if (title.includes(needle) || original.includes(needle)) return 90;
  const tokens = needle.split(' ').filter((token) => token.length >= 2);
  if (!tokens.length) return 0;
  const text = `${title} ${original}`;
  return Math.round(tokens.filter((token) => text.includes(token)).length / tokens.length * 70);
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}

function cleanExternalId(value: unknown): string | null {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^\d{2,9}$/.test(text) ? text : null;
}

function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeSearchText(value: string): string {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/[^\s]+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function escapeLike(value: string): string {
  return value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
