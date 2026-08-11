const RAW_ORIGIN = 'https://raw-fucknovelpia.com';
const PROVIDER = 'raw_fucknovelpia';
const INGEST_PROVIDER = 'raw_fucknovelpia_enrichment';
const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;
const MAX_SEARCH_RESULTS = 4;
const SEARCH_FIELD_CACHE_MS = 30 * 60 * 1000;
const VERIFIED_TTL_MS = 24 * 60 * 60 * 1000;
const PENDING_TTL_MS = 6 * 60 * 60 * 1000;
const ERROR_TTL_MS = 45 * 60 * 1000;
const DEFAULT_ENRICH_LIMIT = 12;

let cachedSearchField: { name: string; expiresAt: number } | null = null;

export type RawFuckNovelpiaResult = {
  provider: 'raw_fucknovelpia';
  external_id: string | null;
  title: string;
  original_title: string | null;
  author: string | null;
  original_language: 'Korean';
  chapter_count: null;
  publication_status: 'ongoing' | 'completed' | null;
  source_url: string | null;
  page_url: string;
  cover_url: string | null;
  raw_available: boolean;
  genres_tags: string;
  synopsis: string | null;
  raw_format: string | null;
  password_required: boolean;
  verified_at: string;
};

export type RawCatalogSourcePresented = {
  catalog_id: number;
  provider: 'raw_fucknovelpia';
  external_id: string | null;
  page_url: string;
  available: boolean;
  verification_status: 'unknown' | 'verified' | 'not_found' | 'error';
  last_checked_at: string | null;
  next_check_at: string | null;
  failure_count: number;
  last_error: string | null;
  raw_format: string | null;
  password_required: boolean;
};

type CatalogCandidate = {
  id: number;
  external_id: string;
  linked_submission_id: number | null;
};

type FetchHtmlResult = {
  html: string;
  finalUrl: string;
};

class RawProviderError extends Error {
  code: string;
  status: number | null;

  constructor(code: string, status: number | null = null) {
    super(code);
    this.name = 'RawProviderError';
    this.code = code;
    this.status = status;
  }
}

export function normalizeRawPageUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim(), RAW_ORIGIN);
    if (url.protocol !== 'https:' || !isRawHost(url.hostname)) return null;
    if (!isRawNovelPath(url.pathname)) return null;
    url.hostname = 'raw-fucknovelpia.com';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function extractNovelpiaId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const direct = /(?:novelpia\.com\/(?:novel|viewer)\/|[?&](?:novel_no|novelNo|id)=)(\d{2,9})/i.exec(value);
  if (direct?.[1]) return direct[1];
  const rawNumeric = /raw-fucknovelpia\.com\/novel\/(\d{2,9})(?:[/?#]|$)/i.exec(value);
  return rawNumeric?.[1] ?? null;
}

export async function searchRawFuckNovelpia(query: string): Promise<RawFuckNovelpiaResult[]> {
  const trimmed = String(query ?? '').trim().slice(0, 160);
  if (trimmed.length < 2) return [];

  const direct = normalizeRawPageUrl(trimmed);
  if (direct) {
    try {
      const item = await inspectRawFuckNovelpiaPage(direct);
      return item ? [item] : [];
    } catch (error) {
      if (isNotFound(error)) return [];
      throw error;
    }
  }

  const novelpiaId = extractNovelpiaId(trimmed) ?? (/^\d{2,9}$/.test(trimmed) ? trimmed : null);
  if (novelpiaId) {
    const directById = `${RAW_ORIGIN}/novel/${novelpiaId}`;
    try {
      const item = await inspectRawFuckNovelpiaPage(directById, novelpiaId);
      if (item) return [item];
    } catch (error) {
      if (!isNotFound(error)) throw error;
    }
  }

  const target = novelpiaId ?? trimmed;
  const searchField = await getSearchTextField();
  const searchUrl = new URL('/search.php', RAW_ORIGIN);
  searchUrl.searchParams.set(searchField, target);
  searchUrl.searchParams.set('view_lang', 'en');
  const { html } = await fetchRawHtml(searchUrl.toString());
  const candidates = extractRawResultLinks(html, target);
  if (!candidates.length) return [];

  const inspected: RawFuckNovelpiaResult[] = [];
  for (let offset = 0; offset < Math.min(candidates.length, 8); offset += 2) {
    const batch = candidates.slice(offset, offset + 2);
    const results = await Promise.all(batch.map(async (candidate) => {
      try {
        return await inspectRawFuckNovelpiaPage(candidate.url, novelpiaId);
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    }));
    for (const item of results) {
      if (!item) continue;
      if (novelpiaId && item.external_id !== novelpiaId) continue;
      inspected.push(item);
    }
    if (novelpiaId && inspected.length) break;
  }

  const deduped = new Map<string, RawFuckNovelpiaResult>();
  for (const item of inspected) {
    const key = item.external_id ? `novelpia:${item.external_id}` : item.page_url;
    const current = deduped.get(key);
    if (!current || scoreRawResult(item, trimmed) > scoreRawResult(current, trimmed)) deduped.set(key, item);
  }

  return [...deduped.values()]
    .sort((a, b) => scoreRawResult(b, trimmed) - scoreRawResult(a, trimmed))
    .slice(0, MAX_SEARCH_RESULTS);
}

export async function inspectRawFuckNovelpiaPage(
  pageUrl: string,
  expectedNovelpiaId: string | null = null,
): Promise<RawFuckNovelpiaResult | null> {
  const safe = normalizeRawPageUrl(pageUrl);
  if (!safe) return null;
  const url = new URL(safe);
  url.searchParams.set('view_lang', 'en');
  const fetched = await fetchRawHtml(url.toString());
  const finalSafe = normalizeRawPageUrl(fetched.finalUrl) ?? safe;
  const html = fetched.html;
  const text = collapse(stripHtml(html));
  const externalId = extractSourceCode(text) ?? extractNovelpiaHrefId(html) ?? extractNumericRawPath(finalSafe);
  if (expectedNovelpiaId && externalId !== expectedNovelpiaId) return null;

  const headings = [...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)]
    .map((match) => collapse(stripHtml(match[1])))
    .filter((value) => value && !/^(description|information|raw update history|recommended next reads|our tags|novelpia tags|설명|정보)$/i.test(value));
  const metaTitle = cleanRawTitle(extractMeta(html, 'og:title') ?? extractTitleTag(html) ?? '');
  const headingTitle = cleanRawTitle(headings[0] ?? '');
  const title = headingTitle || metaTitle || (externalId ? `NovelPia #${externalId}` : 'Unknown title');
  const second = cleanRawTitle(headings[1] ?? '');
  const originalTitle = second && normalizeSearchText(second) !== normalizeSearchText(title) ? second : null;

  const author = firstMatch(
    text,
    /(?:Author|작가)\s*:?\s*(.{1,100}?)(?=\s+(?:Translator group|Uploader|Country|Year|Status|Format|Download|ZIP password|Linked translation|Source code|Source page|Audiobook|번역팀|업로더|국가|연도|상태|형식|다운로드|소스 코드|소스 페이지|오디오북)\b|$)/i,
  );
  const status: 'ongoing' | 'completed' | null = /(?:\bCompleted\b|완결)/i.test(text)
    ? 'completed'
    : /(?:\bOngoing\b|연재중)/i.test(text)
      ? 'ongoing'
      : null;
  const rawAvailable = /RAW ZIP Download|RAW download (?:is )?ready|다운로드\s*:?\s*(?:Available|사용 가능)|\/download\.php/i.test(html);
  const rawFormat = firstMatch(text, /(?:Format|형식)\s*:?\s*(.{1,80}?)(?=\s+(?:Download|ZIP password|Linked translation|Source code|Source page|Audiobook|다운로드|소스 코드|소스 페이지|오디오북)\b|$)/i);
  const passwordText = firstMatch(text, /(?:ZIP password|비밀번호)\s*:?\s*(.{1,80}?)(?=\s+(?:Linked translation|Source code|Source page|Audiobook|연결 번역|소스 코드|소스 페이지|오디오북)\b|$)/i);
  const passwordRequired = Boolean(passwordText && !/^(?:—|-|none|no|없음)$/i.test(passwordText.trim()));
  const sourceUrl = externalId ? `https://novelpia.com/novel/${externalId}` : extractNovelpiaHref(html);
  const cover = extractMeta(html, 'og:image');
  const synopsis = cleanSynopsis(extractMeta(html, 'og:description') ?? extractMeta(html, 'description'));
  const tags = extractTagsFromLinks(html);

  return {
    provider: 'raw_fucknovelpia',
    external_id: externalId,
    title: title.slice(0, 240),
    original_title: originalTitle ? originalTitle.slice(0, 240) : null,
    author: author ? collapse(author).slice(0, 120) : null,
    original_language: 'Korean',
    chapter_count: null,
    publication_status: status,
    source_url: sourceUrl,
    page_url: finalSafe,
    cover_url: cover ? safeHttpUrl(new URL(cover, RAW_ORIGIN).toString()) : null,
    raw_available: rawAvailable,
    genres_tags: tags.join(', '),
    synopsis,
    raw_format: rawFormat ? collapse(rawFormat).slice(0, 100) : null,
    password_required: passwordRequired,
    verified_at: new Date().toISOString(),
  };
}

export async function runRawCatalogEnrichment(
  env: Env,
  scheduledAt = new Date(),
  limit = DEFAULT_ENRICH_LIMIT,
): Promise<{ checked: number; found: number; available: number; errors: number; propagated: number }> {
  const now = scheduledAt.toISOString();
  const safeLimit = Math.max(1, Math.min(30, Math.trunc(limit)));
  await writeIngestState(env, { attempt: now, success: null, error: null, count: null });

  let checked = 0;
  let found = 0;
  let available = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  try {
    const propagatedBefore = await propagateKnownRawSources(env, 24, now);
    const candidates = await loadDueCatalogCandidates(env, now, safeLimit);

    for (let offset = 0; offset < candidates.length; offset += 3) {
      const batch = candidates.slice(offset, offset + 3);
      const results = await Promise.all(batch.map(async (candidate) => {
        try {
          const matches = await searchRawFuckNovelpia(candidate.external_id);
          const exact = matches.find((item) => item.external_id === candidate.external_id) ?? null;
          return { candidate, item: exact, error: null as unknown };
        } catch (error) {
          return { candidate, item: null, error };
        }
      }));

      for (const result of results) {
        checked += 1;
        if (result.error) {
          errors += 1;
          const message = errorMessage(result.error).slice(0, 400);
          errorMessages.push(`${result.candidate.external_id}:${message}`);
          await markCatalogSourceError(env, result.candidate, scheduledAt, message);
          continue;
        }
        if (!result.item) {
          await markCatalogSourceNotFound(env, result.candidate, scheduledAt);
          continue;
        }

        found += 1;
        if (result.item.raw_available) available += 1;
        await persistCatalogRawSource(env, result.candidate, result.item, scheduledAt);
        if (result.candidate.linked_submission_id) {
          await propagateCatalogRawSourceToSubmission(
            env,
            result.candidate.id,
            result.candidate.linked_submission_id,
            now,
          );
        }
      }
    }

    const propagatedAfter = await propagateKnownRawSources(env, 24, now);
    const warning = errorMessages.length ? errorMessages.slice(0, 5).join('; ').slice(0, 1200) : null;
    await writeIngestState(env, {
      attempt: now,
      success: now,
      error: warning,
      count: checked,
    });
    return {
      checked,
      found,
      available,
      errors,
      propagated: propagatedBefore + propagatedAfter,
    };
  } catch (error) {
    await writeIngestState(env, {
      attempt: now,
      success: null,
      error: errorMessage(error).slice(0, 1200),
      count: checked,
    });
    throw error;
  }
}

export async function getRawIngestState(env: Env) {
  return env.DB.prepare(`
    SELECT provider, last_attempt_at, last_success_at, last_error, last_item_count, updated_at
    FROM discovery_ingest_state WHERE provider = ?
  `).bind(INGEST_PROVIDER).first<{
    provider: string;
    last_attempt_at: string | null;
    last_success_at: string | null;
    last_error: string | null;
    last_item_count: number;
    updated_at: string;
  }>();
}

export async function loadRawCatalogSourceMap(
  env: Env,
  catalogIds: number[],
): Promise<Map<number, RawCatalogSourcePresented>> {
  const out = new Map<number, RawCatalogSourcePresented>();
  const ids = [...new Set(catalogIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return out;

  for (let offset = 0; offset < ids.length; offset += 80) {
    const chunk = ids.slice(offset, offset + 80);
    const placeholders = chunk.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      SELECT catalog_id, provider, external_id, page_url, available, verification_status,
        metadata_json, last_checked_at, next_check_at, failure_count, last_error
      FROM discovery_catalog_sources
      WHERE provider = ? AND catalog_id IN (${placeholders})
    `).bind(PROVIDER, ...chunk).all<any>();
    for (const row of result.results) {
      const metadata = parseJsonObject(row.metadata_json);
      out.set(Number(row.catalog_id), {
        catalog_id: Number(row.catalog_id),
        provider: 'raw_fucknovelpia',
        external_id: row.external_id ? String(row.external_id) : null,
        page_url: String(row.page_url),
        available: Boolean(row.available),
        verification_status: normalizeVerificationStatus(row.verification_status),
        last_checked_at: row.last_checked_at ? String(row.last_checked_at) : null,
        next_check_at: row.next_check_at ? String(row.next_check_at) : null,
        failure_count: Number(row.failure_count ?? 0),
        last_error: row.last_error ? String(row.last_error) : null,
        raw_format: typeof metadata.raw_format === 'string' ? metadata.raw_format : null,
        password_required: Boolean(metadata.password_required),
      });
    }
  }
  return out;
}

export async function propagateCatalogRawSourceToSubmission(
  env: Env,
  catalogId: number,
  submissionId: number,
  now = new Date().toISOString(),
): Promise<boolean> {
  const source = await env.DB.prepare(`
    SELECT c.external_id AS novelpia_id, c.source_url AS novelpia_url,
      s.external_id, s.page_url, s.available, s.verification_status, s.metadata_json, s.last_checked_at
    FROM discovery_catalog c
    JOIN discovery_catalog_sources s ON s.catalog_id = c.id AND s.provider = ?
    WHERE c.id = ? AND c.provider = 'novelpia'
  `).bind(PROVIDER, catalogId).first<any>();
  if (!source || source.verification_status !== 'verified') return false;

  const externalId = String(source.external_id ?? source.novelpia_id ?? '').trim() || null;
  if (externalId) {
    const owner = await env.DB.prepare(`
      SELECT submission_id FROM submission_external_sources
      WHERE provider = ? AND external_id = ?
      LIMIT 1
    `).bind(PROVIDER, externalId).first<{ submission_id: number }>();
    if (owner && Number(owner.submission_id) !== submissionId) return false;
  }

  const metadata = {
    ...parseJsonObject(source.metadata_json),
    verification_status: 'verified',
    catalog_id: catalogId,
    novelpia_id: String(source.novelpia_id),
  };
  await env.DB.prepare(`
    INSERT INTO submission_external_sources (
      submission_id, provider, external_id, page_url, original_url,
      raw_available, metadata_json, last_checked_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    PROVIDER,
    externalId,
    String(source.page_url),
    String(source.novelpia_url),
    Number(Boolean(source.available)),
    JSON.stringify(metadata).slice(0, 8000),
    String(source.last_checked_at ?? now),
    now,
    now,
  ).run();
  return true;
}

async function getSearchTextField(): Promise<string> {
  if (cachedSearchField && cachedSearchField.expiresAt > Date.now()) return cachedSearchField.name;
  try {
    const { html } = await fetchRawHtml(`${RAW_ORIGIN}/search.php?view_lang=en`);
    const tags = html.match(/<input\b[^>]*>/gi) ?? [];
    for (const tag of tags) {
      const placeholder = decodeHtml(extractAttribute(tag, 'placeholder') ?? '').toLowerCase();
      const name = extractAttribute(tag, 'name');
      if (!name) continue;
      if (placeholder.includes('text search') || placeholder.includes('quick search')) {
        cachedSearchField = { name, expiresAt: Date.now() + SEARCH_FIELD_CACHE_MS };
        return name;
      }
    }
  } catch {
    // The live search request below will surface provider availability.
  }
  cachedSearchField = { name: 'q', expiresAt: Date.now() + 5 * 60 * 1000 };
  return 'q';
}

function extractRawResultLinks(html: string, query: string): Array<{ url: string; text: string; score: number }> {
  const out: Array<{ url: string; text: string; score: number }> = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']*\/novel\/(?:raw-[a-z0-9-]+|\d{2,9})(?:[?#][^"']*)?)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && out.length < 100) {
    let url: URL;
    try {
      url = new URL(decodeHtml(match[1]), RAW_ORIGIN);
    } catch {
      continue;
    }
    if (!isRawHost(url.hostname) || !isRawNovelPath(url.pathname)) continue;
    url.hostname = 'raw-fucknovelpia.com';
    url.search = '';
    url.hash = '';
    const canonical = url.toString();
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    const text = collapse(stripHtml(match[2]));
    out.push({ url: canonical, text, score: scoreText(text, query) });
  }
  return out.sort((a, b) => b.score - a.score);
}

async function fetchRawHtml(input: string): Promise<FetchHtmlResult> {
  let current = new URL(input, RAW_ORIGIN);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    validateRawFetchUrl(current);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9,ko;q=0.5',
          'user-agent': 'DollarTL-RAW-Discovery/2.0',
        },
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') throw new RawProviderError('provider_timeout');
      throw new RawProviderError(`provider_network:${errorMessage(error)}`);
    }

    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new RawProviderError(`provider_redirect_${response.status}`, response.status);
        if (redirectCount >= MAX_REDIRECTS) throw new RawProviderError('provider_too_many_redirects');
        current = new URL(location, current);
        continue;
      }
      if (response.status === 404 || response.status === 410) throw new RawProviderError('provider_not_found', response.status);
      if (!response.ok) throw new RawProviderError(`provider_http_${response.status}`, response.status);
      const type = (response.headers.get('content-type') ?? '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) {
        throw new RawProviderError('provider_non_html');
      }
      const contentLength = Number(response.headers.get('content-length') ?? '0');
      if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
        throw new RawProviderError('provider_response_too_large');
      }
      const html = await readResponseTextLimited(response, MAX_HTML_BYTES);
      return { html, finalUrl: current.toString() };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new RawProviderError('provider_too_many_redirects');
}

async function readResponseTextLimited(response: Response, maxBytes: number): Promise<string> {
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
      if (total > maxBytes) throw new RawProviderError('provider_response_too_large');
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } finally {
    try {
      await reader.cancel();
    } catch {}
  }
}

function validateRawFetchUrl(url: URL): void {
  if (url.protocol !== 'https:' || !isRawHost(url.hostname)) throw new RawProviderError('invalid_external_host');
  if (!['/', '/search.php'].includes(url.pathname) && !isRawNovelPath(url.pathname)) {
    throw new RawProviderError('invalid_external_path');
  }
}

async function loadDueCatalogCandidates(env: Env, now: string, limit: number): Promise<CatalogCandidate[]> {
  const result = await env.DB.prepare(`
    SELECT c.id, c.external_id, c.linked_submission_id
    FROM discovery_catalog c
    LEFT JOIN discovery_catalog_sources s
      ON s.catalog_id = c.id AND s.provider = ?
    WHERE c.provider = 'novelpia'
      AND (
        c.linked_submission_id IS NOT NULL
        OR EXISTS (
          SELECT 1 FROM discovery_catalog_signals sig
          WHERE sig.catalog_id = c.id AND sig.last_seen_at >= datetime(?, '-16 days')
        )
      )
      AND (s.catalog_id IS NULL OR s.next_check_at IS NULL OR s.next_check_at <= ?)
    ORDER BY
      CASE WHEN s.catalog_id IS NULL THEN 0 ELSE 1 END,
      CASE WHEN c.linked_submission_id IS NOT NULL THEN 0 ELSE 1 END,
      c.first_seen_at DESC
    LIMIT ?
  `).bind(PROVIDER, now, now, limit).all<CatalogCandidate>();
  return result.results.map((row) => ({
    id: Number(row.id),
    external_id: String(row.external_id),
    linked_submission_id: row.linked_submission_id == null ? null : Number(row.linked_submission_id),
  }));
}

async function persistCatalogRawSource(
  env: Env,
  candidate: CatalogCandidate,
  item: RawFuckNovelpiaResult,
  checkedAt: Date,
): Promise<void> {
  const now = checkedAt.toISOString();
  const nextCheck = new Date(checkedAt.getTime() + (item.raw_available ? VERIFIED_TTL_MS : PENDING_TTL_MS)).toISOString();
  const metadata = {
    title: item.title,
    original_title: item.original_title,
    author: item.author,
    genres_tags: item.genres_tags,
    synopsis: item.synopsis,
    raw_format: item.raw_format,
    password_required: item.password_required,
    cover_url: item.cover_url,
  };
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO discovery_catalog_sources (
        catalog_id, provider, external_id, page_url, original_url, available,
        verification_status, metadata_json, last_checked_at, next_check_at,
        failure_count, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?, 0, NULL, ?, ?)
      ON CONFLICT(catalog_id, provider) DO UPDATE SET
        external_id = excluded.external_id,
        page_url = excluded.page_url,
        original_url = excluded.original_url,
        available = excluded.available,
        verification_status = 'verified',
        metadata_json = excluded.metadata_json,
        last_checked_at = excluded.last_checked_at,
        next_check_at = excluded.next_check_at,
        failure_count = 0,
        last_error = NULL,
        updated_at = excluded.updated_at
    `).bind(
      candidate.id,
      PROVIDER,
      item.external_id,
      item.page_url,
      item.source_url,
      Number(item.raw_available),
      JSON.stringify(metadata).slice(0, 8000),
      now,
      nextCheck,
      now,
      now,
    ),
    env.DB.prepare('UPDATE discovery_catalog SET raw_available = ?, updated_at = ? WHERE id = ?')
      .bind(Number(item.raw_available), now, candidate.id),
  ]);
}

async function markCatalogSourceNotFound(env: Env, candidate: CatalogCandidate, checkedAt: Date): Promise<void> {
  const now = checkedAt.toISOString();
  const nextCheck = new Date(checkedAt.getTime() + PENDING_TTL_MS).toISOString();
  const probeUrl = `${RAW_ORIGIN}/novel/${candidate.external_id}`;
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO discovery_catalog_sources (
        catalog_id, provider, external_id, page_url, original_url, available,
        verification_status, metadata_json, last_checked_at, next_check_at,
        failure_count, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 0, 'not_found', NULL, ?, ?, 0, NULL, ?, ?)
      ON CONFLICT(catalog_id, provider) DO UPDATE SET
        external_id = excluded.external_id,
        page_url = excluded.page_url,
        original_url = excluded.original_url,
        available = 0,
        verification_status = 'not_found',
        last_checked_at = excluded.last_checked_at,
        next_check_at = excluded.next_check_at,
        failure_count = 0,
        last_error = NULL,
        updated_at = excluded.updated_at
    `).bind(
      candidate.id,
      PROVIDER,
      candidate.external_id,
      probeUrl,
      `https://novelpia.com/novel/${candidate.external_id}`,
      now,
      nextCheck,
      now,
      now,
    ),
    env.DB.prepare('UPDATE discovery_catalog SET raw_available = 0, updated_at = ? WHERE id = ?')
      .bind(now, candidate.id),
  ]);
}

async function markCatalogSourceError(
  env: Env,
  candidate: CatalogCandidate,
  checkedAt: Date,
  message: string,
): Promise<void> {
  const now = checkedAt.toISOString();
  const nextCheck = new Date(checkedAt.getTime() + ERROR_TTL_MS).toISOString();
  const probeUrl = `${RAW_ORIGIN}/novel/${candidate.external_id}`;
  await env.DB.prepare(`
    INSERT INTO discovery_catalog_sources (
      catalog_id, provider, external_id, page_url, original_url, available,
      verification_status, metadata_json, last_checked_at, next_check_at,
      failure_count, last_error, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 0, 'error', NULL, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(catalog_id, provider) DO UPDATE SET
      verification_status = 'error',
      last_checked_at = excluded.last_checked_at,
      next_check_at = excluded.next_check_at,
      failure_count = discovery_catalog_sources.failure_count + 1,
      last_error = excluded.last_error,
      updated_at = excluded.updated_at
  `).bind(
    candidate.id,
    PROVIDER,
    candidate.external_id,
    probeUrl,
    `https://novelpia.com/novel/${candidate.external_id}`,
    now,
    nextCheck,
    message,
    now,
    now,
  ).run();
}

async function propagateKnownRawSources(env: Env, limit: number, now: string): Promise<number> {
  const result = await env.DB.prepare(`
    SELECT c.id AS catalog_id, c.linked_submission_id
    FROM discovery_catalog c
    JOIN discovery_catalog_sources s
      ON s.catalog_id = c.id AND s.provider = ? AND s.verification_status = 'verified'
    WHERE c.provider = 'novelpia' AND c.linked_submission_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM submission_external_sources es
        WHERE es.submission_id = c.linked_submission_id AND es.provider = ?
      )
    ORDER BY c.updated_at DESC
    LIMIT ?
  `).bind(PROVIDER, PROVIDER, limit).all<{ catalog_id: number; linked_submission_id: number }>();
  let propagated = 0;
  for (const row of result.results) {
    try {
      if (await propagateCatalogRawSourceToSubmission(env, Number(row.catalog_id), Number(row.linked_submission_id), now)) {
        propagated += 1;
      }
    } catch (error) {
      console.warn(JSON.stringify({
        event: 'raw_catalog_source_propagation_failed',
        catalog_id: Number(row.catalog_id),
        submission_id: Number(row.linked_submission_id),
        error: errorMessage(error),
      }));
    }
  }
  return propagated;
}

async function writeIngestState(
  env: Env,
  value: { attempt: string; success: string | null; error: string | null; count: number | null },
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO discovery_ingest_state (
      provider, last_attempt_at, last_success_at, last_error, last_item_count, updated_at
    ) VALUES (?, ?, ?, ?, COALESCE(?, 0), ?)
    ON CONFLICT(provider) DO UPDATE SET
      last_attempt_at = excluded.last_attempt_at,
      last_success_at = COALESCE(excluded.last_success_at, discovery_ingest_state.last_success_at),
      last_error = excluded.last_error,
      last_item_count = COALESCE(?, discovery_ingest_state.last_item_count),
      updated_at = excluded.updated_at
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

function isRawNovelPath(pathname: string): boolean {
  return /^\/novel\/(?:raw-[a-z0-9-]+|\d{2,9})\/?$/i.test(pathname);
}

function isRawHost(hostname: string): boolean {
  return hostname === 'raw-fucknovelpia.com' || hostname === 'www.raw-fucknovelpia.com';
}

function extractNumericRawPath(value: string): string | null {
  try {
    const url = new URL(value);
    const match = /^\/novel\/(\d{2,9})\/?$/i.exec(url.pathname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function extractSourceCode(text: string): string | null {
  return firstMatch(text, /(?:Source code|소스 코드)\s*:?\s*(\d{2,9})/i);
}

function extractNovelpiaHrefId(html: string): string | null {
  const href = extractNovelpiaHref(html);
  return href ? extractNovelpiaId(href) : null;
}

function extractNovelpiaHref(html: string): string | null {
  const match = /href=["'](https:\/\/(?:www\.)?novelpia\.com\/novel\/\d+[^"']*)["']/i.exec(html);
  return match ? safeHttpUrl(decodeHtml(match[1])) : null;
}

function extractTagsFromLinks(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /href=["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && out.length < 18) {
    let url: URL;
    try {
      url = new URL(decodeHtml(match[1]), RAW_ORIGIN);
    } catch {
      continue;
    }
    if (!isRawHost(url.hostname)) continue;
    const values = [...url.searchParams.getAll('tags[0]'), ...url.searchParams.getAll('source_tags[0]')];
    for (const raw of values) {
      const value = collapse(decodeHtml(raw)).slice(0, 48);
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
      if (out.length >= 18) break;
    }
  }
  return out;
}

function scoreRawResult(row: RawFuckNovelpiaResult, query: string): number {
  return Math.max(
    scoreText(row.title, query),
    scoreText(row.original_title ?? '', query),
    row.external_id === query ? 110 : 0,
  );
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

function cleanRawTitle(value: string): string {
  return decodeHtml(collapse(stripHtml(value)))
    .replace(/\s*\|\s*RAW Download\s*\|\s*FUCKNOVELPIA RAWS.*$/i, '')
    .replace(/\s*\|\s*FUCKNOVELPIA RAWS.*$/i, '')
    .trim();
}

function cleanSynopsis(value: string | null): string | null {
  if (!value) return null;
  const text = collapse(decodeHtml(stripHtml(value)))
    .replace(/\s*\|\s*FUCKNOVELPIA RAWS.*$/i, '')
    .trim();
  return text ? text.slice(0, 1200) : null;
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

function extractTitleTag(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? collapse(stripHtml(match[1])) : null;
}

function extractAttribute(tag: string, name: string): string | null {
  const escaped = escapeRegExp(name);
  const quoted = new RegExp(`\\b${escaped}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  if (quoted) return quoted[1];
  const bare = new RegExp(`\\b${escaped}\\s*=\\s*([^\\s>]+)`, 'i').exec(tag);
  return bare?.[1] ?? null;
}

function firstMatch(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match?.[1]?.trim() ?? null;
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

function stripHtml(value: string): string {
  return decodeHtml(String(value ?? '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function collapse(value: string): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function normalizeVerificationStatus(value: unknown): RawCatalogSourcePresented['verification_status'] {
  return value === 'verified' || value === 'not_found' || value === 'error' ? value : 'unknown';
}

function isNotFound(error: unknown): boolean {
  return error instanceof RawProviderError && error.code === 'provider_not_found';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
