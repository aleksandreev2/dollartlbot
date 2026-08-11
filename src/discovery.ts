import {
  authenticateMiniAppRequest,
  miniAppApiHeaders,
  miniAppJson,
  miniAppJsonError,
  type MiniAppAuthContext,
} from './miniapp-auth';

const RAW_ORIGIN = 'https://raw-fucknovelpia.com';
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

type ExternalDiscoveryResult = {
  provider: 'raw_fucknovelpia';
  external_id: string | null;
  title: string;
  original_title: string | null;
  author: string | null;
  original_language: 'Korean';
  chapter_count: number | null;
  publication_status: 'ongoing' | 'completed' | null;
  source_url: string | null;
  page_url: string;
  cover_url: string | null;
  raw_available: boolean;
  genres_tags: string;
};

export async function handleDiscoveryRequest(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/discovery')) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: miniAppApiHeaders() });
  }

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  try {
    if (request.method === 'GET' && url.pathname === '/api/app/discovery/search') {
      const query = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY);
      if (query.length < 2) return miniAppJson({ query, local: [], external: [], provider_status: 'idle' });

      const local = await searchLocal(env, auth, query);
      let external: ExternalDiscoveryResult[] = [];
      let providerStatus: 'ok' | 'unavailable' | 'skipped' = 'skipped';
      if (shouldSearchRawProvider(query)) {
        try {
          external = await searchRawFuckNovelpia(query);
          providerStatus = 'ok';
        } catch (error) {
          providerStatus = 'unavailable';
          console.warn(JSON.stringify({
            event: 'discovery_provider_search_failed',
            provider: 'raw_fucknovelpia',
            error: error instanceof Error ? error.message : String(error),
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
      });

      return miniAppJson({ query, local, external, provider_status: providerStatus });
    }

    const summaryMatch = /^\/api\/app\/discovery\/submission\/(\d+)$/.exec(url.pathname);
    if (request.method === 'GET' && summaryMatch) {
      const submissionId = Number(summaryMatch[1]);
      const access = await readableSubmission(env, auth, submissionId);
      if (!access) return miniAppJsonError('not_found', 'Novel request not found.', 404);
      return miniAppJson(await submissionDiscoverySummary(env, auth.telegramUser.id, submissionId, access.user_id));
    }

    if (request.method === 'POST' && url.pathname === '/api/app/discovery/interest') {
      const body = await readJson<{ submission_id?: number; interested?: boolean }>(request);
      const submissionId = Number(body.submission_id);
      if (!Number.isSafeInteger(submissionId) || submissionId <= 0 || typeof body.interested !== 'boolean') {
        return miniAppJsonError('invalid_interest', 'Choose a valid title.', 400);
      }
      const row = await env.DB.prepare(`
        SELECT id, user_id, status
        FROM submissions
        WHERE id = ? AND status <> 'rejected'
      `).bind(submissionId).first<{ id: number; user_id: number; status: string }>();
      if (!row) return miniAppJsonError('not_found', 'Novel request not found.', 404);

      if (row.user_id !== auth.telegramUser.id) {
        if (body.interested) {
          await env.DB.prepare(`
            INSERT OR IGNORE INTO discovery_interests (submission_id, user_id, created_at)
            VALUES (?, ?, ?)
          `).bind(submissionId, auth.telegramUser.id, new Date().toISOString()).run();
        } else {
          await env.DB.prepare('DELETE FROM discovery_interests WHERE submission_id = ? AND user_id = ?')
            .bind(submissionId, auth.telegramUser.id).run();
        }
      }

      return miniAppJson(await submissionDiscoverySummary(env, auth.telegramUser.id, submissionId, row.user_id));
    }

    if (request.method === 'POST' && url.pathname === '/api/app/discovery/source') {
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

      let inspected: ExternalDiscoveryResult | null = null;
      try { inspected = await inspectRawFuckNovelpiaPage(safePage); } catch {}
      const externalId = inspected?.external_id ?? cleanExternalId(body.external_id);
      const sourceUrl = inspected?.source_url ?? safeHttpUrl(body.source_url) ?? null;
      const rawAvailable = inspected ? inspected.raw_available : Boolean(body.raw_available);
      const now = new Date().toISOString();
      const metadata = {
        ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
        ...(inspected ? {
          title: inspected.title,
          original_title: inspected.original_title,
          author: inspected.author,
          cover_url: inspected.cover_url,
        } : {}),
      };
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
        safePage,
        sourceUrl,
        rawAvailable ? 1 : 0,
        JSON.stringify(metadata).slice(0, 8000),
        now,
        now,
        now,
      ).run();

      return miniAppJson({ ok: true, source: { provider: 'raw_fucknovelpia', external_id: externalId, page_url: safePage, source_url: sourceUrl, raw_available: rawAvailable } });
    }

    return null;
  } catch (error) {
    console.error(JSON.stringify({
      event: 'discovery_request_failed',
      path: url.pathname,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
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

async function readableSubmission(env: Env, auth: MiniAppAuthContext, id: number) {
  const row = await env.DB.prepare('SELECT id, user_id, status FROM submissions WHERE id = ?')
    .bind(id).first<{ id: number; user_id: number; status: string }>();
  if (!row) return null;
  if (row.status === 'accepted' || row.user_id === auth.telegramUser.id || auth.admin) return row;
  return null;
}

async function submissionDiscoverySummary(env: Env, viewerId: number, submissionId: number, ownerId: number) {
  const [interest, sources] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS extra,
        EXISTS(SELECT 1 FROM discovery_interests WHERE submission_id = ? AND user_id = ?) AS viewer_interested
      FROM discovery_interests
      WHERE submission_id = ?
    `).bind(submissionId, viewerId, submissionId).first<{ extra: number; viewer_interested: number }>(),
    env.DB.prepare(`
      SELECT provider, external_id, page_url, original_url, raw_available, last_checked_at
      FROM submission_external_sources
      WHERE submission_id = ?
      ORDER BY provider ASC
    `).bind(submissionId).all<{
      provider: string;
      external_id: string | null;
      page_url: string;
      original_url: string | null;
      raw_available: number;
      last_checked_at: string;
    }>(),
  ]);
  return {
    submission_id: submissionId,
    demand_count: 1 + Number(interest?.extra ?? 0),
    viewer_interested: ownerId === viewerId || Boolean(interest?.viewer_interested),
    own_request: ownerId === viewerId,
    sources: sources.results.map((source) => ({ ...source, raw_available: Boolean(source.raw_available) })),
  };
}

function shouldSearchRawProvider(query: string): boolean {
  if (normalizeRawPageUrl(query)) return true;
  if (extractNovelpiaId(query)) return true;
  return query.length >= 3;
}

async function searchRawFuckNovelpia(query: string): Promise<ExternalDiscoveryResult[]> {
  const direct = normalizeRawPageUrl(query);
  if (direct) {
    const item = await inspectRawFuckNovelpiaPage(direct);
    return item ? [item] : [];
  }

  const novelpiaId = extractNovelpiaId(query) || (/^\d{2,9}$/.test(query) ? query : null);
  const target = novelpiaId ?? query;
  const params = ['q', 'search', 'query', 'text'];
  let best: { score: number; urls: string[] } = { score: -1, urls: [] };

  for (const key of params) {
    const searchUrl = new URL('/search.php', RAW_ORIGIN);
    searchUrl.searchParams.set(key, target);
    searchUrl.searchParams.set('view_lang', 'en');
    const html = await fetchExternalText(searchUrl.toString());
    const candidates = extractRawResultLinks(html, target);
    if (!candidates.length) continue;
    const score = candidates[0]?.score ?? 0;
    if (score > best.score) best = { score, urls: candidates.slice(0, 6).map((item) => item.url) };
    if (novelpiaId && candidates.some((item) => item.text.includes(novelpiaId))) break;
    if (!novelpiaId && score >= 90) break;
  }

  if (!best.urls.length) return [];
  const inspected: ExternalDiscoveryResult[] = [];
  for (const pageUrl of best.urls.slice(0, MAX_EXTERNAL_RESULTS)) {
    try {
      const item = await inspectRawFuckNovelpiaPage(pageUrl);
      if (!item) continue;
      if (novelpiaId && item.external_id !== novelpiaId) continue;
      inspected.push(item);
    } catch {}
  }
  return inspected
    .sort((a, b) => scoreExternalResult(b, query) - scoreExternalResult(a, query))
    .slice(0, MAX_EXTERNAL_RESULTS);
}

function extractRawResultLinks(html: string, query: string) {
  const out: Array<{ url: string; text: string; score: number }> = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']*\/novel\/raw-[a-z0-9-]+[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && out.length < 80) {
    let url: URL;
    try { url = new URL(match[1], RAW_ORIGIN); } catch { continue; }
    if (!isRawHost(url.hostname) || !/^\/novel\/raw-[a-z0-9-]+$/i.test(url.pathname)) continue;
    url.search = '';
    const canonical = url.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const text = collapse(stripHtml(match[2]));
    out.push({ url: canonical, text, score: scoreText(text, query) });
  }
  return out.sort((a, b) => b.score - a.score);
}

async function inspectRawFuckNovelpiaPage(pageUrl: string): Promise<ExternalDiscoveryResult | null> {
  const safe = normalizeRawPageUrl(pageUrl);
  if (!safe) return null;
  const url = new URL(safe);
  url.searchParams.set('view_lang', 'en');
  const html = await fetchExternalText(url.toString());
  const text = collapse(stripHtml(html));
  const headings = [...html.matchAll(/<h[12]\b[^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map((match) => collapse(stripHtml(match[1])))
    .filter((value) => value && !/^(description|information|raw update history|recommended next reads|our tags|novelpia tags)$/i.test(value));
  const title = headings[0] || extractMeta(html, 'og:title')?.split('|')[0]?.trim() || 'Unknown title';
  const originalTitle = headings[1] && headings[1] !== title ? headings[1] : null;
  const externalId = firstMatch(text, /(?:Source code|소스 코드)\s*:?\s*(\d{2,9})/i);
  const author = firstMatch(text, /(?:Author|작가)\s*:?\s*(.{1,80}?)(?=\s+(?:Translator group|Uploader|Country|Year|Status|Format|Download|ZIP password|Linked translation|Source code|Source page|Audiobook|번역팀|업로더|국가|연도|상태|형식|다운로드|소스 코드|소스 페이지|오디오북)\b|$)/i);
  const status: 'ongoing' | 'completed' | null = /\bCompleted\b/i.test(text)
    ? 'completed'
    : /\bOngoing\b/i.test(text)
      ? 'ongoing'
      : null;
  const rawAvailable = /RAW ZIP Download|RAW download (?:is )?ready|Download\s*:?[\s\S]{0,40}available|\/download\.php/i.test(html);
  const sourceUrl = externalId ? `https://novelpia.com/novel/${externalId}` : extractNovelpiaHref(html);
  const cover = extractMeta(html, 'og:image');
  return {
    provider: 'raw_fucknovelpia',
    external_id: externalId,
    title,
    original_title: originalTitle,
    author: author ? collapse(author).slice(0, 120) : null,
    original_language: 'Korean',
    chapter_count: null,
    publication_status: status,
    source_url: sourceUrl,
    page_url: safe,
    cover_url: cover ? safeHttpUrl(new URL(cover, RAW_ORIGIN).toString()) : null,
    raw_available: rawAvailable,
    genres_tags: '',
  };
}

async function fetchExternalText(url: string): Promise<string> {
  const parsed = new URL(url);
  if (!isRawHost(parsed.hostname) || parsed.protocol !== 'https:') throw new Error('invalid_external_host');
  const response = await fetch(parsed.toString(), {
    redirect: 'follow',
    headers: {
      accept: 'text/html,application/xhtml+xml',
      'user-agent': 'DollarTL-Discovery/1.0',
    },
  });
  if (!response.ok) throw new Error(`provider_http_${response.status}`);
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('text/html')) throw new Error('provider_non_html');
  const text = await response.text();
  return text.slice(0, 2_000_000);
}

function scoreExternalResult(row: ExternalDiscoveryResult, query: string): number {
  return Math.max(scoreText(row.title, query), scoreText(row.original_title ?? '', query), row.external_id === query ? 100 : 0);
}
function scoreText(value: string, query: string): number {
  const hay = normalizeSearchText(value);
  const needle = normalizeSearchText(query);
  if (!hay || !needle) return 0;
  if (hay === needle) return 100;
  if (hay.includes(needle)) return 90;
  if (/^\d+$/.test(needle) && hay.includes(needle)) return 95;
  const tokens = needle.split(' ').filter((token) => token.length >= 2);
  if (!tokens.length) return 0;
  const matched = tokens.filter((token) => hay.includes(token)).length;
  return Math.round((matched / tokens.length) * 70);
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
function normalizeRawPageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || !isRawHost(url.hostname) || !/^\/novel\/raw-[a-z0-9-]+$/i.test(url.pathname)) return null;
    url.hostname = 'raw-fucknovelpia.com';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch { return null; }
}
function isRawHost(hostname: string): boolean {
  return hostname === 'raw-fucknovelpia.com' || hostname === 'www.raw-fucknovelpia.com';
}
function extractNovelpiaId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /(?:novelpia\.com\/(?:novel|viewer)\/|[?&](?:novel_no|id)=)(\d{2,9})/i.exec(value);
  return match?.[1] ?? null;
}
function extractNovelpiaHref(html: string): string | null {
  const match = /href=["'](https:\/\/(?:www\.)?novelpia\.com\/novel\/\d+[^"']*)["']/i.exec(html);
  return match ? safeHttpUrl(decodeHtml(match[1])) : null;
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
  } catch { return null; }
}
function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escapeRegExp(property)}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escapeRegExp(property)}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return decodeHtml(match[1]).trim();
  }
  return null;
}
function firstMatch(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match?.[1]?.trim() || null;
}
function stripHtml(value: string): string {
  return decodeHtml(value
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>|<\/section>|<\/h[1-6]>/gi, '\n')
    .replace(/<[^>]+>/g, ' '));
}
function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}
function collapse(value: string): string { return value.replace(/\s+/g, ' ').trim(); }
function escapeLike(value: string): string { return value.replace(/[!%_]/g, (char) => `!${char}`); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
async function readJson<T>(request: Request): Promise<T> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().includes('application/json')) throw new Error('expected_json');
  return await request.json<T>();
}
