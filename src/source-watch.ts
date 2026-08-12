import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

const NOVELPIA_ORIGIN = 'https://novelpia.com';
const INGEST_PROVIDER = 'novelpia_source_watch';
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 3_000_000;
const MAX_REDIRECTS = 3;
const WATCH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ERROR_RETRY_MS = 60 * 60 * 1000;
const DEFAULT_LIMIT = 8;

type WatchRow = {
  submission_id: number;
  external_id: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  next_check_at: string | null;
  failure_count: number;
  last_error: string | null;
  last_remote_chapter_count: number | null;
  last_remote_publication_status: string | null;
  last_remote_title: string | null;
  last_change_at: string | null;
};

type DueRow = WatchRow & {
  title: string;
  chapter_count: number;
  publication_status: string;
  queue_status: string | null;
};

type ObservedNovel = {
  externalId: string;
  title: string;
  chapterCount: number | null;
  publicationStatus: 'ongoing' | 'completed';
  sourceUrl: string;
};

type SourceEventInput = {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  action: 'auto_applied' | 'review_required' | 'observed';
  metadata?: Record<string, unknown>;
};

export async function handleSourceWatchRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const isGet = request.method === 'GET' && url.pathname === '/api/app/admin/source-watch';
  const isRefresh = request.method === 'POST' && url.pathname === '/api/app/admin/source-watch/refresh';
  if (!isGet && !isRefresh) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (isRefresh) {
    const body = await readJson<{ submission_id?: unknown; limit?: unknown }>(request);
    const submissionId = positiveId(body.submission_id);
    await ensureWatchRows(env, new Date());
    if (body.submission_id != null && !submissionId) {
      return miniAppJsonError('invalid_submission', 'Invalid request ID.', 400);
    }
    if (submissionId) {
      const forced = await env.DB.prepare(`
        UPDATE submission_source_watch
        SET next_check_at='1970-01-01T00:00:00.000Z',updated_at=?
        WHERE submission_id=?
      `).bind(new Date().toISOString(), submissionId).run();
      if (Number(forced.meta.changes ?? 0) !== 1) {
        return miniAppJsonError('not_watchable', 'This request does not have a canonical NovelPia source to watch.', 409);
      }
    }
    const limit = boundedInt(body.limit, submissionId ? 1 : 20, 1, 30);
    const result = await runSubmissionSourceWatch(env, new Date(), limit);
    return miniAppJson({ ok: true, result, ...(await sourceWatchSnapshot(env, submissionId)) });
  }

  const submissionId = positiveId(url.searchParams.get('submission_id'));
  if (url.searchParams.has('submission_id') && !submissionId) {
    return miniAppJsonError('invalid_submission', 'Invalid request ID.', 400);
  }
  return miniAppJson(await sourceWatchSnapshot(env, submissionId));
}

export async function runSubmissionSourceWatch(
  env: Env,
  scheduledAt = new Date(),
  limit = DEFAULT_LIMIT,
): Promise<{ watched: number; checked: number; changed: number; attention: number; errors: number }> {
  const safeLimit = Math.max(1, Math.min(30, Math.trunc(limit)));
  const now = scheduledAt.toISOString();
  await writeIngestState(env, { attempt: now, success: null, error: null, count: null });

  const watched = await ensureWatchRows(env, scheduledAt);
  const due = await loadDueRows(env, now, safeLimit);
  let checked = 0;
  let changed = 0;
  let attention = 0;
  let errors = 0;
  const errorMessages: string[] = [];

  for (let offset = 0; offset < due.length; offset += 2) {
    const batch = due.slice(offset, offset + 2);
    const results = await Promise.all(batch.map(async (row) => {
      try {
        return { row, observed: await inspectNovelpiaNovel(row.external_id), error: null as unknown };
      } catch (error) {
        return { row, observed: null, error };
      }
    }));

    for (const result of results) {
      checked += 1;
      if (result.error || !result.observed) {
        errors += 1;
        const message = errorMessage(result.error || new Error('novelpia_empty_detail')).slice(0, 500);
        errorMessages.push(`${result.row.external_id}:${message}`);
        await markWatchError(env, result.row.submission_id, scheduledAt, message);
        continue;
      }
      const applied = await applyObservation(env, result.row, result.observed, scheduledAt);
      changed += applied.changed;
      attention += applied.attention;
    }
  }

  const warning = errorMessages.length ? errorMessages.slice(0, 5).join('; ').slice(0, 1200) : null;
  await writeIngestState(env, {
    attempt: now,
    success: now,
    error: warning,
    count: checked,
  });

  return { watched, checked, changed, attention, errors };
}

async function ensureWatchRows(env: Env, nowDate: Date): Promise<number> {
  const now = nowDate.toISOString();
  const rows = await env.DB.prepare(`
    SELECT s.id,s.source_url,
      (SELECT ti.identity_value FROM title_identities ti
       WHERE ti.submission_id=s.id AND ti.identity_type='novelpia'
       ORDER BY CASE WHEN ti.source_provider='source_url' THEN 1 ELSE 0 END,ti.updated_at DESC
       LIMIT 1) AS identity_external_id,
      (SELECT es.external_id FROM submission_external_sources es
       WHERE es.submission_id=s.id AND es.provider IN ('novelpia','raw_fucknovelpia') AND es.external_id IS NOT NULL
       ORDER BY CASE WHEN es.provider='novelpia' THEN 0 ELSE 1 END LIMIT 1) AS source_external_id
    FROM submissions s
    WHERE s.status='accepted'
      AND (
        s.queue_status IN ('queued','in_progress')
        OR (s.queue_status='completed' AND s.publication_status='ongoing')
      )
    ORDER BY s.id ASC
    LIMIT 500
  `).all<{ id: number; source_url: string | null; identity_external_id: string | null; source_external_id: string | null }>();

  let watchable = 0;
  for (const row of rows.results) {
    const externalId = cleanExternalId(row.identity_external_id)
      || cleanExternalId(row.source_external_id)
      || extractNovelpiaId(row.source_url);
    if (!externalId) continue;
    watchable += 1;
    await env.DB.prepare(`
      INSERT INTO submission_source_watch (
        submission_id,provider,external_id,next_check_at,created_at,updated_at
      ) VALUES (?,'novelpia',?,?,?,?)
      ON CONFLICT(submission_id) DO UPDATE SET
        external_id=excluded.external_id,
        next_check_at=CASE
          WHEN submission_source_watch.external_id<>excluded.external_id THEN excluded.next_check_at
          ELSE submission_source_watch.next_check_at
        END,
        updated_at=excluded.updated_at
    `).bind(row.id, externalId, now, now, now).run();
  }
  return watchable;
}

async function loadDueRows(env: Env, now: string, limit: number): Promise<DueRow[]> {
  const result = await env.DB.prepare(`
    SELECT w.submission_id,w.external_id,w.last_attempt_at,w.last_success_at,w.next_check_at,
           w.failure_count,w.last_error,w.last_remote_chapter_count,w.last_remote_publication_status,
           w.last_remote_title,w.last_change_at,
           s.title,s.chapter_count,s.publication_status,s.queue_status
    FROM submission_source_watch w
    JOIN submissions s ON s.id=w.submission_id
    WHERE s.status='accepted'
      AND (
        s.queue_status IN ('queued','in_progress')
        OR (s.queue_status='completed' AND s.publication_status='ongoing')
      )
      AND (w.next_check_at IS NULL OR w.next_check_at<=?)
    ORDER BY CASE WHEN w.next_check_at IS NULL THEN 0 ELSE 1 END,
             COALESCE(w.next_check_at,'') ASC,w.failure_count ASC,w.submission_id ASC
    LIMIT ?
  `).bind(now, limit).all<DueRow>();
  return result.results;
}

async function applyObservation(
  env: Env,
  watch: DueRow,
  observed: ObservedNovel,
  checkedAt: Date,
): Promise<{ changed: number; attention: number }> {
  const now = checkedAt.toISOString();
  const nextCheck = new Date(checkedAt.getTime() + WATCH_INTERVAL_MS).toISOString();
  const events: SourceEventInput[] = [];
  let nextChapterCount = watch.chapter_count;
  let nextPublicationStatus = watch.publication_status;

  if (observed.chapterCount != null) {
    if (observed.chapterCount > watch.chapter_count) {
      if (watch.queue_status === 'completed') {
        if (watch.last_remote_chapter_count !== observed.chapterCount) {
          events.push({
            field: 'chapter_count',
            oldValue: watch.chapter_count,
            newValue: observed.chapterCount,
            action: 'review_required',
            metadata: { reason: 'new_source_chapters_after_translation_completed' },
          });
        }
      } else {
        nextChapterCount = observed.chapterCount;
        events.push({
          field: 'chapter_count',
          oldValue: watch.chapter_count,
          newValue: observed.chapterCount,
          action: 'auto_applied',
          metadata: { monotonic_increase: true },
        });
      }
    } else if (observed.chapterCount < watch.chapter_count && watch.last_remote_chapter_count !== observed.chapterCount) {
      events.push({
        field: 'chapter_count',
        oldValue: watch.chapter_count,
        newValue: observed.chapterCount,
        action: 'review_required',
        metadata: { reason: 'remote_chapter_count_decreased', auto_decrease: false },
      });
    }
  }

  if (watch.publication_status === 'ongoing' && observed.publicationStatus === 'completed') {
    nextPublicationStatus = 'completed';
    events.push({
      field: 'publication_status',
      oldValue: watch.publication_status,
      newValue: 'completed',
      action: 'auto_applied',
    });
  } else if (
    watch.publication_status === 'completed'
    && observed.publicationStatus === 'ongoing'
    && watch.last_remote_publication_status !== observed.publicationStatus
  ) {
    events.push({
      field: 'publication_status',
      oldValue: watch.publication_status,
      newValue: 'ongoing',
      action: 'review_required',
      metadata: { reason: 'remote_status_reversed', auto_reverse: false },
    });
  }

  if (
    watch.last_remote_title
    && normalizeTitle(watch.last_remote_title) !== normalizeTitle(observed.title)
  ) {
    events.push({
      field: 'source_title',
      oldValue: watch.last_remote_title,
      newValue: observed.title,
      action: 'review_required',
      metadata: { reason: 'official_source_title_changed', submission_title_unchanged: true },
    });
  }

  const changed = events.filter((event) => event.action === 'auto_applied').length;
  const attention = events.filter((event) => event.action === 'review_required').length;
  const statements: D1PreparedStatement[] = [];

  if (nextChapterCount !== watch.chapter_count || nextPublicationStatus !== watch.publication_status) {
    statements.push(env.DB.prepare(`
      UPDATE submissions
      SET chapter_count=?,publication_status=?,updated_at=?
      WHERE id=? AND status='accepted'
    `).bind(nextChapterCount, nextPublicationStatus, now, watch.submission_id));
  }

  for (const event of events) {
    statements.push(env.DB.prepare(`
      INSERT INTO submission_source_events (
        submission_id,provider,field_name,old_value,new_value,action,metadata_json,created_at
      ) VALUES (?,'novelpia',?,?,?,?,?,?)
    `).bind(
      watch.submission_id,
      event.field,
      stringifyValue(event.oldValue),
      stringifyValue(event.newValue),
      event.action,
      event.metadata ? JSON.stringify(event.metadata) : null,
      now,
    ));
  }

  statements.push(env.DB.prepare(`
    UPDATE submission_source_watch
    SET last_attempt_at=?,last_success_at=?,next_check_at=?,failure_count=0,last_error=NULL,
        last_remote_chapter_count=?,last_remote_publication_status=?,last_remote_title=?,
        last_change_at=CASE WHEN ?>0 THEN ? ELSE last_change_at END,updated_at=?
    WHERE submission_id=?
  `).bind(
    now,
    now,
    nextCheck,
    observed.chapterCount,
    observed.publicationStatus,
    observed.title,
    events.length,
    now,
    now,
    watch.submission_id,
  ));

  statements.push(env.DB.prepare(`
    INSERT OR IGNORE INTO discovery_catalog (
      provider,external_id,title,original_title,author,original_language,chapter_count,publication_status,
      genres_tags,synopsis,source_url,cover_url,source_tier,age_rating,views_count,favorites_count,
      recommendations_count,raw_available,linked_submission_id,first_seen_at,last_seen_at,last_enriched_at,
      metadata_json,created_at,updated_at
    ) VALUES ('novelpia',?,?,?,?, 'Korean',?,?, '',NULL,?,NULL,NULL,NULL,0,0,0,0,?,?,?,?,?,?,?)
  `).bind(
    observed.externalId,
    observed.title || watch.title,
    observed.title || null,
    null,
    observed.chapterCount,
    observed.publicationStatus,
    observed.sourceUrl,
    watch.submission_id,
    now,
    now,
    now,
    JSON.stringify({ source: 'official_novelpia_source_watch' }),
    now,
    now,
  ));

  statements.push(env.DB.prepare(`
    UPDATE discovery_catalog
    SET chapter_count=CASE
          WHEN ? IS NOT NULL AND (chapter_count IS NULL OR chapter_count<?) THEN ?
          ELSE chapter_count
        END,
        publication_status=CASE WHEN ?='completed' THEN 'completed' ELSE COALESCE(publication_status,?) END,
        original_title=COALESCE(original_title,?),
        source_url=?,
        linked_submission_id=CASE WHEN linked_submission_id IS NULL OR linked_submission_id=? THEN ? ELSE linked_submission_id END,
        last_seen_at=?,last_enriched_at=?,metadata_json=?,updated_at=?
    WHERE provider='novelpia' AND external_id=?
  `).bind(
    observed.chapterCount,
    observed.chapterCount,
    observed.chapterCount,
    observed.publicationStatus,
    observed.publicationStatus,
    observed.title || null,
    observed.sourceUrl,
    watch.submission_id,
    watch.submission_id,
    now,
    now,
    JSON.stringify({ source: 'official_novelpia_source_watch' }),
    now,
    observed.externalId,
  ));

  await env.DB.batch(statements);
  return { changed, attention };
}

async function markWatchError(env: Env, submissionId: number, checkedAt: Date, message: string): Promise<void> {
  const now = checkedAt.toISOString();
  const retryAt = new Date(checkedAt.getTime() + ERROR_RETRY_MS).toISOString();
  await env.DB.prepare(`
    UPDATE submission_source_watch
    SET last_attempt_at=?,next_check_at=?,failure_count=failure_count+1,last_error=?,updated_at=?
    WHERE submission_id=?
  `).bind(now, retryAt, message, now, submissionId).run();
}

async function sourceWatchSnapshot(env: Env, submissionId: number | null) {
  const now = new Date().toISOString();
  const where = submissionId ? 'WHERE w.submission_id=?' : '';
  const binds = submissionId ? [submissionId] : [];
  const [summary, rows, events, ingest] = await Promise.all([
    env.DB.prepare(`
      SELECT
        COUNT(*) AS watched,
        SUM(CASE WHEN w.next_check_at IS NULL OR w.next_check_at<=? THEN 1 ELSE 0 END) AS due,
        SUM(CASE WHEN w.last_error IS NOT NULL THEN 1 ELSE 0 END) AS errors,
        SUM(CASE
          WHEN w.last_remote_chapter_count IS NOT NULL AND (
            w.last_remote_chapter_count<s.chapter_count
            OR (s.queue_status='completed' AND w.last_remote_chapter_count>s.chapter_count)
          ) THEN 1 ELSE 0 END) AS chapter_mismatches,
        MAX(w.last_success_at) AS last_success_at
      FROM submission_source_watch w
      JOIN submissions s ON s.id=w.submission_id
      ${where}
    `).bind(now, ...binds).first<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT w.submission_id,w.external_id,w.last_attempt_at,w.last_success_at,w.next_check_at,
             w.failure_count,w.last_error,w.last_remote_chapter_count,w.last_remote_publication_status,
             w.last_remote_title,w.last_change_at,
             s.title,s.chapter_count,s.publication_status,s.queue_status,s.current_chapter
      FROM submission_source_watch w
      JOIN submissions s ON s.id=w.submission_id
      ${where}
      ORDER BY COALESCE(w.last_change_at,w.last_success_at,w.updated_at) DESC,w.submission_id DESC
      LIMIT 100
    `).bind(...binds).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT e.id,e.submission_id,e.provider,e.field_name,e.old_value,e.new_value,e.action,e.metadata_json,e.created_at,
             s.title
      FROM submission_source_events e
      JOIN submissions s ON s.id=e.submission_id
      ${submissionId ? 'WHERE e.submission_id=?' : ''}
      ORDER BY e.id DESC
      LIMIT 80
    `).bind(...binds).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT provider,last_attempt_at,last_success_at,last_error,last_item_count,updated_at
      FROM discovery_ingest_state WHERE provider=?
    `).bind(INGEST_PROVIDER).first<Record<string, unknown>>(),
  ]);

  return {
    summary: {
      watched: number(summary?.watched),
      due: number(summary?.due),
      errors: number(summary?.errors),
      chapter_mismatches: number(summary?.chapter_mismatches),
      last_success_at: summary?.last_success_at ?? null,
    },
    watches: rows.results,
    events: events.results.map((row) => ({ ...row, metadata: parseObject(row.metadata_json), metadata_json: undefined })),
    ingest: ingest || null,
  };
}

async function inspectNovelpiaNovel(externalId: string): Promise<ObservedNovel> {
  const url = new URL(`/novel/${externalId}`, NOVELPIA_ORIGIN);
  const html = await fetchOfficialHtml(url);
  const text = collapse(stripHtml(html));
  const hero = text.slice(0, 8000);
  const canonical = extractNovelpiaId(extractMeta(html, 'og:url')) || externalId;
  if (canonical !== externalId) throw new Error('novelpia_identity_mismatch');

  const title = cleanTitle(
    extractMeta(html, 'og:title')
      || firstHeading(html)
      || `NovelPia #${externalId}`,
  );
  if (!title || /^novelpia\s*#?\d+$/i.test(title)) throw new Error('novelpia_title_missing');

  const chapterRaw = /([\d,]{1,8})\s*회차/u.exec(hero)?.[1] || null;
  const chapterCount = chapterRaw ? parseInteger(chapterRaw) : null;
  const publicationStatus: 'ongoing' | 'completed' = /(?:^|\s)완결(?:\s|$)/u.test(hero) ? 'completed' : 'ongoing';
  return {
    externalId,
    title,
    chapterCount,
    publicationStatus,
    sourceUrl: `${NOVELPIA_ORIGIN}/novel/${externalId}`,
  };
}

async function fetchOfficialHtml(initial: URL): Promise<string> {
  let current = initial;
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
          'user-agent': 'DollarTL-SourceWatch/1.0',
        },
      });
    } catch (error) {
      clearTimeout(timer);
      if (error instanceof Error && error.name === 'AbortError') throw new Error('novelpia_timeout');
      throw error;
    }

    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirects >= MAX_REDIRECTS) throw new Error('novelpia_redirect_failed');
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new Error(`novelpia_http_${response.status}`);
      const type = (response.headers.get('content-type') || '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('novelpia_non_html');
      const length = Number(response.headers.get('content-length') || 0);
      if (Number.isFinite(length) && length > MAX_HTML_BYTES) throw new Error('novelpia_response_too_large');
      return await readTextLimited(response, MAX_HTML_BYTES);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('novelpia_redirect_failed');
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

function validateNovelpiaUrl(url: URL): void {
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (url.protocol !== 'https:' || host !== 'novelpia.com') throw new Error('novelpia_invalid_host');
  if (!/^\/novel\/\d{2,9}\/?$/.test(url.pathname)) throw new Error('novelpia_invalid_path');
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

function extractNovelpiaId(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  const direct = /(?:novelpia\.com\/(?:novel|viewer)\/|[?&](?:novel_no|novelNo|id)=)(\d{2,9})/i.exec(value);
  if (direct?.[1]) return direct[1];
  const rawNumeric = /raw-fucknovelpia\.com\/novel\/(\d{2,9})(?:[/?#]|$)/i.exec(value);
  return rawNumeric?.[1] ?? null;
}

function cleanExternalId(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return /^\d{2,9}$/.test(text) ? text : null;
}

function extractMeta(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return null;
}

function firstHeading(html: string): string | null {
  for (const match of html.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)) {
    const value = collapse(stripHtml(match[1]));
    if (value && !/노벨피아|공지|회차|후원|댓글/u.test(value)) return value;
  }
  return null;
}

function cleanTitle(value: string): string {
  let title = decodeHtml(collapse(stripHtml(value))).trim();
  const marker = '웹소설로 꿈꾸는 세상!';
  if (title.includes(marker)) title = title.slice(title.indexOf(marker) + marker.length).replace(/^\s*[-|:]\s*/, '');
  title = title.replace(/\s*[-|]\s*노벨피아(?:\s*[-|].*)?$/u, '').trim();
  return title.slice(0, 240);
}

function stripHtml(value: string): string {
  return String(value || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
}

function decodeHtml(value: string): string {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}

function collapse(value: string): string {
  return decodeHtml(value).replace(/\s+/g, ' ').trim();
}

function parseInteger(value: string): number {
  const parsed = Number(String(value).replace(/[^\d]/g, ''));
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function normalizeTitle(value: string): string {
  return collapse(value).toLowerCase().replace(/[\s\-_|:·•]+/g, ' ').trim();
}

function stringifyValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value).slice(0, 1000);
}

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isInteger(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function positiveId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

function parseObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; } catch { return {} as T; }
}
