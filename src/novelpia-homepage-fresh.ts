const NOVELPIA_ORIGIN = 'https://novelpia.com';
const HOMEPAGE_CURATION_PATH = '/proc/main_v2';
const INGEST_PROVIDER = 'novelpia_homepage_fresh';
const HOMEPAGE_SIGNAL = 'novelpia_home_plus_new';
const PLUS_NEW_SIGNAL = 'novelpia_plus_new';
const FETCH_TIMEOUT_MS = 8_000;
const API_MAX_BYTES = 1_000_000;
const MAX_REDIRECTS = 3;
const MAX_ITEMS = 12;

type ApiNovel = {
  externalId: string;
  title: string;
  author: string | null;
  coverUrl: string | null;
  ageRating: string | null;
  genresTags: string;
  synopsis: string | null;
  publicationStatus: 'ongoing' | 'completed';
  viewsCount: number;
  favoritesCount: number;
  recommendationsCount: number;
  linkUrl: string;
  rank: number;
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

    let linked = 0;
    for (const item of parsed.items) {
      await upsertCatalogNovel(env, item, now);
      const row = await loadCatalogRow(env, item.externalId);
      if (!row) continue;
      await upsertHomepageSignals(env, row.id, item.rank, now);

      if (row.linked_submission_id == null) {
        const submissionId = await findMatchingSubmission(env, item.externalId);
        if (submissionId) {
          await linkCatalogRow(env, row.id, submissionId, now);
          linked += 1;
        }
      }
    }

    await writeIngestState(env, {
      attempt: now,
      success: now,
      error: parsed.warnings.length ? parsed.warnings.join('; ').slice(0, 1200) : null,
      count: parsed.items.length,
    });

    return {
      cards: parsed.sourceCount,
      resolved: parsed.items.length,
      enriched: parsed.items.length,
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
    if (!author) warnings.push(`row_${index + 1}:missing_author`);
    const coverUrl = normalizeOfficialAssetUrl(cleanText(row.cover_url ?? row.novel_thumb ?? row.novel_thumb_all, 1000));
    const age = numberValue(row.novel_age);
    const ageRating = age >= 19 ? '19+' : age >= 15 ? '15+' : null;
    const genresTags = parseApiGenres(row.novel_genre ?? row.genre ?? row.genres);
    const synopsis = cleanText(row.novel_story, 1200) || null;
    const publicationStatus = numberValue(row.is_complete) === 1 ? 'completed' : 'ongoing';

    seen.add(externalId);
    items.push({
      externalId,
      title,
      author,
      coverUrl,
      ageRating,
      genresTags,
      synopsis,
      publicationStatus,
      viewsCount: nonNegativeInteger(row.count_view),
      favoritesCount: nonNegativeInteger(row.count_book),
      recommendationsCount: nonNegativeInteger(row.count_good),
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
          'user-agent': 'DollarTL-HomepageFresh/4.0',
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

function validateApiUrl(url: URL): void {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || host !== 'novelpia.com' || url.pathname !== HOMEPAGE_CURATION_PATH) {
    throw new Error('novelpia_homepage_invalid_url');
  }
  if (url.searchParams.get('cmd') !== 'new_novel_curation' || url.searchParams.get('novel_category') !== 'entry') {
    throw new Error('novelpia_homepage_invalid_query');
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
      if (total > maxBytes) throw new Error('novelpia_homepage_response_too_large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    try { await reader.cancel(); } catch {}
  }
}

async function upsertCatalogNovel(env: Env, item: ApiNovel, now: string): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO discovery_catalog (
      provider,external_id,title,original_title,author,original_language,
      chapter_count,publication_status,genres_tags,synopsis,source_url,cover_url,
      source_tier,age_rating,views_count,favorites_count,recommendations_count,
      raw_available,first_seen_at,last_seen_at,last_enriched_at,metadata_json,created_at,updated_at
    ) VALUES (
      'novelpia',?,?,?,?, 'Korean',NULL,?,?,?,?,?, 'plus',?,?,?, ?,0,?,?,?,?,?,?
    )
    ON CONFLICT(provider,external_id) DO UPDATE SET
      title=excluded.title,
      original_title=excluded.original_title,
      author=COALESCE(excluded.author,discovery_catalog.author),
      publication_status=excluded.publication_status,
      genres_tags=CASE WHEN excluded.genres_tags<>'' THEN excluded.genres_tags ELSE discovery_catalog.genres_tags END,
      synopsis=COALESCE(excluded.synopsis,discovery_catalog.synopsis),
      source_url=excluded.source_url,
      cover_url=COALESCE(excluded.cover_url,discovery_catalog.cover_url),
      source_tier='plus',
      age_rating=COALESCE(excluded.age_rating,discovery_catalog.age_rating),
      views_count=excluded.views_count,
      favorites_count=excluded.favorites_count,
      recommendations_count=excluded.recommendations_count,
      last_seen_at=excluded.last_seen_at,
      last_enriched_at=excluded.last_enriched_at,
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `).bind(
    item.externalId,
    item.title,
    item.title,
    item.author,
    item.publicationStatus,
    item.genresTags,
    item.synopsis,
    `${NOVELPIA_ORIGIN}/novel/${item.externalId}`,
    item.coverUrl,
    item.ageRating,
    item.viewsCount,
    item.favoritesCount,
    item.recommendationsCount,
    now,
    now,
    now,
    JSON.stringify({
      source: 'novelpia_main_v2_new_novel_curation',
      homepage_rank: item.rank,
      api_link_url: item.linkUrl,
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
  let source: unknown[] = [];
  if (Array.isArray(value)) {
    source = value;
  } else if (typeof value === 'string' && value.trim()) {
    const raw = value.trim();
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        source = Array.isArray(parsed) ? parsed : [];
      } catch {
        source = raw.split(/[,#|]/);
      }
    } else {
      source = raw.split(/[,#|]/);
    }
  }
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

function nonNegativeInteger(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
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

function stripHtml(value: string): string {
  return String(value || '').replace(/<[^>]+>/g, ' ');
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

async function writeIngestState(
  env: Env,
  value: { attempt: string; success: string | null; error: string | null; count: number | null },
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO discovery_ingest_state (
      provider,last_attempt_at,last_success_at,last_error,last_item_count,updated_at
    ) VALUES (?,?,?,?,COALESCE(?,0),?)
    ON CONFLICT(provider) DO UPDATE SET
      last_attempt_at=excluded.last_attempt_at,
      last_success_at=COALESCE(excluded.last_success_at,discovery_ingest_state.last_success_at),
      last_error=excluded.last_error,
      last_item_count=COALESCE(?,discovery_ingest_state.last_item_count),
      updated_at=excluded.updated_at
  `).bind(
    INGEST_PROVIDER,
    value.attempt,
    value.success,
    value.error,
    value.count,
    value.attempt,
    value.count,
  ).run();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
