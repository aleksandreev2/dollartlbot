import {
  authenticateMiniAppRequest,
  miniAppApiHeaders,
  miniAppJson,
  miniAppJsonError,
  type MiniAppAuthContext,
} from './miniapp-auth';
import {
  getNovelpiaIngestState,
  loadFreshNovelpiaCatalog,
  type DiscoveryCatalogPresented,
} from './novelpia-discovery';
import {
  getRawIngestState,
  loadRawCatalogSourceMap,
  type RawCatalogSourcePresented,
} from './raw-fucknovelpia';

type DiscoveryFeedRow = {
  id: number;
  user_id: number;
  title: string;
  original_language: string;
  chapter_count: number;
  publication_status: string;
  genres_tags: string;
  request_status: string;
  queue_status: string | null;
  queue_position: number | null;
  current_chapter: number | null;
  created_at: string;
  updated_at: string;
  demand_count: number;
  recent_interest_count: number;
  previous_interest_count: number;
  viewer_interested: number;
  raw_available: number;
  discovered_at: string;
};

type FeedOrder = 'trending' | 'demand' | 'recent';
type FreshWithRaw = DiscoveryCatalogPresented & {
  raw_page_url: string | null;
  raw_verified_at: string | null;
  raw_verification_status: RawCatalogSourcePresented['verification_status'];
  raw_format: string | null;
  raw_password_required: boolean;
};

const MAX_SECTION = 12;
const MAX_CATALOG = 72;
const MAX_FRESH = 36;
const FEED_PATH = '/api/app/discovery/feed';
const OPPORTUNITIES_PATH = '/api/app/discovery/opportunities';

export async function handleDiscoveryFeedRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const isFeedPath = url.pathname === FEED_PATH;
  const isOpportunitiesPath = url.pathname === OPPORTUNITIES_PATH;
  if (!isFeedPath && !isOpportunitiesPath) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: miniAppApiHeaders() });
  }
  if (request.method !== 'GET') return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  try {
    if (isOpportunitiesPath) {
      if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);
      const [localCandidates, freshCandidates, ingestState, rawIngestState] = await Promise.all([
        loadFeedRows(env, auth, 'demand', 60),
        loadFreshNovelpiaCatalog(env, auth.telegramUser.id, 50),
        getNovelpiaIngestState(env),
        getRawIngestState(env),
      ]);
      const freshWithRaw = await attachVerifiedRawSources(env, freshCandidates);
      const localItems = localCandidates.map((row) => ({
        ...row,
        opportunity_score: opportunityScore(row),
        opportunity_signals: ['Dollar TL demand', '7d momentum', row.raw_available ? 'RAW available' : null]
          .filter(Boolean),
      }));
      const freshItems = freshWithRaw.map((row) => ({
        ...row,
        opportunity_score: catalogOpportunityScore(row),
        opportunity_signals: catalogOpportunitySignals(row),
      }));
      return miniAppJson({
        generated_at: new Date().toISOString(),
        items: [...localItems, ...freshItems]
          .sort((a, b) => b.opportunity_score - a.opportunity_score || b.demand_count - a.demand_count)
          .slice(0, 30),
        score_signals: [
          'Dollar TL demand',
          '7d momentum',
          'verified RAW availability',
          'chapter depth',
          'publication status',
          'NovelPia new-rank',
          'NovelPia views/favorites',
        ],
        novelpia_ingest: ingestPresentation(ingestState),
        raw_ingest: ingestPresentation(rawIngestState),
      });
    }

    const [trending, mostRequested, rawAvailable, recentlyFound, catalog, freshNovelpia, ingestState, rawIngestState] = await Promise.all([
      loadFeedRows(env, auth, 'trending', MAX_SECTION),
      loadFeedRows(env, auth, 'demand', MAX_SECTION),
      loadFeedRows(env, auth, 'demand', MAX_SECTION, true),
      loadFeedRows(env, auth, 'recent', MAX_SECTION),
      loadFeedRows(env, auth, 'demand', MAX_CATALOG),
      loadFreshNovelpiaCatalog(env, auth.telegramUser.id, MAX_FRESH),
      getNovelpiaIngestState(env),
      getRawIngestState(env),
    ]);
    const freshWithRaw = await attachVerifiedRawSources(env, freshNovelpia);

    return miniAppJson({
      generated_at: new Date().toISOString(),
      trending,
      most_requested: mostRequested,
      raw_available: rawAvailable,
      recently_found: recentlyFound,
      fresh_novelpia: freshWithRaw,
      catalog,
      novelpia_ingest: ingestPresentation(ingestState),
      raw_ingest: ingestPresentation(rawIngestState),
    });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'discovery_feed_failed',
      path: url.pathname,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    }));
    return miniAppJsonError('temporary_error', 'Discover is temporarily unavailable.', 500);
  }
}

async function loadFeedRows(
  env: Env,
  auth: MiniAppAuthContext,
  order: FeedOrder,
  limit: number,
  rawOnly = false,
) {
  const now = Date.now();
  const recentSince = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const previousSince = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
  const safeLimit = Math.max(1, Math.min(120, Math.trunc(limit)));

  const orderSql = order === 'trending'
    ? `recent_interest_count DESC,
       CASE WHEN recent_interest_count > previous_interest_count
         THEN recent_interest_count - previous_interest_count ELSE 0 END DESC,
       demand_count DESC, discovered_at DESC`
    : order === 'recent'
      ? 'discovered_at DESC, demand_count DESC'
      : 'demand_count DESC, recent_interest_count DESC, discovered_at DESC';

  const rawFilter = rawOnly ? 'WHERE raw_available = 1' : '';
  const query = `
    WITH discovery_rows AS (
      SELECT
        s.id,
        s.user_id,
        s.title,
        s.original_language,
        s.chapter_count,
        s.publication_status,
        s.genres_tags,
        s.status AS request_status,
        s.queue_status,
        s.queue_position,
        s.current_chapter,
        s.created_at,
        s.updated_at,
        1 + (SELECT COUNT(*) FROM discovery_interests di WHERE di.submission_id = s.id) AS demand_count,
        (SELECT COUNT(*) FROM discovery_interests di7
          WHERE di7.submission_id = s.id AND di7.created_at >= ?) AS recent_interest_count,
        (SELECT COUNT(*) FROM discovery_interests dip
          WHERE dip.submission_id = s.id AND dip.created_at >= ? AND dip.created_at < ?) AS previous_interest_count,
        CASE WHEN s.user_id = ? OR EXISTS (
          SELECT 1 FROM discovery_interests div
          WHERE div.submission_id = s.id AND div.user_id = ?
        ) THEN 1 ELSE 0 END AS viewer_interested,
        COALESCE((
          SELECT MAX(es.raw_available)
          FROM submission_external_sources es
          WHERE es.submission_id = s.id
        ), 0) AS raw_available,
        COALESCE((
          SELECT MAX(es2.created_at)
          FROM submission_external_sources es2
          WHERE es2.submission_id = s.id
        ), s.created_at) AS discovered_at
      FROM submissions s
      WHERE s.status <> 'rejected'
    )
    SELECT * FROM discovery_rows
    ${rawFilter}
    ORDER BY ${orderSql}
    LIMIT ?
  `;

  const result = await env.DB.prepare(query).bind(
    recentSince,
    previousSince,
    recentSince,
    auth.telegramUser.id,
    auth.telegramUser.id,
    safeLimit,
  ).all<DiscoveryFeedRow>();

  return result.results.map((row) => presentRow(row, auth.telegramUser.id));
}

function presentRow(row: DiscoveryFeedRow, viewerId: number) {
  const recent = Number(row.recent_interest_count ?? 0);
  const previous = Number(row.previous_interest_count ?? 0);
  return {
    kind: 'local' as const,
    id: Number(row.id),
    title: row.title,
    original_language: row.original_language,
    chapter_count: Number(row.chapter_count),
    publication_status: row.publication_status,
    genres_tags: row.genres_tags || '',
    request_status: row.request_status,
    queue_status: row.queue_status,
    queue_position: row.queue_position == null ? null : Number(row.queue_position),
    current_chapter: row.current_chapter == null ? null : Number(row.current_chapter),
    demand_count: Number(row.demand_count ?? 1),
    recent_interest_count: recent,
    trend_delta: recent - previous,
    viewer_interested: Boolean(row.viewer_interested),
    own_request: Number(row.user_id) === viewerId,
    raw_available: Boolean(row.raw_available),
    discovered_at: row.discovered_at,
    updated_at: row.updated_at,
  };
}

async function attachVerifiedRawSources(
  env: Env,
  rows: DiscoveryCatalogPresented[],
): Promise<FreshWithRaw[]> {
  const sourceMap = await loadRawCatalogSourceMap(env, rows.map((row) => row.catalog_id));
  return rows.map((row) => {
    const raw = sourceMap.get(row.catalog_id);
    const verified = raw?.verification_status === 'verified';
    return {
      ...row,
      raw_available: verified ? Boolean(raw.available) : Boolean(row.raw_available && verified),
      raw_page_url: verified ? raw.page_url : null,
      raw_verified_at: verified ? raw.last_checked_at : null,
      raw_verification_status: raw?.verification_status ?? 'unknown',
      raw_format: verified ? raw.raw_format : null,
      raw_password_required: verified ? raw.password_required : false,
    };
  });
}

function opportunityScore(row: ReturnType<typeof presentRow>): number {
  const demand = Math.min(40, Math.max(0, row.demand_count) * 4);
  const momentum = Math.min(20, Math.max(0, row.recent_interest_count) * 4 + Math.max(0, row.trend_delta) * 2);
  const raw = row.raw_available ? 20 : 0;
  const chapters = row.chapter_count >= 300 ? 10 : row.chapter_count >= 100 ? 8 : row.chapter_count >= 50 ? 5 : 2;
  const publication = row.publication_status === 'completed' ? 10 : row.publication_status === 'ongoing' ? 6 : 2;
  return Math.max(0, Math.min(100, Math.round(demand + momentum + raw + chapters + publication)));
}

function catalogOpportunityScore(row: FreshWithRaw): number {
  const demand = Math.min(30, Math.max(0, row.demand_count) * 8);
  const rank = row.source_rank == null ? 0 : Math.max(0, 24 - Math.min(24, Math.floor((row.source_rank - 1) / 2)));
  const popularity = Math.min(18,
    Math.log10(Math.max(1, row.views_count)) * 2.2
      + Math.log10(Math.max(1, row.favorites_count)) * 1.8,
  );
  const chapters = row.chapter_count == null
    ? 2
    : row.chapter_count >= 150
      ? 8
      : row.chapter_count >= 50
        ? 6
        : row.chapter_count >= 15
          ? 4
          : 2;
  const freshness = row.fresh_signals.includes('novelpia_plus_new')
    ? 7
    : row.fresh_signals.includes('novelpia_free_new')
      ? 5
      : 3;
  const plus = row.source_tier === 'plus' ? 3 : 0;
  const raw = row.raw_available && row.raw_verification_status === 'verified' ? 10 : 0;
  return Math.max(0, Math.min(100, Math.round(demand + rank + popularity + chapters + freshness + plus + raw)));
}

function catalogOpportunitySignals(row: FreshWithRaw): string[] {
  const out: string[] = [];
  if (row.demand_count > 0) out.push(`${row.demand_count} Dollar TL demand`);
  if (row.raw_available && row.raw_verification_status === 'verified') out.push('RAW verified');
  if (row.source_rank != null) out.push(`NovelPia new #${row.source_rank}`);
  if (row.views_count > 0) out.push(`${row.views_count} NovelPia views`);
  if (row.favorites_count > 0) out.push(`${row.favorites_count} favorites`);
  if (row.fresh_signals.includes('novelpia_plus_new')) out.push('New PLUS conversion');
  else if (row.fresh_signals.includes('novelpia_free_new')) out.push('New free title');
  return out.slice(0, 4);
}

function ingestPresentation(state: {
  last_success_at: string | null;
  last_error: string | null;
  last_item_count: number;
} | null) {
  if (!state) return { available: false, last_success_at: null, item_count: 0, degraded: false };
  return {
    available: true,
    last_success_at: state.last_success_at,
    item_count: Number(state.last_item_count ?? 0),
    degraded: Boolean(state.last_error),
  };
}
