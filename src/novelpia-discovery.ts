const NOVELPIA_ORIGIN = 'https://novelpia.com';
const PROVIDER = 'novelpia';
const INGEST_PROVIDER = 'novelpia_fresh';
const MAX_DETAIL_FETCHES = 24;
const DETAIL_STALE_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

type SignalName = 'novelpia_free_new' | 'novelpia_plus_new' | 'novelpia_new_rank';

type SourceDefinition = {
  signal: SignalName;
  url: string;
  tier: 'free' | 'plus';
  maxIds: number;
  priority: number;
};

type Candidate = {
  externalId: string;
  tier: 'free' | 'plus';
  signals: Map<SignalName, number>;
  priority: number;
};

type CatalogDbRow = {
  id: number;
  external_id: string;
  last_enriched_at: string | null;
  linked_submission_id: number | null;
};

type ParsedNovel = {
  externalId: string;
  title: string;
  originalTitle: string;
  author: string | null;
  chapterCount: number | null;
  publicationStatus: 'ongoing' | 'completed';
  genresTags: string;
  synopsis: string | null;
  sourceUrl: string;
  coverUrl: string | null;
  sourceTier: 'free' | 'plus';
  ageRating: string | null;
  viewsCount: number;
  favoritesCount: number;
  recommendationsCount: number;
};

export type DiscoveryCatalogPresented = {
  kind: 'catalog';
  catalog_id: number;
  provider: 'novelpia';
  external_id: string;
  title: string;
  original_title: string | null;
  author: string | null;
  original_language: 'Korean';
  chapter_count: number | null;
  publication_status: string | null;
  genres_tags: string;
  synopsis: string | null;
  source_url: string;
  page_url: string;
  cover_url: string | null;
  source_tier: string | null;
  age_rating: string | null;
  views_count: number;
  favorites_count: number;
  recommendations_count: number;
  raw_available: boolean;
  demand_count: number;
  viewer_interested: boolean;
  linked_submission_id: number | null;
  source_rank: number | null;
  fresh_signals: string[];
  discovered_at: string;
  updated_at: string;
};

const SOURCES: SourceDefinition[] = [
  {
    signal: 'novelpia_plus_new',
    url: `${NOVELPIA_ORIGIN}/plus/entry/date?main_genre=`,
    tier: 'plus',
    maxIds: 48,
    priority: 0,
  },
  {
    signal: 'novelpia_free_new',
    url: `${NOVELPIA_ORIGIN}/freestory/new/date/1?main_genre=`,
    tier: 'free',
    maxIds: 40,
    priority: 1,
  },
  {
    signal: 'novelpia_new_rank',
    url: `${NOVELPIA_ORIGIN}/top100/plus/today/view/all/all?main_genre=`,
    tier: 'plus',
    maxIds: 50,
    priority: 2,
  },
];

export async function runNovelpiaDiscoveryIngestion(env: Env, scheduledAt = new Date()): Promise<{
  candidates: number;
  enriched: number;
  linked: number;
}> {
  const now = scheduledAt.toISOString();
  await writeIngestState(env, { attempt: now, success: null, error: null, count: null });

  try {
    const candidates = new Map<string, Candidate>();
    const sourceErrors: string[] = [];

    for (const source of SOURCES) {
      try {
        const html = await fetchNovelpiaHtml(source.url);
        const ids = extractNovelIds(html, source.maxIds);
        ids.forEach((externalId, index) => {
          const current = candidates.get(externalId) ?? {
            externalId,
            tier: source.tier,
            signals: new Map<SignalName, number>(),
            priority: source.priority,
          };
          if (source.tier === 'plus') current.tier = 'plus';
          current.priority = Math.min(current.priority, source.priority);
          current.signals.set(source.signal, index + 1);
          candidates.set(externalId, current);
        });
      } catch (error) {
        sourceErrors.push(`${source.signal}:${errorMessage(error)}`);
      }
    }

    if (!candidates.size) {
      throw new Error(sourceErrors.length ? sourceErrors.join('; ') : 'novelpia_no_candidates');
    }

    const existing = await loadExistingCatalogRows(env, [...candidates.keys()]);
    const enrichQueue = [...candidates.values()]
      .map((candidate) => ({ candidate, existing: existing.get(candidate.externalId) ?? null }))
      .sort((a, b) => {
        const aNew = a.existing ? 1 : 0;
        const bNew = b.existing ? 1 : 0;
        if (aNew !== bNew) return aNew - bNew;
        if (a.candidate.priority !== b.candidate.priority) return a.candidate.priority - b.candidate.priority;
        return minSignalRank(a.candidate) - minSignalRank(b.candidate);
      })
      .filter(({ existing: row }) => !row || isEnrichmentStale(row.last_enriched_at, scheduledAt))
      .slice(0, MAX_DETAIL_FETCHES);

    let enriched = 0;
    for (let offset = 0; offset < enrichQueue.length; offset += 4) {
      const batch = enrichQueue.slice(offset, offset + 4);
      const results = await Promise.all(batch.map(async ({ candidate }) => {
        try {
          const html = await fetchNovelpiaHtml(`${NOVELPIA_ORIGIN}/novel/${candidate.externalId}`);
          return { candidate, parsed: parseNovelDetail(candidate, html) };
        } catch (error) {
          console.warn(JSON.stringify({
            event: 'novelpia_discovery_detail_failed',
            external_id: candidate.externalId,
            error: errorMessage(error),
          }));
          return { candidate, parsed: null };
        }
      }));
      for (const result of results) {
        if (!result.parsed) continue;
        await upsertCatalogNovel(env, result.parsed, now);
        enriched += 1;
      }
    }

    const refreshed = await loadExistingCatalogRows(env, [...candidates.keys()]);
    let linked = 0;
    for (const candidate of candidates.values()) {
      const row = refreshed.get(candidate.externalId);
      if (!row) continue;
      await touchCatalogNovel(env, row.id, candidate.tier, now);
      await upsertSignals(env, row.id, candidate, now);
      if (row.linked_submission_id == null) {
        const linkedSubmissionId = await findMatchingSubmission(env, candidate.externalId);
        if (linkedSubmissionId) {
          await linkCatalogToSubmission(env, row.id, linkedSubmissionId);
          linked += 1;
        }
      }
    }

    const warning = sourceErrors.length ? sourceErrors.join('; ').slice(0, 1200) : null;
    await writeIngestState(env, {
      attempt: now,
      success: now,
      error: warning,
      count: candidates.size,
    });

    return { candidates: candidates.size, enriched, linked };
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

export async function loadFreshNovelpiaCatalog(
  env: Env,
  viewerId: number,
  limit = 32,
): Promise<DiscoveryCatalogPresented[]> {
  const safeLimit = Math.max(1, Math.min(80, Math.trunc(limit)));
  const result = await env.DB.prepare(`
    SELECT
      c.id, c.external_id, c.title, c.original_title, c.author, c.original_language,
      c.chapter_count, c.publication_status, c.genres_tags, c.synopsis, c.source_url,
      c.cover_url, c.source_tier, c.age_rating, c.views_count, c.favorites_count,
      c.recommendations_count, c.raw_available, c.linked_submission_id,
      c.first_seen_at, c.updated_at,
      (SELECT COUNT(*) FROM discovery_catalog_interests ci WHERE ci.catalog_id = c.id) AS demand_count,
      EXISTS(
        SELECT 1 FROM discovery_catalog_interests civ
        WHERE civ.catalog_id = c.id AND civ.user_id = ?
      ) AS viewer_interested,
      (SELECT MIN(s.rank_position) FROM discovery_catalog_signals s
        WHERE s.catalog_id = c.id AND s.signal = 'novelpia_new_rank') AS source_rank,
      (SELECT GROUP_CONCAT(s2.signal, ',') FROM discovery_catalog_signals s2
        WHERE s2.catalog_id = c.id) AS signal_list
    FROM discovery_catalog c
    WHERE c.provider = 'novelpia' AND c.linked_submission_id IS NULL
      AND EXISTS (
        SELECT 1 FROM discovery_catalog_signals active
        WHERE active.catalog_id = c.id
          AND active.last_seen_at >= datetime('now', '-16 days')
      )
    ORDER BY
      CASE WHEN EXISTS (
        SELECT 1 FROM discovery_catalog_signals fresh
        WHERE fresh.catalog_id = c.id AND fresh.signal IN ('novelpia_plus_new','novelpia_free_new')
      ) THEN 0 ELSE 1 END,
      c.first_seen_at DESC,
      COALESCE(source_rank, 9999) ASC,
      c.views_count DESC
    LIMIT ?
  `).bind(viewerId, safeLimit).all<{
    id: number;
    external_id: string;
    title: string;
    original_title: string | null;
    author: string | null;
    original_language: string;
    chapter_count: number | null;
    publication_status: string | null;
    genres_tags: string;
    synopsis: string | null;
    source_url: string;
    cover_url: string | null;
    source_tier: string | null;
    age_rating: string | null;
    views_count: number;
    favorites_count: number;
    recommendations_count: number;
    raw_available: number;
    linked_submission_id: number | null;
    first_seen_at: string;
    updated_at: string;
    demand_count: number;
    viewer_interested: number;
    source_rank: number | null;
    signal_list: string | null;
  }>();

  return result.results.map(presentCatalogRow);
}

export async function searchNovelpiaCatalog(
  env: Env,
  viewerId: number,
  query: string,
  limit = 8,
): Promise<DiscoveryCatalogPresented[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const needle = `%${escapeLike(normalized)}%`;
  const externalId = extractNovelpiaId(query) ?? (/^\d{2,9}$/.test(query.trim()) ? query.trim() : '');
  const safeLimit = Math.max(1, Math.min(20, Math.trunc(limit)));
  const result = await env.DB.prepare(`
    SELECT
      c.id, c.external_id, c.title, c.original_title, c.author, c.original_language,
      c.chapter_count, c.publication_status, c.genres_tags, c.synopsis, c.source_url,
      c.cover_url, c.source_tier, c.age_rating, c.views_count, c.favorites_count,
      c.recommendations_count, c.raw_available, c.linked_submission_id,
      c.first_seen_at, c.updated_at,
      (SELECT COUNT(*) FROM discovery_catalog_interests ci WHERE ci.catalog_id = c.id) AS demand_count,
      EXISTS(
        SELECT 1 FROM discovery_catalog_interests civ
        WHERE civ.catalog_id = c.id AND civ.user_id = ?
      ) AS viewer_interested,
      (SELECT MIN(s.rank_position) FROM discovery_catalog_signals s
        WHERE s.catalog_id = c.id AND s.signal = 'novelpia_new_rank') AS source_rank,
      (SELECT GROUP_CONCAT(s2.signal, ',') FROM discovery_catalog_signals s2
        WHERE s2.catalog_id = c.id) AS signal_list
    FROM discovery_catalog c
    WHERE c.provider = 'novelpia' AND c.linked_submission_id IS NULL
      AND (
        LOWER(c.title) LIKE ? ESCAPE '!'
        OR LOWER(COALESCE(c.original_title,'')) LIKE ? ESCAPE '!'
        OR LOWER(COALESCE(c.author,'')) LIKE ? ESCAPE '!'
        OR LOWER(c.source_url) LIKE ? ESCAPE '!'
        OR (? <> '' AND c.external_id = ?)
      )
    ORDER BY
      CASE WHEN c.external_id = ? THEN 0 ELSE 1 END,
      demand_count DESC,
      COALESCE(source_rank, 9999) ASC,
      c.first_seen_at DESC
    LIMIT ?
  `).bind(
    viewerId,
    needle,
    needle,
    needle,
    needle,
    externalId,
    externalId,
    externalId,
    safeLimit,
  ).all<any>();
  return result.results.map(presentCatalogRow);
}

export async function toggleCatalogInterest(
  env: Env,
  viewerId: number,
  catalogId: number,
  interested: boolean,
): Promise<{
  catalog_id: number;
  demand_count: number;
  viewer_interested: boolean;
  linked_submission_id: number | null;
}> {
  const catalog = await env.DB.prepare(`
    SELECT id, linked_submission_id
    FROM discovery_catalog
    WHERE id = ? AND provider = 'novelpia'
  `).bind(catalogId).first<{ id: number; linked_submission_id: number | null }>();
  if (!catalog) throw new Error('catalog_not_found');

  if (catalog.linked_submission_id) {
    const submission = await env.DB.prepare('SELECT user_id FROM submissions WHERE id = ? AND status <> ?')
      .bind(catalog.linked_submission_id, 'rejected')
      .first<{ user_id: number }>();
    if (submission && submission.user_id !== viewerId) {
      if (interested) {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO discovery_interests (submission_id, user_id, created_at)
          VALUES (?, ?, ?)
        `).bind(catalog.linked_submission_id, viewerId, new Date().toISOString()).run();
      } else {
        await env.DB.prepare('DELETE FROM discovery_interests WHERE submission_id = ? AND user_id = ?')
          .bind(catalog.linked_submission_id, viewerId).run();
      }
    }
    const local = await env.DB.prepare(`
      SELECT 1 + COUNT(*) AS demand_count,
        EXISTS(SELECT 1 FROM discovery_interests WHERE submission_id = ? AND user_id = ?) AS viewer_interested
      FROM discovery_interests WHERE submission_id = ?
    `).bind(catalog.linked_submission_id, viewerId, catalog.linked_submission_id)
      .first<{ demand_count: number; viewer_interested: number }>();
    return {
      catalog_id: catalog.id,
      demand_count: Number(local?.demand_count ?? 1),
      viewer_interested: Boolean(local?.viewer_interested) || submission?.user_id === viewerId,
      linked_submission_id: catalog.linked_submission_id,
    };
  }

  if (interested) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO discovery_catalog_interests (catalog_id, user_id, created_at)
      VALUES (?, ?, ?)
    `).bind(catalog.id, viewerId, new Date().toISOString()).run();
  } else {
    await env.DB.prepare('DELETE FROM discovery_catalog_interests WHERE catalog_id = ? AND user_id = ?')
      .bind(catalog.id, viewerId).run();
  }

  const summary = await env.DB.prepare(`
    SELECT COUNT(*) AS demand_count,
      EXISTS(SELECT 1 FROM discovery_catalog_interests WHERE catalog_id = ? AND user_id = ?) AS viewer_interested
    FROM discovery_catalog_interests WHERE catalog_id = ?
  `).bind(catalog.id, viewerId, catalog.id)
    .first<{ demand_count: number; viewer_interested: number }>();
  return {
    catalog_id: catalog.id,
    demand_count: Number(summary?.demand_count ?? 0),
    viewer_interested: Boolean(summary?.viewer_interested),
    linked_submission_id: null,
  };
}

export async function getCatalogNovel(env: Env, catalogId: number) {
  return env.DB.prepare(`
    SELECT id, provider, external_id, title, original_title, author, original_language,
      chapter_count, publication_status, genres_tags, source_url, cover_url, raw_available,
      linked_submission_id
    FROM discovery_catalog
    WHERE id = ? AND provider = 'novelpia'
  `).bind(catalogId).first<{
    id: number;
    provider: string;
    external_id: string;
    title: string;
    original_title: string | null;
    author: string | null;
    original_language: string;
    chapter_count: number | null;
    publication_status: string | null;
    genres_tags: string;
    source_url: string;
    cover_url: string | null;
    raw_available: number;
    linked_submission_id: number | null;
  }>();
}

export async function linkCatalogToSubmission(env: Env, catalogId: number, submissionId: number): Promise<void> {
  const submission = await env.DB.prepare('SELECT id, user_id FROM submissions WHERE id = ?')
    .bind(submissionId).first<{ id: number; user_id: number }>();
  if (!submission) throw new Error('submission_not_found');
  const catalog = await getCatalogNovel(env, catalogId);
  if (!catalog) throw new Error('catalog_not_found');
  if (catalog.linked_submission_id && catalog.linked_submission_id !== submissionId) {
    throw new Error('catalog_already_linked');
  }

  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE discovery_catalog SET linked_submission_id = ?, updated_at = ? WHERE id = ?')
      .bind(submissionId, now, catalogId),
    env.DB.prepare(`
      INSERT OR IGNORE INTO discovery_interests (submission_id, user_id, created_at)
      SELECT ?, user_id, created_at
      FROM discovery_catalog_interests
      WHERE catalog_id = ? AND user_id <> ?
    `).bind(submissionId, catalogId, submission.user_id),
    env.DB.prepare('DELETE FROM discovery_catalog_interests WHERE catalog_id = ?').bind(catalogId),
  ]);
}

export async function getNovelpiaIngestState(env: Env) {
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

async function loadExistingCatalogRows(env: Env, externalIds: string[]): Promise<Map<string, CatalogDbRow>> {
  const out = new Map<string, CatalogDbRow>();
  if (!externalIds.length) return out;
  for (let offset = 0; offset < externalIds.length; offset += 80) {
    const chunk = externalIds.slice(offset, offset + 80);
    const placeholders = chunk.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      SELECT id, external_id, last_enriched_at, linked_submission_id
      FROM discovery_catalog
      WHERE provider = 'novelpia' AND external_id IN (${placeholders})
    `).bind(...chunk).all<CatalogDbRow>();
    result.results.forEach((row) => out.set(row.external_id, row));
  }
  return out;
}

async function upsertCatalogNovel(env: Env, novel: ParsedNovel, now: string): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO discovery_catalog (
      provider, external_id, title, original_title, author, original_language,
      chapter_count, publication_status, genres_tags, synopsis, source_url, cover_url,
      source_tier, age_rating, views_count, favorites_count, recommendations_count,
      raw_available, first_seen_at, last_seen_at, last_enriched_at, metadata_json,
      created_at, updated_at
    ) VALUES (
      'novelpia', ?, ?, ?, ?, 'Korean', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(provider, external_id) DO UPDATE SET
      title = excluded.title,
      original_title = excluded.original_title,
      author = COALESCE(excluded.author, discovery_catalog.author),
      chapter_count = COALESCE(excluded.chapter_count, discovery_catalog.chapter_count),
      publication_status = excluded.publication_status,
      genres_tags = CASE WHEN excluded.genres_tags <> '' THEN excluded.genres_tags ELSE discovery_catalog.genres_tags END,
      synopsis = COALESCE(excluded.synopsis, discovery_catalog.synopsis),
      source_url = excluded.source_url,
      cover_url = COALESCE(excluded.cover_url, discovery_catalog.cover_url),
      source_tier = CASE WHEN excluded.source_tier = 'plus' THEN 'plus' ELSE discovery_catalog.source_tier END,
      age_rating = COALESCE(excluded.age_rating, discovery_catalog.age_rating),
      views_count = excluded.views_count,
      favorites_count = excluded.favorites_count,
      recommendations_count = excluded.recommendations_count,
      last_seen_at = excluded.last_seen_at,
      last_enriched_at = excluded.last_enriched_at,
      metadata_json = excluded.metadata_json,
      updated_at = excluded.updated_at
  `).bind(
    novel.externalId,
    novel.title,
    novel.originalTitle,
    novel.author,
    novel.chapterCount,
    novel.publicationStatus,
    novel.genresTags,
    novel.synopsis,
    novel.sourceUrl,
    novel.coverUrl,
    novel.sourceTier,
    novel.ageRating,
    novel.viewsCount,
    novel.favoritesCount,
    novel.recommendationsCount,
    now,
    now,
    now,
    JSON.stringify({ source: 'official_novelpia_public_page' }),
    now,
    now,
  ).run();
}

async function touchCatalogNovel(env: Env, catalogId: number, tier: 'free' | 'plus', now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE discovery_catalog
    SET last_seen_at = ?,
      source_tier = CASE WHEN ? = 'plus' THEN 'plus' ELSE COALESCE(source_tier, ?) END,
      updated_at = ?
    WHERE id = ?
  `).bind(now, tier, tier, now, catalogId).run();
}

async function upsertSignals(env: Env, catalogId: number, candidate: Candidate, now: string): Promise<void> {
  for (const [signal, rankPosition] of candidate.signals.entries()) {
    await env.DB.prepare(`
      INSERT INTO discovery_catalog_signals (
        catalog_id, signal, rank_position, metadata_json, first_seen_at, last_seen_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(catalog_id, signal) DO UPDATE SET
        rank_position = excluded.rank_position,
        metadata_json = excluded.metadata_json,
        last_seen_at = excluded.last_seen_at
    `).bind(
      catalogId,
      signal,
      rankPosition,
      JSON.stringify({ tier: candidate.tier }),
      now,
      now,
    ).run();
  }
}

async function findMatchingSubmission(env: Env, externalId: string): Promise<number | null> {
  const canonical = `${NOVELPIA_ORIGIN}/novel/${externalId}`;
  const row = await env.DB.prepare(`
    SELECT s.id
    FROM submissions s
    WHERE s.status <> 'rejected' AND (
      LOWER(COALESCE(s.source_url,'')) = LOWER(?)
      OR LOWER(COALESCE(s.source_url,'')) LIKE LOWER(?)
      OR EXISTS (
        SELECT 1 FROM submission_external_sources es
        WHERE es.submission_id = s.id AND es.external_id = ?
          AND es.provider IN ('novelpia','raw_fucknovelpia')
      )
    )
    ORDER BY
      CASE WHEN s.status = 'accepted' THEN 0 WHEN s.status = 'pending' THEN 1 ELSE 2 END,
      s.id ASC
    LIMIT 1
  `).bind(canonical, `%novelpia.com/novel/${externalId}%`, externalId).first<{ id: number }>();
  return row?.id ? Number(row.id) : null;
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

function presentCatalogRow(row: any): DiscoveryCatalogPresented {
  return {
    kind: 'catalog',
    catalog_id: Number(row.id),
    provider: 'novelpia',
    external_id: String(row.external_id),
    title: String(row.title),
    original_title: row.original_title ? String(row.original_title) : null,
    author: row.author ? String(row.author) : null,
    original_language: 'Korean',
    chapter_count: row.chapter_count == null ? null : Number(row.chapter_count),
    publication_status: row.publication_status ? String(row.publication_status) : null,
    genres_tags: String(row.genres_tags ?? ''),
    synopsis: row.synopsis ? String(row.synopsis) : null,
    source_url: String(row.source_url),
    page_url: String(row.source_url),
    cover_url: row.cover_url ? String(row.cover_url) : null,
    source_tier: row.source_tier ? String(row.source_tier) : null,
    age_rating: row.age_rating ? String(row.age_rating) : null,
    views_count: Number(row.views_count ?? 0),
    favorites_count: Number(row.favorites_count ?? 0),
    recommendations_count: Number(row.recommendations_count ?? 0),
    raw_available: Boolean(row.raw_available),
    demand_count: Number(row.demand_count ?? 0),
    viewer_interested: Boolean(row.viewer_interested),
    linked_submission_id: row.linked_submission_id == null ? null : Number(row.linked_submission_id),
    source_rank: row.source_rank == null ? null : Number(row.source_rank),
    fresh_signals: String(row.signal_list ?? '').split(',').filter(Boolean),
    discovered_at: String(row.first_seen_at),
    updated_at: String(row.updated_at),
  };
}

function parseNovelDetail(candidate: Candidate, html: string): ParsedNovel | null {
  const text = collapse(stripHtml(html));
  const canonicalId = extractNovelpiaId(extractMeta(html, 'og:url') ?? '') ?? candidate.externalId;
  if (canonicalId !== candidate.externalId) return null;

  const rawTitle = extractMeta(html, 'og:title')
    ?? firstHeading(html)
    ?? extractTitleTag(html)
    ?? `NovelPia #${candidate.externalId}`;
  const title = cleanNovelTitle(rawTitle);
  if (!title || /^novelpia\s*#?\d+$/i.test(title)) return null;

  const hero = text.slice(0, 8000);
  const author = firstTextMatch(hero, /작가명\s*:?\s*([^\s]{1,80})/u)
    ?? firstTextMatch(hero, /작가\s*:?\s*([^\s]{1,80})/u);
  const chapterRaw = firstTextMatch(hero, /([\d,]{1,8})\s*회차/u);
  const chapterCount = chapterRaw ? parseInteger(chapterRaw) : null;
  const publicationStatus: 'ongoing' | 'completed' = /(?:^|\s)완결(?:\s|$)/u.test(hero) ? 'completed' : 'ongoing';
  const tags = uniqueMatches(hero, /#([^#\s]{1,32})/gu, 14);
  const synopsis = cleanDescription(
    extractMeta(html, 'og:description') ?? extractMeta(html, 'description') ?? null,
  );
  const cover = extractMeta(html, 'og:image');
  const coverUrl = cover ? normalizeOfficialAssetUrl(cover) : null;
  const ageRating = /(?:^|\s)19(?:\s|\+).*?PLUS/u.test(hero) || /19\s*PLUS/u.test(hero) ? '19+' : null;

  return {
    externalId: candidate.externalId,
    title,
    originalTitle: title,
    author: author ? decodeHtml(author).slice(0, 120) : null,
    chapterCount,
    publicationStatus,
    genresTags: tags.join(', '),
    synopsis,
    sourceUrl: `${NOVELPIA_ORIGIN}/novel/${candidate.externalId}`,
    coverUrl,
    sourceTier: candidate.tier,
    ageRating,
    viewsCount: metric(hero, /조회\s*([\d,.]+(?:[KMB]|만|천)?)/iu),
    favoritesCount: metric(hero, /선호(?:선호)?\s*([\d,.]+(?:[KMB]|만|천)?)/iu),
    recommendationsCount: metric(hero, /추천\s*([\d,.]+(?:[KMB]|만|천)?)/iu),
  };
}

async function fetchNovelpiaHtml(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !isNovelpiaHost(parsed.hostname)) throw new Error('novelpia_invalid_host');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(parsed.toString(), {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'ko-KR,ko;q=0.9,en;q=0.6',
        'user-agent': 'DollarTL-Discovery/2.0',
      },
    });
    if (!response.ok) throw new Error(`novelpia_http_${response.status}`);
    const finalUrl = new URL(response.url);
    if (!isNovelpiaHost(finalUrl.hostname)) throw new Error('novelpia_redirect_host');
    const type = response.headers.get('content-type') ?? '';
    if (!type.toLowerCase().includes('text/html')) throw new Error('novelpia_non_html');
    return (await response.text()).slice(0, 3_000_000);
  } finally {
    clearTimeout(timer);
  }
}

function extractNovelIds(html: string, limit: number): string[] {
  const positions = new Map<string, number>();
  const patterns = [
    /(?:https?:\/\/(?:www\.)?novelpia\.com)?\/novel\/(\d{2,9})/gi,
    /(?:novel_no|novelNo)["']?\s*[:=]\s*["']?(\d{2,9})/gi,
    /_(\d{2,9})_(?:ori|thumb|cover)\b/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(html))) {
      const id = match[1];
      const prior = positions.get(id);
      if (prior == null || match.index < prior) positions.set(id, match.index);
      if (positions.size >= limit * 4) break;
    }
  }
  return [...positions.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id)
    .slice(0, limit);
}

function minSignalRank(candidate: Candidate): number {
  let min = Number.MAX_SAFE_INTEGER;
  for (const rank of candidate.signals.values()) min = Math.min(min, rank);
  return min;
}

function isEnrichmentStale(value: string | null, now: Date): boolean {
  if (!value) return true;
  const time = Date.parse(value);
  return !Number.isFinite(time) || now.getTime() - time >= DETAIL_STALE_MS;
}

function firstHeading(html: string): string | null {
  const matches = [...html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)];
  for (const match of matches) {
    const value = collapse(stripHtml(match[1]));
    if (value && !/노벨피아|공지|회차|후원|댓글/u.test(value)) return value;
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return match ? collapse(stripHtml(match[1])) : null;
}

function cleanNovelTitle(value: string): string {
  let title = decodeHtml(collapse(stripHtml(value))).trim();
  const marker = '웹소설로 꿈꾸는 세상!';
  if (title.includes(marker)) title = title.slice(title.indexOf(marker) + marker.length).replace(/^\s*[-|:]\s*/, '');
  title = title.replace(/\s*[-|]\s*노벨피아(?:\s*[-|].*)?$/u, '').trim();
  return title.slice(0, 240);
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
  const text = collapse(decodeHtml(stripHtml(value)));
  return text ? text.slice(0, 1200) : null;
}

function normalizeOfficialAssetUrl(value: string): string | null {
  try {
    const url = new URL(value, NOVELPIA_ORIGIN);
    if (url.protocol !== 'https:') return null;
    if (!isNovelpiaHost(url.hostname) && url.hostname !== 'images.novelpia.com') return null;
    return url.toString();
  } catch {
    return null;
  }
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

function extractNovelpiaId(value: string): string | null {
  const match = /(?:novelpia\.com\/(?:novel|viewer)\/|[?&](?:novel_no|id)=)(\d{2,9})/i.exec(value);
  return match?.[1] ?? null;
}

function isNovelpiaHost(hostname: string): boolean {
  return hostname === 'novelpia.com' || hostname === 'www.novelpia.com';
}

function firstTextMatch(text: string, pattern: RegExp): string | null {
  const match = pattern.exec(text);
  return match?.[1]?.trim() ?? null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function escapeLike(value: string): string {
  return value.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
