import { ensurePublicationGateToken, recordReaderEvent } from './download-gate';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { createReaderDownloadGrant } from './reader-grants';
import { readerCopy } from './reader-i18n';
import { dailyNovelUsage } from './reader-quota';
import { getRuntimeSetting, runtimeFlag } from './runtime-settings';
import { getSubscriptionState } from './subscription';
import { TelegramClient } from './telegram';

type TitleRow = {
  id: number;
  title: string;
  original_language: string;
  chapter_count: number;
  publication_status: string;
  genres_tags: string;
  cover_key: string | null;
  latest_publication_id: number;
  latest_published_at: string;
  latest_chapter_end: number | null;
  rating_average: number | null;
  rating_count: number;
};

type ReleaseRow = {
  id: number;
  internal_title: string;
  body_html: string;
  chapter_start: number | null;
  chapter_end: number | null;
  published_at: string | null;
  channel_message_id: number | null;
  file_count: number;
};

export async function handleReaderLibraryRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/reader')) return null;
  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  if (request.method === 'GET' && url.pathname === '/api/app/reader/library') {
    return libraryList(url, env);
  }
  if (request.method === 'GET' && url.pathname === '/api/app/reader/state') {
    const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);
    const [subscription, usage, limitRaw, quotaMode, termsVersion] = await Promise.all([
      getSubscriptionState(auth.telegramUser.id, env, telegram),
      dailyNovelUsage(env, auth.telegramUser.id),
      getRuntimeSetting(env, 'reader_daily_quota_limit', '5'),
      getRuntimeSetting(env, 'reader_daily_quota_mode', 'monitor'),
      getRuntimeSetting(env, 'reader_terms_version', '1'),
    ]);
    const limit = Math.max(1, Math.min(100, Number(limitRaw) || 5));
    const terms = await env.DB.prepare(`
      SELECT accepted_at FROM reader_terms_acceptance WHERE user_id=? AND terms_version=?
    `).bind(auth.telegramUser.id, Math.max(1, Number(termsVersion) || 1)).first<{ accepted_at: string }>();
    const copy = readerCopy(auth.locale);
    return miniAppJson({
      subscriber: subscription.subscriber,
      verification_error: subscription.verificationError,
      quota: { day_key: usage.dayKey, used: usage.used, limit, mode: quotaMode, unlimited: subscription.subscriber },
      terms: { version: Math.max(1, Number(termsVersion) || 1), accepted: Boolean(terms), title: copy.termsTitle, body: copy.termsBody, accept_label: copy.termsAccept },
    });
  }

  const match = /^\/api\/app\/reader\/title\/(\d+)(?:\/(rating|thank-you))?$/.exec(url.pathname);
  if (match) {
    const submissionId = Number(match[1]);
    const action = match[2] || '';
    if (request.method === 'GET' && !action) return titleDetail(submissionId, auth.telegramUser.id, env);
    if (request.method === 'POST' && action === 'rating') return rateTitle(request, submissionId, auth.telegramUser.id, env);
    if (request.method === 'POST' && action === 'thank-you') return thankYou(request, submissionId, auth.telegramUser, env);
  }

  if (request.method === 'POST' && url.pathname === '/api/app/reader/terms') {
    const enabled = await runtimeFlag(env, 'reader_terms_enabled', true);
    if (!enabled) return miniAppJson({ accepted: true, disabled: true });
    const version = Math.max(1, Number(await getRuntimeSetting(env, 'reader_terms_version', '1')) || 1);
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO reader_terms_acceptance(user_id,terms_version,locale,source,accepted_at)
      VALUES (?,?,?,'miniapp',?)
      ON CONFLICT(user_id,terms_version) DO UPDATE SET locale=excluded.locale,accepted_at=excluded.accepted_at
    `).bind(auth.telegramUser.id, version, auth.locale, now).run();
    return miniAppJson({ accepted: true, version, accepted_at: now });
  }

  return miniAppJsonError('not_found', 'Reader endpoint not found.', 404);
}

async function libraryList(url: URL, env: Env): Promise<Response> {
  if (!(await runtimeFlag(env, 'reader_library_enabled', true))) return miniAppJson({ titles: [], disabled: true });
  const limit = boundedInt(url.searchParams.get('limit'), 20, 1, 50);
  const search = String(url.searchParams.get('q') || '').trim().slice(0, 100);
  const whereSearch = search ? 'AND (s.title LIKE ? OR s.genres_tags LIKE ?)' : '';
  const binds: unknown[] = [];
  if (search) binds.push(`%${search}%`, `%${search}%`);
  binds.push(limit);

  const rows = await env.DB.prepare(`
    SELECT
      s.id,s.title,s.original_language,s.chapter_count,s.publication_status,s.genres_tags,s.cover_key,
      p.id AS latest_publication_id,p.published_at AS latest_published_at,p.chapter_end AS latest_chapter_end,
      (SELECT ROUND(AVG(r.rating),2) FROM title_ratings r WHERE r.submission_id=s.id) AS rating_average,
      (SELECT COUNT(*) FROM title_ratings r WHERE r.submission_id=s.id) AS rating_count
    FROM submissions s
    JOIN publications p ON p.id=(
      SELECT p2.id FROM publications p2
      WHERE p2.submission_id=s.id AND p2.status='published' AND p2.telegram_deleted_at IS NULL AND p2.published_at IS NOT NULL
      ORDER BY p2.published_at DESC,p2.id DESC LIMIT 1
    )
    WHERE 1=1 ${whereSearch}
    ORDER BY p.published_at DESC,p.id DESC
    LIMIT ?
  `).bind(...binds).all<TitleRow>();

  return miniAppJson({ titles: rows.results.map(row => ({
    id: Number(row.id),
    title: row.title,
    original_language: row.original_language,
    chapter_count: Number(row.chapter_count),
    publication_status: row.publication_status,
    genres_tags: row.genres_tags,
    has_cover: Boolean(row.cover_key),
    cover_url: row.cover_key ? `/api/covers/${row.id}` : null,
    latest_publication_id: Number(row.latest_publication_id),
    latest_published_at: row.latest_published_at,
    latest_chapter_end: positive(row.latest_chapter_end),
    rating: { average: row.rating_average === null ? null : Number(row.rating_average), count: Number(row.rating_count || 0) },
    app_url: `/app/?title=${row.id}`,
    public_url: `/title/${row.id}`,
  })) });
}

async function titleDetail(submissionId: number, userId: number, env: Env): Promise<Response> {
  const title = await env.DB.prepare(`
    SELECT id,title,original_language,chapter_count,publication_status,genres_tags,cover_key
    FROM submissions WHERE id=?
  `).bind(submissionId).first<Omit<TitleRow,'latest_publication_id'|'latest_published_at'|'latest_chapter_end'|'rating_average'|'rating_count'>>();
  if (!title) return miniAppJsonError('title_not_found', 'Title not found.', 404);

  const [releases, aggregate, ownRating, canRate] = await Promise.all([
    env.DB.prepare(`
      SELECT p.id,p.internal_title,p.body_html,p.chapter_start,p.chapter_end,p.published_at,p.channel_message_id,
        (SELECT COUNT(*) FROM publication_assets a WHERE a.publication_id=p.id) AS file_count
      FROM publications p
      WHERE p.submission_id=? AND p.status='published' AND p.telegram_deleted_at IS NULL
      ORDER BY p.published_at DESC,p.id DESC LIMIT 30
    `).bind(submissionId).all<ReleaseRow>(),
    env.DB.prepare(`SELECT ROUND(AVG(rating),2) AS average,COUNT(*) AS count FROM title_ratings WHERE submission_id=?`).bind(submissionId).first<{ average: number | null; count: number }>(),
    env.DB.prepare(`SELECT rating FROM title_ratings WHERE submission_id=? AND user_id=?`).bind(submissionId,userId).first<{ rating: number }>(),
    env.DB.prepare(`
      SELECT 1 AS ok FROM publication_deliveries d JOIN publications p ON p.id=d.publication_id
      WHERE d.user_id=? AND d.status='delivered' AND p.submission_id=? LIMIT 1
    `).bind(userId,submissionId).first<{ ok: number }>(),
  ]);

  return miniAppJson({
    title: {
      id: Number(title.id), title: title.title, original_language: title.original_language,
      chapter_count: Number(title.chapter_count), publication_status: title.publication_status,
      genres_tags: title.genres_tags, has_cover: Boolean(title.cover_key), cover_url: title.cover_key ? `/api/covers/${title.id}` : null,
    },
    rating: { average: aggregate?.average === null || aggregate?.average === undefined ? null : Number(aggregate.average), count: Number(aggregate?.count || 0), mine: ownRating?.rating || null, can_rate: Boolean(canRate) },
    releases: releases.results.map(row => ({
      id:Number(row.id),title:row.internal_title,excerpt:compactText(row.body_html,180),chapter_start:positive(row.chapter_start),chapter_end:positive(row.chapter_end),published_at:row.published_at,file_count:Number(row.file_count||0),
    })),
  });
}

async function rateTitle(request: Request, submissionId: number, userId: number, env: Env): Promise<Response> {
  if (!(await runtimeFlag(env, 'reader_ratings_enabled', true))) return miniAppJsonError('ratings_disabled', 'Ratings are temporarily unavailable.', 503);
  const body = await jsonBody(request);
  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return miniAppJsonError('invalid_rating', 'Rating must be from 1 to 5.', 400);
  const canRate = await env.DB.prepare(`
    SELECT 1 AS ok FROM publication_deliveries d JOIN publications p ON p.id=d.publication_id
    WHERE d.user_id=? AND d.status='delivered' AND p.submission_id=? LIMIT 1
  `).bind(userId,submissionId).first<{ ok: number }>();
  if (!canRate) return miniAppJsonError('rating_requires_download', 'Download this title before rating it.', 403);
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO title_ratings(submission_id,user_id,rating,created_at,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(submission_id,user_id) DO UPDATE SET rating=excluded.rating,updated_at=excluded.updated_at
  `).bind(submissionId,userId,rating,now,now).run();
  const aggregate = await env.DB.prepare(`SELECT ROUND(AVG(rating),2) AS average,COUNT(*) AS count FROM title_ratings WHERE submission_id=?`).bind(submissionId).first<{ average:number|null;count:number }>();
  return miniAppJson({ rating, average: aggregate?.average === null ? null : Number(aggregate?.average), count:Number(aggregate?.count||0) });
}

async function thankYou(request: Request, submissionId: number, user: Parameters<typeof recordReaderEvent>[2], env: Env): Promise<Response> {
  const body = await jsonBody(request);
  const publicationId = Number(body.publication_id);
  if (!Number.isSafeInteger(publicationId) || publicationId <= 0) return miniAppJsonError('invalid_publication', 'Publication is required.', 400);
  const publication = await env.DB.prepare(`
    SELECT id FROM publications WHERE id=? AND submission_id=? AND status='published' AND telegram_deleted_at IS NULL
  `).bind(publicationId,submissionId).first<{ id:number }>();
  if (!publication) return miniAppJsonError('publication_not_found', 'Release not found.', 404);
  const token = await ensurePublicationGateToken(env, publicationId);
  const grant = await createReaderDownloadGrant(env, {
    userId:user.id,
    submissionId,
    publicationId,
    source:'miniapp',
  });
  await recordReaderEvent(env, publicationId, user, 'thank_you_click', { metadata:{ source:'miniapp' } });
  const username = (await getRuntimeSetting(env,'bot_username','dollartlbot')).replace(/^@/,'') || 'dollartlbot';
  return miniAppJson({
    ok:true,
    expires_at:grant.expiresAt,
    bot_url:`https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(`dl_${token}`)}`,
  });
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  try { return await request.json<Record<string, unknown>>(); } catch { return {}; }
}
function boundedInt(value:string|null,fallback:number,min:number,max:number):number { const parsed=Number(value); return value&&Number.isSafeInteger(parsed)?Math.max(min,Math.min(max,parsed)):fallback; }
function positive(value:number|null):number|null { const n=Number(value); return Number.isSafeInteger(n)&&n>0?n:null; }
function compactText(value:string,max:number):string { const clean=String(value||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); return clean.length<=max?clean:`${clean.slice(0,max-1).trimEnd()}…`; }
