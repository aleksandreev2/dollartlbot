const NOVELPIA_ORIGIN = 'https://novelpia.com';
const HOMEPAGE_URL = `${NOVELPIA_ORIGIN}/`;
const INGEST_PROVIDER = 'novelpia_homepage_fresh';
const HOMEPAGE_SIGNAL = 'novelpia_home_plus_new';
const PLUS_NEW_SIGNAL = 'novelpia_plus_new';
const FREE_NEW_SIGNAL = 'novelpia_free_new';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 3_000_000;
const MAX_REDIRECTS = 3;
const MAX_HOMEPAGE_CARDS = 12;
const MAX_SOURCE_IDS = 80;
const MAX_FALLBACK_DETAIL_FETCHES = 28;

type SourceTier = 'free' | 'plus';

type ResolutionSource = {
  name: 'plus_new' | 'free_new' | 'new_rank';
  url: string;
  tier: SourceTier;
};

type SourcePage = ResolutionSource & { html: string };

type HomepageFreshCard = {
  rank: number;
  title: string;
  author: string | null;
};

type Resolution = {
  externalId: string;
  tier: SourceTier;
  source: ResolutionSource['name'];
};

type ParsedDetail = {
  externalId: string;
  title: string;
  author: string | null;
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
  title: string;
  author: string | null;
  linked_submission_id: number | null;
};

type IdPosition = { id: string; index: number };

const RESOLUTION_SOURCES: ResolutionSource[] = [
  {
    name: 'plus_new',
    url: `${NOVELPIA_ORIGIN}/plus/entry/date?main_genre=`,
    tier: 'plus',
  },
  {
    name: 'free_new',
    url: `${NOVELPIA_ORIGIN}/freestory/new/date/1?main_genre=`,
    tier: 'free',
  },
  {
    name: 'new_rank',
    url: `${NOVELPIA_ORIGIN}/top100/plus/today/view/all/all?main_genre=`,
    tier: 'plus',
  },
];

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
    const fetched = await Promise.all([
      fetchNovelpiaHtml(HOMEPAGE_URL),
      ...RESOLUTION_SOURCES.map(async (source) => ({ ...source, html: await fetchNovelpiaHtml(source.url) })),
    ]);
    const homepageHtml = fetched[0] as string;
    const sourcePages = fetched.slice(1) as SourcePage[];

    const cards = parseHomepageFreshCards(homepageHtml, MAX_HOMEPAGE_CARDS);
    if (!cards.length) throw new Error('novelpia_homepage_fresh_cards_missing');

    const resolved = resolveHomepageCardsAcrossLists(cards, sourcePages);
    const detailCache = new Map<string, ParsedDetail>();
    const usedIds = new Set<string>([...resolved.values()].map((item) => item.externalId));

    let pending = cards.filter((card) => !resolved.has(card.rank));
    if (pending.length) {
      const sourceCandidates = collectResolutionCandidates(sourcePages)
        .filter((candidate) => !usedIds.has(candidate.externalId));
      let fetchedDetails = 0;

      for (
        let offset = 0;
        offset < sourceCandidates.length && pending.length && fetchedDetails < MAX_FALLBACK_DETAIL_FETCHES;
        offset += 4
      ) {
        const batch = sourceCandidates.slice(
          offset,
          offset + Math.min(4, MAX_FALLBACK_DETAIL_FETCHES - fetchedDetails),
        );
        fetchedDetails += batch.length;
        const details = await Promise.all(batch.map(async (candidate) => {
          try {
            const html = await fetchNovelpiaHtml(`${NOVELPIA_ORIGIN}/novel/${candidate.externalId}`);
            return { candidate, detail: parseNovelDetail(candidate.externalId, html) };
          } catch (error) {
            console.warn(JSON.stringify({
              event: 'novelpia_homepage_detail_probe_failed',
              external_id: candidate.externalId,
              source: candidate.source,
              error: errorMessage(error),
            }));
            return { candidate, detail: null };
          }
        }));

        for (const { candidate, detail } of details) {
          if (!detail) continue;
          detailCache.set(detail.externalId, detail);
          const matches = pending.filter((card) => detailMatchesCard(detail, card));
          if (matches.length !== 1 || usedIds.has(detail.externalId)) continue;
          const card = matches[0];
          resolved.set(card.rank, candidate);
          usedIds.add(detail.externalId);
          pending = pending.filter((item) => item.rank !== card.rank);
        }
      }
    }

    let applied = 0;
    let enriched = 0;
    let linked = 0;
    const unresolvedTitles: string[] = [];

    for (const card of cards) {
      const resolution = resolved.get(card.rank);
      if (!resolution) {
        unresolvedTitles.push(card.title);
        continue;
      }
      const externalId = resolution.externalId;

      let row = await loadCatalogRow(env, externalId);
      const rowMatches = row ? catalogMatchesCard(row, card) : false;
      let detail = detailCache.get(externalId) ?? null;

      if (!row || !rowMatches) {
        if (!detail) {
          try {
            const html = await fetchNovelpiaHtml(`${NOVELPIA_ORIGIN}/novel/${externalId}`);
            detail = parseNovelDetail(externalId, html);
          } catch (error) {
            console.warn(JSON.stringify({
              event: 'novelpia_homepage_detail_failed',
              external_id: externalId,
              title: card.title,
              source: resolution.source,
              error: errorMessage(error),
            }));
            detail = null;
          }
        }
        if (!detail || !detailMatchesCard(detail, card)) {
          unresolvedTitles.push(card.title);
          continue;
        }
        await upsertCatalogNovel(env, detail, resolution.tier, now);
        enriched += 1;
        row = await loadCatalogRow(env, externalId);
      } else {
        await touchCatalogNovel(env, row.id, resolution.tier, now);
      }

      if (!row) {
        unresolvedTitles.push(card.title);
        continue;
      }

      await upsertHomepageSignals(env, row.id, card.rank, resolution, now);
      applied += 1;

      if (row.linked_submission_id == null) {
        const submissionId = await findMatchingSubmission(env, externalId);
        if (submissionId) {
          await linkCatalogRow(env, row.id, submissionId, now);
          linked += 1;
        }
      }
    }

    const warning = unresolvedTitles.length
      ? `novelpia_homepage_unresolved:${unresolvedTitles.length}/${cards.length}:${unresolvedTitles.slice(0, 4).join('|')}`.slice(0, 1200)
      : null;
    await writeIngestState(env, {
      attempt: now,
      success: now,
      error: warning,
      count: applied,
    });

    return {
      cards: cards.length,
      resolved: applied,
      enriched,
      linked,
      unresolved: unresolvedTitles.length,
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

export function parseHomepageFreshCards(html: string, limit = MAX_HOMEPAGE_CARDS): HomepageFreshCard[] {
  const heading = html.indexOf('따끈따끈 신규 작품');
  if (heading < 0) return [];
  const sectionEnd = html.indexOf('</section>', heading);
  if (sectionEnd < 0) return [];
  const scope = html.slice(heading, sectionEnd);
  if (!scope.includes('신규 PLUS 작품')) return [];

  const pattern = /<p\b[^>]*class\s*=\s*(?:"[^"]*\bnov-tit\b[^"]*"|'[^']*\bnov-tit\b[^']*'|[^\s>]*\bnov-tit\b[^\s>]*)[^>]*>([\s\S]*?)<\/p>\s*<p\b[^>]*class\s*=\s*(?:"[^"]*\bnov-writer\b[^"]*"|'[^']*\bnov-writer\b[^']*'|[^\s>]*\bnov-writer\b[^\s>]*)[^>]*>([\s\S]*?)<\/p>/gi;
  const cards: HomepageFreshCard[] = [];
  const seen = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(scope)) && cards.length < limit) {
    const title = normalizeVisibleText(match[1]).slice(0, 240);
    const author = normalizeVisibleText(match[2]).slice(0, 120) || null;
    if (!title) continue;
    const key = `${normalizeIdentityText(title)}|${normalizeIdentityText(author ?? '')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ rank: cards.length + 1, title, author });
  }
  return cards;
}

function resolveHomepageCardsAcrossLists(cards: HomepageFreshCard[], pages: SourcePage[]): Map<number, Resolution> {
  const byRank = new Map<number, Map<string, Resolution>>();

  for (const page of pages) {
    const local = resolveHomepageCardsFromListHtml(cards, page.html);
    for (const [rank, externalId] of local.entries()) {
      const matches = byRank.get(rank) ?? new Map<string, Resolution>();
      const prior = matches.get(externalId);
      matches.set(externalId, {
        externalId,
        tier: prior?.tier === 'plus' || page.tier === 'plus' ? 'plus' : 'free',
        source: prior?.source ?? page.name,
      });
      byRank.set(rank, matches);
    }
  }

  const resolved = new Map<number, Resolution>();
  for (const card of cards) {
    const matches = byRank.get(card.rank);
    if (!matches || matches.size !== 1) continue;
    resolved.set(card.rank, [...matches.values()][0]);
  }
  return resolved;
}

function resolveHomepageCardsFromListHtml(cards: HomepageFreshCard[], html: string): Map<number, string> {
  const resolved = new Map<number, string>();
  const ids = collectExplicitNovelIdPositions(html);
  if (!ids.length) return resolved;
  const claimed = new Set<string>();

  for (const card of cards) {
    const titlePositions = findAllTextPositions(html, card.title);
    const candidates = new Map<string, number>();

    for (const titlePos of titlePositions) {
      const authorWindow = html.slice(Math.max(0, titlePos - 1400), Math.min(html.length, titlePos + 1800));
      if (card.author && !authorWindow.includes(card.author)) continue;
      for (const item of ids) {
        const distance = Math.abs(item.index - titlePos);
        if (distance > 2600) continue;
        const prior = candidates.get(item.id);
        if (prior == null || distance < prior) candidates.set(item.id, distance);
      }
    }

    const ranked = [...candidates.entries()]
      .filter(([id]) => !claimed.has(id))
      .sort((a, b) => a[1] - b[1]);
    if (!ranked.length || ranked[0][1] > 2600) continue;
    if (ranked[1] && ranked[1][1] - ranked[0][1] < 80) continue;
    const externalId = ranked[0][0];
    resolved.set(card.rank, externalId);
    claimed.add(externalId);
  }

  return resolved;
}

function collectResolutionCandidates(pages: SourcePage[]): Resolution[] {
  const byId = new Map<string, Resolution>();
  for (const page of pages) {
    for (const externalId of extractExplicitNovelIds(page.html, MAX_SOURCE_IDS)) {
      const prior = byId.get(externalId);
      if (!prior) {
        byId.set(externalId, { externalId, tier: page.tier, source: page.name });
      } else if (prior.tier === 'free' && page.tier === 'plus') {
        byId.set(externalId, { externalId, tier: 'plus', source: page.name });
      }
    }
  }
  return [...byId.values()];
}

function collectExplicitNovelIdPositions(html: string): IdPosition[] {
  const positions: IdPosition[] = [];
  const patterns = [
    /(?:https?:\/\/(?:www\.)?novelpia\.com)?\/novel\/(\d{2,9})/gi,
    /(?:novel_no|novelNo)["']?\s*[:=]\s*["']?(\d{2,9})/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) positions.push({ id: match[1], index: match.index });
  }
  return positions.sort((a, b) => a.index - b.index);
}

function extractExplicitNovelIds(html: string, limit: number): string[] {
  const ordered = collectExplicitNovelIdPositions(html);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of ordered) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    ids.push(item.id);
    if (ids.length >= limit) break;
  }
  return ids;
}

function findAllTextPositions(haystack: string, needle: string): number[] {
  const positions: number[] = [];
  if (!needle) return positions;
  let offset = 0;
  while (offset < haystack.length) {
    const index = haystack.indexOf(needle, offset);
    if (index < 0) break;
    positions.push(index);
    offset = index + Math.max(1, needle.length);
  }
  return positions;
}

async function loadCatalogRow(env: Env, externalId: string): Promise<CatalogRow | null> {
  return env.DB.prepare(`
    SELECT id,title,author,linked_submission_id
    FROM discovery_catalog
    WHERE provider='novelpia' AND external_id=?
  `).bind(externalId).first<CatalogRow>();
}

function catalogMatchesCard(row: CatalogRow, card: HomepageFreshCard): boolean {
  if (normalizeIdentityText(row.title) !== normalizeIdentityText(card.title)) return false;
  if (card.author) {
    if (!row.author) return false;
    if (normalizeIdentityText(row.author) !== normalizeIdentityText(card.author)) return false;
  }
  return true;
}

function detailMatchesCard(detail: ParsedDetail, card: HomepageFreshCard): boolean {
  if (normalizeIdentityText(detail.title) !== normalizeIdentityText(card.title)) return false;
  if (card.author) {
    if (!detail.author) return false;
    if (normalizeIdentityText(detail.author) !== normalizeIdentityText(card.author)) return false;
  }
  return true;
}

async function upsertCatalogNovel(env: Env, novel: ParsedDetail, tier: SourceTier, now: string): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO discovery_catalog (
      provider,external_id,title,original_title,author,original_language,
      chapter_count,publication_status,genres_tags,synopsis,source_url,cover_url,
      source_tier,age_rating,views_count,favorites_count,recommendations_count,
      raw_available,first_seen_at,last_seen_at,last_enriched_at,metadata_json,created_at,updated_at
    ) VALUES (
      'novelpia',?,?,?,?, 'Korean',?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?
    )
    ON CONFLICT(provider,external_id) DO UPDATE SET
      title=excluded.title,
      original_title=excluded.original_title,
      author=COALESCE(excluded.author,discovery_catalog.author),
      chapter_count=COALESCE(excluded.chapter_count,discovery_catalog.chapter_count),
      publication_status=excluded.publication_status,
      genres_tags=CASE WHEN excluded.genres_tags<>'' THEN excluded.genres_tags ELSE discovery_catalog.genres_tags END,
      synopsis=COALESCE(excluded.synopsis,discovery_catalog.synopsis),
      source_url=excluded.source_url,
      cover_url=COALESCE(excluded.cover_url,discovery_catalog.cover_url),
      source_tier=CASE
        WHEN excluded.source_tier='plus' THEN 'plus'
        ELSE COALESCE(discovery_catalog.source_tier,excluded.source_tier)
      END,
      age_rating=COALESCE(excluded.age_rating,discovery_catalog.age_rating),
      views_count=excluded.views_count,
      favorites_count=excluded.favorites_count,
      recommendations_count=excluded.recommendations_count,
      last_seen_at=excluded.last_seen_at,
      last_enriched_at=excluded.last_enriched_at,
      metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at
  `).bind(
    novel.externalId,
    novel.title,
    novel.title,
    novel.author,
    novel.chapterCount,
    novel.publicationStatus,
    novel.genresTags,
    novel.synopsis,
    `${NOVELPIA_ORIGIN}/novel/${novel.externalId}`,
    novel.coverUrl,
    tier,
    novel.ageRating,
    novel.viewsCount,
    novel.favoritesCount,
    novel.recommendationsCount,
    now,
    now,
    now,
    JSON.stringify({ source: 'official_novelpia_homepage_fresh', resolved_tier: tier }),
    now,
    now,
  ).run();
}

async function touchCatalogNovel(env: Env, catalogId: number, tier: SourceTier, now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE discovery_catalog
    SET last_seen_at=?,
        source_tier=CASE WHEN ?='plus' THEN 'plus' ELSE COALESCE(source_tier,?) END,
        updated_at=?
    WHERE id=?
  `).bind(now, tier, tier, now, catalogId).run();
}

async function upsertHomepageSignals(
  env: Env,
  catalogId: number,
  rank: number,
  resolution: Resolution,
  now: string,
): Promise<void> {
  const normalSignal = resolution.tier === 'plus' ? PLUS_NEW_SIGNAL : FREE_NEW_SIGNAL;
  const metadata = JSON.stringify({
    tier: resolution.tier,
    source: 'homepage_hot_new',
    resolver_source: resolution.source,
    homepage_rank: rank,
  });
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
    `).bind(catalogId, normalSignal, rank, metadata, now, now),
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

function parseNovelDetail(externalId: string, html: string): ParsedDetail | null {
  const canonicalId = extractNovelpiaId(extractMeta(html, 'og:url') ?? '') ?? externalId;
  if (canonicalId !== externalId) return null;
  const rawTitle = extractMeta(html, 'og:title') ?? extractTitleTag(html) ?? '';
  const title = cleanNovelTitle(rawTitle);
  if (!title || /^novelpia\s*#?\d+$/i.test(title)) return null;

  const text = collapse(stripHtml(html));
  const hero = text.slice(0, 9000);
  const author = firstTextMatch(hero, /작가명\s*:?\s*([^\s]{1,80})/u)
    ?? firstTextMatch(hero, /작가\s*:?\s*([^\s]{1,80})/u);
  const chapterRaw = firstTextMatch(hero, /([\d,]{1,8})\s*회차/u);
  const chapterCount = chapterRaw ? parseInteger(chapterRaw) : null;
  const publicationStatus: 'ongoing' | 'completed' = /(?:^|\s)완결(?:\s|$)/u.test(hero) ? 'completed' : 'ongoing';
  const tags = uniqueMatches(hero, /#([^#\s]{1,32})/gu, 14);
  const synopsis = cleanDescription(extractMeta(html, 'og:description') ?? extractMeta(html, 'description'));
  const cover = extractMeta(html, 'og:image');
  const coverUrl = cover ? normalizeOfficialAssetUrl(cover) : null;
  const ageRating = /(?:^|\s)19(?:\s|\+).*?PLUS/u.test(hero) || /19\s*PLUS/u.test(hero) ? '19+' : null;

  return {
    externalId,
    title,
    author: author ? decodeHtml(author).slice(0, 120) : null,
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

async function fetchNovelpiaHtml(initialUrl: string): Promise<string> {
  let current = new URL(initialUrl);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    validateNovelpiaUrl(current);
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
          'user-agent': 'DollarTL-HomepageFresh/2.0',
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
      const type = (response.headers.get('content-type') || '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('novelpia_homepage_non_html');
      const length = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(length) && length > MAX_HTML_BYTES) throw new Error('novelpia_homepage_response_too_large');
      return await readTextLimited(response, MAX_HTML_BYTES);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('novelpia_homepage_redirect_failed');
}

function validateNovelpiaUrl(url: URL): void {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || host !== 'novelpia.com') throw new Error('novelpia_homepage_invalid_host');
  if (url.pathname === '/') return;
  if (url.pathname === '/plus/entry/date') return;
  if (url.pathname === '/freestory/new/date/1') return;
  if (url.pathname === '/top100/plus/today/view/all/all') return;
  if (/^\/novel\/\d{2,9}\/?$/.test(url.pathname)) return;
  throw new Error('novelpia_homepage_invalid_path');
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
  return match ? normalizeVisibleText(match[1]) : null;
}

function cleanNovelTitle(value: string): string {
  let title = normalizeVisibleText(value);
  const marker = '웹소설로 꿈꾸는 세상!';
  if (title.includes(marker)) title = title.slice(title.indexOf(marker) + marker.length).replace(/^\s*[-|:]\s*/, '');
  title = title.replace(/\s*[-|]\s*노벨피아(?:\s*[-|].*)?$/u, '').trim();
  return title.slice(0, 240);
}

function extractNovelpiaId(value: string): string | null {
  const match = /(?:novelpia\.com\/(?:novel|viewer)\/|[?&](?:novel_no|novelNo|id)=)(\d{2,9})/i.exec(value);
  return match?.[1] ?? null;
}

function normalizeVisibleText(value: string): string {
  return collapse(decodeHtml(stripHtml(value)));
}

function normalizeIdentityText(value: string): string {
  return normalizeVisibleText(value).normalize('NFKC').toLowerCase().replace(/[\s\u00a0]+/g, ' ').trim();
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
  const text = normalizeVisibleText(value);
  return text ? text.slice(0, 1200) : null;
}

function normalizeOfficialAssetUrl(value: string): string | null {
  try {
    const url = new URL(value, NOVELPIA_ORIGIN);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') return null;
    if (host !== 'novelpia.com' && host !== 'www.novelpia.com' && host !== 'images.novelpia.com') return null;
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
