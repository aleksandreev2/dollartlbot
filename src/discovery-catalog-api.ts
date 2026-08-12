import {
  authenticateMiniAppRequest,
  miniAppApiHeaders,
  miniAppJson,
  miniAppJsonError,
} from './miniapp-auth';
import {
  getCatalogNovel,
  getNovelpiaIngestState,
  linkCatalogToSubmission,
  runNovelpiaDiscoveryIngestion,
  searchNovelpiaCatalog,
  toggleCatalogInterest,
} from './novelpia-discovery';
import {
  getHomepageFreshIngestState,
  runNovelpiaHomepageFreshIngestion,
} from './novelpia-homepage-fresh';
import {
  getRawIngestState,
  propagateCatalogRawSourceToSubmission,
  runRawCatalogEnrichment,
} from './raw-fucknovelpia';

const SEARCH_PATH = '/api/app/discovery/catalog/search';
const INTEREST_PATH = '/api/app/discovery/catalog/interest';
const LINK_PATH = '/api/app/discovery/catalog/link';
const HEALTH_PATH = '/api/app/discovery/catalog/health';
const REFRESH_PATH = '/api/app/discovery/catalog/refresh';
const REFRESH_BUSY_MS = 2 * 60 * 1000;

export async function handleDiscoveryCatalogRequest(
  request: Request,
  env: Env,
  ctx?: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isKnown = [SEARCH_PATH, INTEREST_PATH, LINK_PATH, HEALTH_PATH, REFRESH_PATH].includes(url.pathname);
  if (!isKnown) return null;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: miniAppApiHeaders() });
  }

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  try {
    if (request.method === 'GET' && url.pathname === SEARCH_PATH) {
      const query = String(url.searchParams.get('q') ?? '').trim().slice(0, 160);
      if (query.length < 2) return miniAppJson({ query, items: [] });
      const items = await searchNovelpiaCatalog(env, auth.telegramUser.id, query, 8);
      return miniAppJson({ query, items });
    }

    if (request.method === 'POST' && url.pathname === INTEREST_PATH) {
      const body = await readJson<{ catalog_id?: number; interested?: boolean }>(request);
      const catalogId = Number(body.catalog_id);
      if (!Number.isSafeInteger(catalogId) || catalogId <= 0 || typeof body.interested !== 'boolean') {
        return miniAppJsonError('invalid_catalog_interest', 'Choose a valid discovered title.', 400);
      }
      try {
        const summary = await toggleCatalogInterest(env, auth.telegramUser.id, catalogId, body.interested);
        return miniAppJson(summary);
      } catch (error) {
        if (errorMessage(error).includes('catalog_not_found')) {
          return miniAppJsonError('not_found', 'Discovered title not found.', 404);
        }
        throw error;
      }
    }

    if (request.method === 'POST' && url.pathname === LINK_PATH) {
      const body = await readJson<{ catalog_id?: number; submission_id?: number }>(request);
      const catalogId = Number(body.catalog_id);
      const submissionId = Number(body.submission_id);
      if (!Number.isSafeInteger(catalogId) || catalogId <= 0 || !Number.isSafeInteger(submissionId) || submissionId <= 0) {
        return miniAppJsonError('invalid_catalog_link', 'Invalid title or submission.', 400);
      }
      const submission = await env.DB.prepare('SELECT id, user_id FROM submissions WHERE id = ?')
        .bind(submissionId).first<{ id: number; user_id: number }>();
      if (!submission) return miniAppJsonError('not_found', 'Submission not found.', 404);
      if (submission.user_id !== auth.telegramUser.id && !auth.admin) {
        return miniAppJsonError('forbidden', 'You cannot link this title to that request.', 403);
      }
      const catalog = await getCatalogNovel(env, catalogId);
      if (!catalog) return miniAppJsonError('not_found', 'Discovered title not found.', 404);
      if (catalog.linked_submission_id && catalog.linked_submission_id !== submissionId) {
        return miniAppJsonError('already_linked', 'This NovelPia title is already linked to another request.', 409);
      }
      const now = new Date().toISOString();
      try {
        await env.DB.prepare(`
          INSERT INTO submission_external_sources (
            submission_id, provider, external_id, page_url, original_url,
            raw_available, metadata_json, last_checked_at, created_at, updated_at
          ) VALUES (?, 'novelpia', ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(submission_id, provider) DO UPDATE SET
            external_id = excluded.external_id,
            page_url = excluded.page_url,
            original_url = excluded.original_url,
            raw_available = MAX(submission_external_sources.raw_available, excluded.raw_available),
            metadata_json = excluded.metadata_json,
            last_checked_at = excluded.last_checked_at,
            updated_at = excluded.updated_at
        `).bind(
          submissionId,
          catalog.external_id,
          catalog.source_url,
          catalog.source_url,
          Number(Boolean(catalog.raw_available)),
          JSON.stringify({
            catalog_id: catalog.id,
            title: catalog.title,
            original_title: catalog.original_title,
            author: catalog.author,
            cover_url: catalog.cover_url,
          }).slice(0, 8000),
          now,
          now,
          now,
        ).run();
      } catch (error) {
        if (/UNIQUE constraint failed: submission_external_sources\.provider, submission_external_sources\.external_id/i.test(errorMessage(error))) {
          return miniAppJsonError('already_linked', 'This NovelPia title is already linked to another request.', 409);
        }
        throw error;
      }
      await linkCatalogToSubmission(env, catalogId, submissionId);
      const rawLinked = await propagateCatalogRawSourceToSubmission(env, catalogId, submissionId, now).catch((error) => {
        console.warn(JSON.stringify({
          event: 'catalog_raw_source_link_failed',
          catalog_id: catalogId,
          submission_id: submissionId,
          error: errorMessage(error),
        }));
        return false;
      });
      return miniAppJson({ ok: true, catalog_id: catalogId, submission_id: submissionId, raw_source_linked: rawLinked });
    }

    if (request.method === 'GET' && url.pathname === HEALTH_PATH) {
      if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);
      const [state, homepageState, rawState] = await Promise.all([
        getNovelpiaIngestState(env),
        getHomepageFreshIngestState(env),
        getRawIngestState(env),
      ]);
      return miniAppJson({
        provider: 'novelpia',
        state,
        homepage_provider: 'novelpia_homepage_fresh',
        homepage_state: homepageState,
        raw_provider: 'raw_fucknovelpia',
        raw_state: rawState,
      });
    }

    if (request.method === 'POST' && url.pathname === REFRESH_PATH) {
      if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);
      if (!ctx) return miniAppJsonError('refresh_unavailable', 'Background refresh is unavailable.', 503);

      const [state, homepageState, rawState] = await Promise.all([
        getNovelpiaIngestState(env),
        getHomepageFreshIngestState(env),
        getRawIngestState(env),
      ]);
      const inProgress = isInProgress(state) || isInProgress(homepageState) || isInProgress(rawState);
      if (inProgress) {
        return miniAppJson({
          started: false,
          busy: true,
          last_attempt_at: newestTimestamp(
            state?.last_attempt_at,
            homepageState?.last_attempt_at,
            rawState?.last_attempt_at,
          ),
        });
      }

      const requestedAt = new Date();
      ctx.waitUntil((async () => {
        try {
          await runNovelpiaHomepageFreshIngestion(env, requestedAt);
        } catch (error) {
          console.error(JSON.stringify({
            event: 'novelpia_homepage_fresh_manual_refresh_failed',
            requested_by: auth.telegramUser.id,
            error: errorMessage(error),
          }));
        }
        try {
          await runNovelpiaDiscoveryIngestion(env, requestedAt);
        } catch (error) {
          console.error(JSON.stringify({
            event: 'novelpia_discovery_manual_refresh_failed',
            requested_by: auth.telegramUser.id,
            error: errorMessage(error),
          }));
        }
        try {
          await runRawCatalogEnrichment(env, new Date());
        } catch (error) {
          console.error(JSON.stringify({
            event: 'raw_fucknovelpia_manual_refresh_failed',
            requested_by: auth.telegramUser.id,
            error: errorMessage(error),
          }));
        }
      })());
      return miniAppJson({
        started: true,
        busy: false,
        requested_at: requestedAt.toISOString(),
        stages: ['novelpia_homepage', 'novelpia', 'raw_fucknovelpia'],
      });
    }

    return null;
  } catch (error) {
    console.error(JSON.stringify({
      event: 'discovery_catalog_request_failed',
      path: url.pathname,
      error: errorMessage(error),
    }));
    return miniAppJsonError('temporary_error', 'Fresh discovery is temporarily unavailable.', 500);
  }
}

function isInProgress(state: { last_attempt_at: string | null; last_success_at: string | null } | null): boolean {
  if (!state?.last_attempt_at) return false;
  const lastAttempt = Date.parse(state.last_attempt_at);
  const lastSuccess = state.last_success_at ? Date.parse(state.last_success_at) : 0;
  return Number.isFinite(lastAttempt)
    && lastAttempt > lastSuccess
    && Date.now() - lastAttempt < REFRESH_BUSY_MS;
}

function newestTimestamp(...timestamps: Array<string | null | undefined>): string | null {
  const values = timestamps.filter((value): value is string => Boolean(value));
  if (!values.length) return null;
  return values.sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
