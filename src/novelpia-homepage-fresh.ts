const NOVELPIA_ORIGIN = 'https://novelpia.com';
const HOMEPAGE_CURATION_PATH = '/proc/main_v2';
const INGEST_PROVIDER = 'novelpia_homepage_fresh';
const HOMEPAGE_SIGNAL = 'novelpia_home_plus_new';
const PLUS_NEW_SIGNAL = 'novelpia_plus_new';
const FETCH_TIMEOUT_MS = 8_000;
const API_MAX_BYTES = 1_000_000;
const DETAIL_MAX_BYTES = 3_000_000;
const MAX_REDIRECTS = 3;
const MAX_ITEMS = 12;

type ApiNovel = {
  externalId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  ageRating: string | null;
  genresTags: string;
  linkUrl: string;
  rank: number;
};

type ParsedDetail = {
  chapterCount: number | null;
  publicationStatus: 'ongoing' | 'completed';
  genresTags: string;
  synopsis: string | null;
  coverUrl: string | null;
  ageRating: string | null;
  viewsCount: number;
  favoritesCount: number;
  recommendationsCount: number;
};

type CatalogRow = {
  id: number;
  linked_submission_id: number | null;
};

export type HomepageFreshIngestResult = {
  cards: number;
  resolved: number;
  enriched: number;
  linked: number;
  unresolved: number;
};

export async function runNovelpiaHomepageFreshIngestion(
  env: Env,
  scheduledAt = new Date(),
): Promise<HomepageFreshIngestResult> {
  const now = scheduledAt.toISOString();
  await writeIngestState(env, { attempt: now, success: null, error: null, count: null });

  try {
    const payload = await fetchHomepageFreshPayload();
    const parsed = parseHomepageFreshPayload(payload);
    if (!parsed.items.length) throw new Error('novelpia_homepage_fresh_empty');

    let enriched = 0;
    let linked = 0;
    const detailErrors: string[] = [];

    for (let offset = 0; offset < parsed.items.length; offset += 4) {
      const batch = parsed.items.slice(offset, offset + 4);
      const details = await Promise.all(batch.map(async (item) => {
        try {
          const html = await fetchNovelDetailHtml(item.externalId);
          return { item, detail: parseNovelDetail(html) };
        } catch (error) {
          detailErrors.push(`${item.externalId}:${errorMessage(error)}`);
          return { item, detail: null };
        }
      }));

      for (const { item, detail } of details) {
        await upsertCatalogNovel(env, item, detail, now);
        const row = await loadCatalogRow(env, item.externalId);
        if (!row) continue;
        await upsertHomepageSignals(env, row.id, item.rank, now);
        if (detail) enriched += 1;

        if (row.linked_submission_id == null) {
          const submissionId = await findMatchingSubmission(env, item.externalId);
          if (submissionId) {
            await linkCatalogRow(env, row.id, submissionId, now);
            linked += 1;
          }
        }
      }
    }

    const warnings = [
      ...parsed.warnings,
      ...detailErrors.slice(0, 4).map((value) => `detail:${value}`),
    ];
    await writeIngestState(env, {
      attempt: now,
      success: now,
      error: warnings.length ? warnings.join('; ').slice(0, 1200) : null,
      count: parsed.items.length,
    });

    return {
      cards: parsed.sourceCount,
      resolved: parsed.items.length,
      enriched,
      linked,
      unresolved: Math.max(0, parsed.sourceCount - parsed.items.length),
    };
  } catch (error) {
    await writeIngestState(env, {
      attempt: now,
      success: null,
      error: errorMessage(error).slice(0, 1200),
      count: 0,
    });
    throw error;
  }
}

export async function getHomepageFreshIngestState(env: Env) {
  return env.DB.prepare(`
    SELECT provider,last_attempt_at,last_success_at,last_error,last_item_count,updated_at
    FROM discovery_ingest_state
    WHERE provider=?
  `).bind(INGEST_PROVIDER).first<{
    provider: string;
    last_attempt_at: string | null;
    last_success_at: string | null;
    last_error: string | null;
    last_item_count: number;
    updated_at: string;
  }>();
}

export function parseHomepageFreshPayload(payload: unknown): {
  sourceCount: number;
  items: ApiNovel[];
  warnings: string[];
} {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('novelpia_homepage_invalid_payload');
  }
  const data = payload as Record<string, unknown>;
  const status = Number(data.status);
  if (!Number.isFinite(status) || status !== 200) {
    throw new Error(`novelpia_homepage_api_status_${String(data.status ?? 'missing')}`);
  }
  if (!Array.isArray(data.list)) throw new Error('novelpia_homepage_list_missing');

  const sourceCount = data.list.length;
  const items: ApiNovel[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < data.list.length && items.length < MAX_ITEMS; index += 1) {
    const raw = data.list[index];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      warnings.push(`row_${index + 1}:not_object`);
      continue;
    }
    const row = raw as Record<string, unknown>;
    const idFromField = cleanExternalId(row.novel_no);
    const linkUrl = cleanLinkUrl(row.link_url);
    const idFromLink = extractNovelpiaId(linkUrl);
    const externalId = idFromField || idFromLink;
    if (!externalId || (idFromField && idFromLink && idFromField !== idFromLink)) {
      warnings.push(`row_${index + 1}:invalid_identity`);
      continue;
    }
    if (seen.has(externalId)) {
      warnings.push(`row_${index + 1}:duplicate_${externalId}`);
      continue;
    }

    const title = cleanText(row.novel_name, 240);
    if (!title) {
      warnings.push(`row_${index + 1}:missing_title`);
      continue;
    }
    const author = cleanText(row.writer_nick ?? row.mem_nick, 120) || null;
    const coverUrl = normalizeOfficialAssetUrl(cleanText(row.novel_thumb ?? row.novel_thumb_all, 1000));
    const age = Number(row.novel_age ?? 0);
    const ageRating = Number.isFinite(age) && age >= 19 ? '19+' : Number.isFinite(age) && age >= 15 ? '15+' : null;
    const genresTags = parseApiGenres(row.novel_genre ?? row.genre ?? row.genres);

    seen.add(externalId);
    items.push({
      externalId,
      title,
      author,
      coverUrl,
      ageRating,
      genresTags,
      linkUrl: `/novel/${externalId}`,
      rank: index + 1,
    });
  }

  return { sourceCount, items, warnings };
}

async function fetchHomepageFreshPayload(): Promise<unknown> {
  const url = new URL(HOMEPAGE_CURATION_PATH, NOVELPIA_ORIGIN);
  url.searchParams.set('cmd', 'new_novel_curation');
  url.searchParams.set('novel_category', 'entry');
  return fetchJsonLimited(url, API_MAX_BYTES);
}

async function fetchJsonLimited(initial: URL, maxBytes: number): Promise<unknown> {
  let current = initial;
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    validateApiUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'application/json,text/plain,*/*',
          'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6',
          'user-agent': 'DollarTL-HomepageFresh/3.0',
          'x-requested-with': 'XMLHttpRequest',
        },
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') throw new Error('novelpia_homepage_timeout');
      throw error;
    }

    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects >= MAX_REDIRECTS) throw new Error('novelpia_homepage_redirect_failed');
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new Error(`novelpia_homepage_http_${response.status}`);
      const length = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(length) && length > maxBytes) throw new Error('novelpia_homepage_response_too_large');
      const raw = await readTextLimited(response, maxBytes);
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error('novelpia_homepage_invalid_json');
      }
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('novelpia_homepage_redirect_failed');
}

async function fetchNovelDetailHtml(externalId: string): Promise<string> {
  let current = new URL(`/novel/${externalId}`, NOVELPIA_ORIGIN);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    validateDetailUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6',
          'user-agent': 'DollarTL-HomepageFresh/3.0',
        },
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') throw new Error('novelpia_detail_timeout');
      throw error;
    }

    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects >= MAX_REDIRECTS) throw new Error('novelpia_detail_redirect_failed');
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new Error(`novelpia_detail_http_${response.status}`);
      const type = (response.headers.get('content-type') || '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('novelpia_detail_non_html');
      const length = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(length) && length > DETAIL_MAX_BYTES) throw new Error('novelpia_detail_response_too_large');
      return readTextLimited(response, DETAIL_MAX_BYTES);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('novelpia_detail_redirect_failed');
}

function validateApiUrl(url: URL): void {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || host !== 'novelpia.com' || url.pathname !== HOMEPAGE_CURATION_PATH) {
    throw new Error('novelpia_homepage_invalid_url');
  }
  if (url.searchParams.get('cmd') !== 'new_novel_curation' || url.searchParams.get('novel_category') !== 'entry') {
    throw new Error('novelpia_homepage_invalid_query');
  }
}

function validateDetailUrl(url: URL): void {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || host !== 'novelpia.com' || !/^\/novel\/\d{2,9}\/?$/.test(url.pathname)) {
    throw new Error('novelpia_detail_invalid_url');
  }
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return (await response.text()).slice(0, maxBytes);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > maxBytes) throw new Error('novelpia_response_too_large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    try { await reader.cancel(); } catch {}
  }
}

function parseNovelDetail(html: string): ParsedDetail {
  const text = collapse(stripHtml(html));
  const hero = text.slice(0, 9000);
  const chapterRaw = firstTextMatch(hero, /([\d,]{1,8})\s*회차/u);
  const chapterCount = chapterRaw ? parseInteger(chapterRaw) : null;
  const publicationStatus: 'ongoing' | 'completed' = /(?:^|\s)완결(?:\s|$)/u.test(hero) ? 'completed' : 'ongoing';
  const tags = uniqueMatches(hero, /#([^#\s]{1,32})/gu, 14);
  const synopsis = cleanDescription(extractMeta(html, 'og:description') ?? extractMeta(html, 'description'));
  const cover = extractMeta(html, 'og:image');
  const coverUrl = cover ? normalizeOfficialAssetUrl(cover) : null;
  const ageRating = /(?:^|\s)19(?:\s|\+).*?PLUS/u.test(hero) || /19\s*PLUS/u.test(hero) ? '19+' : null;
  return {
    chapterCount,
    publicationStatus,
    genresTags: tags.join(', '),
    synopsis,
    coverUrl,
    ageRating,
    viewsCount: metric(hero, /조회\s*([\d,.]+(?:[KMB]|만|천)?)/iu),
    favoritesCount: metric(hero, /선호(?:선호)?\s*([\d,.]+(?:[KMB]|만|천)?)/iu),
    recommendationsCount: metric(hero, /추천\s*([\d,.]+(?:[KMB]|만|천)?)/iu),
  };
}

async function upsertCatalogNovel(env: Env, item: ApiNovel, detail: ParsedDetail | null, now: string): Promise<void> {
  const genres = detail?.genresTags || item.genresTags;
  await env.DB.prepare(`
    INSERT INTO discovery_catalog (
      provider,external_id,title,original_title,author,original_language,
      chapter_count,publication_status,genres_tags,synopsis,source_url,cover_url,
      source_tier,age_rating,views_count,favorites_count,recommendations_count,
      raw_available,first_seen_at,last_seen_at,last_enriched_at,metadata_json,created_at,updated_at
    ) VALUES (
      'novelpia',?,?,?,?, 'Korean',?,?,?,?,?,?, 'plus',?,?,?, ?,0,?,?,?,?,?,?
    )
    ON CONFLICT(provider,external_id) DO UPDATE SET
      title=excluded.title,
      original_title=excluded.original_title,
      author=COALESCE(excluded.author,discovery_catalog.author),
      chapter_count=COALESCE(excluded.chapter_count,discovery_catalog.chapter_count),
      publication_status=COALESCE(excluded.publication_status,discovery_catalog.publication_status),
      genres_tags=CASE WHEN excluded.genres_tags<>'' THEN excluded.genres_tags ELSE discovery_catalog.genres_tags END,
      synopsis=COALESCE(excluded.synopsis,discovery_catalog.synopsis),
      source_url=excluded.source_url,
      cover_url=COALESCE(excluded.cover_url,discovery_catalog.cover_url),
      source_tier='plus',
      age_rating=COALESCE(excluded.age_rating,discovery_catalog.age_rating),
      views_count=CASE WHEN excluded.views_count>0 THEN excluded.views_count ELSE discovery_catalog.views_count END,
      favorites_count=CASE WHEN excluded.favorites_count>0 THEN excluded.favorites_count ELSE discovery_catalog.favorites_count END,
      recommendations_count=CASE WHEN excluded.recommendations_count>0 THEN excluded.recommendations_count ELSE discovery_catalog.recommendations_count END,
      last_seen_at=excluded.last_seen_at,
      last_enriched_at=COALESCE(excluded.last_enriched_at,discovery_catalog.last_enriched_at),
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `).bind(
    item.externalId,
    item.title,
    item.title,
    item.author,
    detail?.chapterCount ?? null,
    detail?.publicationStatus ?? 'ongoing',
    genres,
    detail?.synopsis ?? null,
    `${NOVELPIA_ORIGIN}/novel/${item.externalId}`,
    detail?.coverUrl || item.coverUrl,
    detail?.ageRating || item.ageRating,
    detail?.viewsCount ?? 0,
    detail?.favoritesCount ?? 0,
    detail?.recommendationsCount ?? 0,
    now,
    now,
    detail ? now : null,
    JSON.stringify({
      source: 'novelpia_main_v2_new_novel_curation',
      homepage_rank: item.rank,
      api_link_url: item.linkUrl,
      detail_enriched: Boolean(detail),
    }),
    now,
    now,
  ).run();
}

async function loadCatalogRow(env: Env, externalId: string): Promise<CatalogRow | null> {
  return env.DB.prepare(`
    SELECT id,linked_submission_id
    FROM discovery_catalog
    WHERE provider='novelpia' AND external_id=?
  `).bind(externalId).first<CatalogRow>();
}

async function upsertHomepageSignals(env: Env, catalogId: number, rank: number, now: string): Promise<void> {
  const metadata = JSON.stringify({ tier: 'plus', source: 'homepage_new_novel_curation', homepage_rank: rank });
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO discovery_catalog_signals (
        catalog_id,signal,rank_position,metadata_json,first_seen_at,last_seen_at
      ) VALUES (?,?,?,?,?,?)
      ON CONFLICT(catalog_id,signal) DO UPDATE SET
        rank_position=excluded.rank_position,metadata_json=excluded.metadata_json,last_seen_at=excluded.last_seen_at
    `).bind(catalogId, HOMEPAGE_SIGNAL, rank, metadata, now, now),
    env.DB.prepare(`
      INSERT INTO discovery_catalog_signals (
        catalog_id,signal,rank_position,metadata_json,first_seen_at,last_seen_at
      ) VALUES (?,?,?,?,?,?)
      ON CONFLICT(catalog_id,signal) DO UPDATE SET
        rank_position=MIN(discovery_catalog_signals.rank_position,excluded.rank_position),
        metadata_json=excluded.metadata_json,last_seen_at=excluded.last_seen_at
    `).bind(catalogId, PLUS_NEW_SIGNAL, rank, metadata, now, now),
  ]);
}

async function findMatchingSubmission(env: Env, externalId: string): Promise<number | null> {
  const canonical = `${NOVELPIA_ORIGIN}/novel/${externalId}`;
  const row = await env.DB.prepare(`
    SELECT s.id
    FROM submissions s
    WHERE s.status<>'rejected' AND (
      LOWER(COALESCE(s.source_url,''))=LOWER(?)
      OR LOWER(COALESCE(s.source_url,'')) LIKE LOWER(?)
      OR EXISTS (
        SELECT 1 FROM submission_external_sources es
        WHERE es.submission_id=s.id AND es.external_id=?
          AND es.provider IN ('novelpia','raw_fucknovelpia')
      )
    )
    ORDER BY CASE WHEN s.status='accepted' THEN 0 WHEN s.status='pending' THEN 1 ELSE 2 END,s.id ASC
    LIMIT 1
  `).bind(canonical, `%novelpia.com/novel/${externalId}%`, externalId).first<{ id: number }>();
  return row?.id ? Number(row.id) : null;
}

async function linkCatalogRow(env: Env, catalogId: number, submissionId: number, now: string): Promise<void> {
  const requester = await env.DB.prepare('SELECT user_id FROM submissions WHERE id=?')
    .bind(submissionId).first<{ user_id: number }>();
  if (!requester) return;
  await env.DB.batch([
    env.DB.prepare('UPDATE discovery_catalog SET linked_submission_id=?,updated_at=? WHERE id=? AND linked_submission_id IS NULL')
      .bind(submissionId, now, catalogId),
    env.DB.prepare(`
      INSERT OR IGNORE INTO discovery_interests (submission_id,user_id,created_at)
      SELECT ?,user_id,created_at FROM discovery_catalog_interests
      WHERE catalog_id=? AND user_id<>?
    `).bind(submissionId, catalogId, requester.user_id),
    env.DB.prepare('DELETE FROM discovery_catalog_interests WHERE catalog_id=?').bind(catalogId),
  ]);
}

function cleanExternalId(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return /^\d{2,9}$/.test(text) ? text : null;
}

function cleanLinkUrl(value: unknown): string {
  const text = String(value ?? '').trim();
  return /^\/novel\/\d{2,9}\/?$/.test(text) ? text : '';
}

function extractNovelpiaId(value: string): string | null {
  return /^\/novel\/(\d{2,9})\/?$/.exec(value)?.[1] ?? null;
}

function cleanText(value: unknown, maxLength: number): string {
  return collapse(decodeHtml(stripHtml(String(value ?? '')))).slice(0, maxLength);
}

function parseApiGenres(value: unknown): string {
  const source = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[,#|]/) : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of source) {
    const text = cleanText(entry, 32);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length >= 14) break;
  }
  return out.join(', ');
}

function extractMeta(html: string, property: string): string | null {
  const escaped = escapeRegExp(property);
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i'),
    new RegExp(`<meta\\b[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match) return decodeHtml(match[1]).trim();
  }
  return null;
}

function stripHtml(value: string): string {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function collapse(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string): string {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function uniqueMatches(text: string, pattern: RegExp, limit: number): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) && values.length < limit) {
    const value = decodeHtml(match[1]).replace(/[.,;:!?]+$/g, '').trim();
    if (!value || seen.has(value.toLowerCase())) continue;
    seen.add(value.toLowerCase());
    values.push(value);
  }
  return values;
}

function cleanDescription(value: string | null): string | null {
  if (!value) return null;
  const text = collapse(stripHtml(value));
  return text ? text.slice(0, 1200) : null;
}

function normalizeOfficialAssetUrl(value: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value, NOVELPIA_ORIGIN);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if (host !== 'novelpia.com' && host !== 'www.novelpia.com' && host !== 'images.novelpia.com' && host !== 'image.novelpia.com') return null;
    return url.toString();
  } catch {
    return null;
  }
}

function firstTextMatch(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match?.[1]?.trim() ?? null;
}

function metric(text: string, pattern: RegExp): number {
  const value = firstTextMatch(text, pattern);
  return value ? parseCompactNumber(value) : 0;
}

function parseCompactNumber(value: string): number {
  const normalized = value.replace(/,/g, '').trim().toUpperCase();
  const match = /^([\d.]+)\s*(K|M|B|만|천)?$/u.exec(normalized);
  if (!match) return parseInteger(normalized);
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return 0;
  const multiplier = match[2] === 'K' || match[2] === '천'
    ? 1_000
    : match[2] === 'M'
      ? 1_000_000
      : match[2] === 'B'
        ? 1_000_000_000
        : match[2] === '만'
          ? 10_000
          : 1;
  return Math.max(0, Math.round(base * multiplier));
}

function parseInteger(value: string): number {
  const parsed = Number(String(value).replace(/[^\d]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
