import { getSubmission } from './db';
import { normalizeLocale } from './i18n/index';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { sendUserNotification } from './notifications';
import { canonicalIdentityKeysForSubmission, novelpiaFollowKey } from './request-identity';
import type { SubmissionRow } from './domain';
import type { TelegramClient } from './telegram';

const FOLLOW_PROGRESS_WINDOW_MS = 10 * 60 * 1000;
const FOLLOW_LIST_LIMIT = 80;
const DELIVERY_CONCURRENCY = 8;

export type FollowLifecycleKind = 'accepted' | 'started' | 'completed' | 'progress';

type FollowerRow = { user_id: number; language: string };
type FollowProgressState = {
  last_notified_chapter: number | null;
  last_notified_at: string | null;
  pending_chapter: number | null;
  next_notify_at: string | null;
};

type FollowCopy = {
  accepted: string;
  started: string;
  completed: string;
  progress: string;
  acceptedBody: string;
  startedBody: string;
  completedBody: string;
  progressLabel: string;
  queue: string;
  since: string;
};

const COPY: Record<string, FollowCopy> = {
  en:{accepted:'A title you follow was accepted',started:'A title you follow is now translating',completed:'A followed translation is complete',progress:'A followed translation moved forward',acceptedBody:'Dollar TL accepted this title for translation.',startedBody:'Dollar TL has started translating this title.',completedBody:'The translation has been marked complete.',progressLabel:'Progress',queue:'Queue position',since:'Since the last update'},
  ru:{accepted:'Тайтл из подписок принят',started:'Перевод тайтла из подписок начался',completed:'Перевод тайтла из подписок завершён',progress:'Прогресс тайтла из подписок обновлён',acceptedBody:'Dollar TL принял этот тайтл на перевод.',startedBody:'Dollar TL начал перевод этого тайтла.',completedBody:'Перевод отмечен как завершённый.',progressLabel:'Прогресс',queue:'Позиция в очереди',since:'С прошлого обновления'},
  es:{accepted:'Se aceptó un título que sigues',started:'Un título que sigues ya se está traduciendo',completed:'Terminó una traducción que sigues',progress:'Avanzó una traducción que sigues',acceptedBody:'Dollar TL aceptó este título para traducirlo.',startedBody:'Dollar TL ha comenzado a traducir este título.',completedBody:'La traducción se ha marcado como completada.',progressLabel:'Progreso',queue:'Posición en la cola',since:'Desde la última actualización'},
  fil:{accepted:'Tinanggap ang title na sinusundan mo',started:'Isinasalin na ang title na sinusundan mo',completed:'Tapos na ang translation na sinusundan mo',progress:'Umusad ang translation na sinusundan mo',acceptedBody:'Tinanggap ng Dollar TL ang title para sa translation.',startedBody:'Sinimulan na ng Dollar TL ang translation ng title.',completedBody:'Minarkahang kumpleto ang translation.',progressLabel:'Progreso',queue:'Puwesto sa pila',since:'Mula sa huling update'},
  hi:{accepted:'आपके फ़ॉलो किए शीर्षक को स्वीकार किया गया',started:'आपके फ़ॉलो किए शीर्षक का अनुवाद शुरू हुआ',completed:'फ़ॉलो किया गया अनुवाद पूरा हुआ',progress:'फ़ॉलो किए अनुवाद में प्रगति हुई',acceptedBody:'Dollar TL ने इस शीर्षक को अनुवाद के लिए स्वीकार किया है।',startedBody:'Dollar TL ने इस शीर्षक का अनुवाद शुरू कर दिया है।',completedBody:'अनुवाद को पूर्ण चिह्नित किया गया है।',progressLabel:'प्रगति',queue:'कतार में स्थान',since:'पिछले अपडेट से'},
  pt:{accepted:'Um título seguido foi aceito',started:'Um título seguido entrou em tradução',completed:'Uma tradução seguida foi concluída',progress:'Uma tradução seguida avançou',acceptedBody:'A Dollar TL aceitou este título para tradução.',startedBody:'A Dollar TL começou a traduzir este título.',completedBody:'A tradução foi marcada como concluída.',progressLabel:'Progresso',queue:'Posição na fila',since:'Desde a última atualização'},
  id:{accepted:'Judul yang kamu ikuti diterima',started:'Judul yang kamu ikuti mulai diterjemahkan',completed:'Terjemahan yang kamu ikuti selesai',progress:'Terjemahan yang kamu ikuti bertambah maju',acceptedBody:'Dollar TL menerima judul ini untuk diterjemahkan.',startedBody:'Dollar TL mulai menerjemahkan judul ini.',completedBody:'Terjemahan telah ditandai selesai.',progressLabel:'Progres',queue:'Posisi antrean',since:'Sejak pembaruan terakhir'},
  vi:{accepted:'Tác phẩm bạn theo dõi đã được chấp nhận',started:'Tác phẩm bạn theo dõi đã bắt đầu dịch',completed:'Bản dịch bạn theo dõi đã hoàn tất',progress:'Bản dịch bạn theo dõi có tiến triển',acceptedBody:'Dollar TL đã chấp nhận tác phẩm này để dịch.',startedBody:'Dollar TL đã bắt đầu dịch tác phẩm này.',completedBody:'Bản dịch đã được đánh dấu hoàn tất.',progressLabel:'Tiến độ',queue:'Vị trí hàng đợi',since:'Từ lần cập nhật trước'},
  fr:{accepted:'Un titre suivi a été accepté',started:'Un titre suivi est maintenant en traduction',completed:'Une traduction suivie est terminée',progress:'Une traduction suivie a avancé',acceptedBody:'Dollar TL a accepté ce titre pour traduction.',startedBody:'Dollar TL a commencé la traduction de ce titre.',completedBody:'La traduction a été marquée comme terminée.',progressLabel:'Progression',queue:'Position dans la file',since:'Depuis la dernière mise à jour'},
  de:{accepted:'Ein gefolgter Titel wurde angenommen',started:'Ein gefolgter Titel wird jetzt übersetzt',completed:'Eine gefolgte Übersetzung ist abgeschlossen',progress:'Eine gefolgte Übersetzung ist weitergekommen',acceptedBody:'Dollar TL hat diesen Titel zur Übersetzung angenommen.',startedBody:'Dollar TL hat mit der Übersetzung dieses Titels begonnen.',completedBody:'Die Übersetzung wurde als abgeschlossen markiert.',progressLabel:'Fortschritt',queue:'Warteschlangenposition',since:'Seit dem letzten Update'},
};

export async function handleTitleFollowingRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const list = request.method === 'GET' && url.pathname === '/api/app/following';
  const submission = request.method === 'POST' && url.pathname === '/api/app/following/submission';
  const catalog = request.method === 'POST' && url.pathname === '/api/app/following/catalog';
  if (!list && !submission && !catalog) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  if (list) return miniAppJson(await followingPayload(env, auth.telegramUser.id));
  const body = await readJson<Record<string, unknown>>(request);
  const following = body.following !== false;

  if (submission) {
    const submissionId = positiveInt(body.submission_id);
    if (!submissionId) return miniAppJsonError('invalid_submission', 'Choose a valid title.', 400);
    const row = await env.DB.prepare(`
      SELECT id,status FROM submissions WHERE id=?
    `).bind(submissionId).first<{ id: number; status: string }>();
    if (!row || row.status === 'rejected') return miniAppJsonError('not_found', 'This title is not available to follow.', 404);
    const key = await primaryFollowKeyForSubmission(env, submissionId);
    await setFollow(env, auth.telegramUser.id, key, following);
    return miniAppJson({ ok: true, following, follow_key: key, submission_id: submissionId });
  }

  const catalogId = positiveInt(body.catalog_id);
  if (!catalogId) return miniAppJsonError('invalid_catalog', 'Choose a valid discovered title.', 400);
  const row = await env.DB.prepare(`
    SELECT id,provider,external_id,linked_submission_id
    FROM discovery_catalog WHERE id=?
  `).bind(catalogId).first<{ id:number; provider:string; external_id:string; linked_submission_id:number|null }>();
  if (!row) return miniAppJsonError('not_found', 'This discovered title no longer exists.', 404);
  const key = row.linked_submission_id
    ? await primaryFollowKeyForSubmission(env, row.linked_submission_id)
    : row.provider === 'novelpia'
      ? novelpiaFollowKey(row.external_id)
      : null;
  if (!key) return miniAppJsonError('unsupported_identity', 'This source cannot be followed yet.', 409);
  await setFollow(env, auth.telegramUser.id, key, following);
  return miniAppJson({ ok: true, following, follow_key: key, catalog_id: catalogId, linked_submission_id: row.linked_submission_id });
}

export async function notifySubmissionFollowers(
  env: Env,
  telegram: TelegramClient,
  submissionId: number,
  kind: FollowLifecycleKind,
): Promise<void> {
  const submission = await getSubmission(env, submissionId);
  if (!submission) return;
  if (kind === 'progress') {
    await scheduleFollowerProgress(env, telegram, submission);
    return;
  }
  await deliverFollowerStatus(env, telegram, submission, kind);
  if (kind === 'completed') {
    await markFollowerProgressDelivered(env, submission.id, submission.chapter_count, new Date());
  }
}

export async function runTitleFollowingMaintenance(env: Env, telegram: TelegramClient): Promise<void> {
  const now = new Date();
  const due = await env.DB.prepare(`
    SELECT fps.submission_id
    FROM title_follow_progress_state fps
    JOIN submissions s ON s.id=fps.submission_id
    WHERE fps.pending_chapter IS NOT NULL
      AND fps.next_notify_at IS NOT NULL
      AND fps.next_notify_at<=?
      AND s.status='accepted' AND s.queue_status='in_progress'
    ORDER BY fps.next_notify_at ASC,fps.submission_id ASC
    LIMIT 40
  `).bind(now.toISOString()).all<{ submission_id:number }>();

  for (const row of due.results) {
    const submission = await getSubmission(env, row.submission_id);
    if (!submission || submission.current_chapter === null || submission.queue_status !== 'in_progress') continue;
    const state = await followProgressState(env, submission.id);
    await deliverFollowerProgress(env, telegram, submission, Number(state?.last_notified_chapter ?? 0), now);
  }
}

async function followingPayload(env: Env, userId: number) {
  const rows = await env.DB.prepare(`
    SELECT follow_key,created_at,updated_at
    FROM title_follows
    WHERE user_id=?
    ORDER BY updated_at DESC
    LIMIT ?
  `).bind(userId, FOLLOW_LIST_LIMIT).all<{ follow_key:string; created_at:string; updated_at:string }>();

  const items: Record<string, unknown>[] = [];
  for (const follow of rows.results) {
    const item = await resolveFollowItem(env, follow.follow_key);
    if (item) items.push({ ...item, follow_key: follow.follow_key, followed_at: follow.created_at });
  }
  return { count: items.length, followed_keys: rows.results.map((row) => row.follow_key), items };
}

async function resolveFollowItem(env: Env, key: string): Promise<Record<string, unknown> | null> {
  const direct = /^submission:(\d+)$/.exec(key);
  if (direct) return submissionFollowItem(env, Number(direct[1]));

  const novelpia = /^novelpia:(\d{2,9})$/.exec(key);
  if (!novelpia) return null;
  const identity = await env.DB.prepare(`
    SELECT submission_id FROM title_identities
    WHERE identity_type='novelpia' AND identity_value=?
  `).bind(novelpia[1]).first<{ submission_id:number|null }>();
  if (identity?.submission_id) {
    const local = await submissionFollowItem(env, identity.submission_id);
    if (local) return { ...local, identity_key: key };
  }

  const catalog = await env.DB.prepare(`
    SELECT id,title,original_title,author,original_language,chapter_count,publication_status,
           source_url,cover_url,raw_available,linked_submission_id
    FROM discovery_catalog
    WHERE provider='novelpia' AND external_id=?
    ORDER BY id DESC LIMIT 1
  `).bind(novelpia[1]).first<Record<string, unknown>>();
  if (!catalog) return null;
  if (Number(catalog.linked_submission_id) > 0) {
    const local = await submissionFollowItem(env, Number(catalog.linked_submission_id));
    if (local) return { ...local, identity_key: key };
  }
  return {
    kind: 'catalog',
    catalog_id: Number(catalog.id),
    title: catalog.title,
    original_title: catalog.original_title,
    author: catalog.author,
    original_language: catalog.original_language,
    chapter_count: Number(catalog.chapter_count ?? 0) || null,
    publication_status: catalog.publication_status,
    source_url: catalog.source_url,
    cover_url: catalog.cover_url,
    raw_available: Boolean(catalog.raw_available),
    identity_key: key,
  };
}

async function submissionFollowItem(env: Env, submissionId: number): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare(`
    SELECT id,title,original_language,chapter_count,publication_status,status,queue_status,
           queue_position,current_chapter,progress_updated_at,source_url,updated_at
    FROM submissions WHERE id=? AND status<>'rejected'
  `).bind(submissionId).first<Record<string, unknown>>();
  if (!row) return null;
  const current = Number(row.current_chapter ?? 0);
  const total = Number(row.chapter_count ?? 0);
  return {
    kind: 'submission',
    submission_id: Number(row.id),
    title: row.title,
    original_language: row.original_language,
    chapter_count: total,
    publication_status: row.publication_status,
    request_status: row.status,
    queue_status: row.queue_status,
    queue_position: row.queue_position,
    current_chapter: row.current_chapter,
    progress_percent: current >= 0 && total > 0 && row.current_chapter !== null
      ? Math.max(0, Math.min(100, Math.round((current / total) * 100)))
      : null,
    progress_updated_at: row.progress_updated_at,
    source_url: row.source_url,
    updated_at: row.updated_at,
  };
}

async function setFollow(env: Env, userId: number, key: string, following: boolean): Promise<void> {
  if (following) {
    const now = new Date().toISOString();
    await env.DB.prepare(`
      INSERT INTO title_follows (user_id,follow_key,created_at,updated_at)
      VALUES (?,?,?,?)
      ON CONFLICT(user_id,follow_key) DO UPDATE SET updated_at=excluded.updated_at
    `).bind(userId, key, now, now).run();
    return;
  }
  await env.DB.prepare('DELETE FROM title_follows WHERE user_id=? AND follow_key=?').bind(userId, key).run();
}

async function primaryFollowKeyForSubmission(env: Env, submissionId: number): Promise<string> {
  const canonical = await env.DB.prepare(`
    SELECT identity_type,identity_value
    FROM title_identities WHERE submission_id=?
    ORDER BY CASE WHEN identity_type='novelpia' THEN 0 ELSE 1 END
    LIMIT 1
  `).bind(submissionId).first<{ identity_type:string; identity_value:string }>();
  if (canonical) return `${canonical.identity_type}:${canonical.identity_value}`;

  const legacy = await env.DB.prepare(`
    SELECT external_id FROM submission_external_sources
    WHERE submission_id=? AND provider IN ('novelpia','raw_fucknovelpia')
      AND external_id IS NOT NULL
    ORDER BY CASE WHEN provider='novelpia' THEN 0 ELSE 1 END,id ASC
    LIMIT 1
  `).bind(submissionId).first<{ external_id:string }>();
  const novelpia = legacy?.external_id ? novelpiaFollowKey(legacy.external_id) : null;
  return novelpia || `submission:${submissionId}`;
}

async function followerRows(env: Env, submission: SubmissionRow): Promise<FollowerRow[]> {
  const keys = await canonicalIdentityKeysForSubmission(env, submission.id);
  if (!keys.length) return [];
  const placeholders = keys.map(() => '?').join(',');
  const rows = await env.DB.prepare(`
    SELECT DISTINCT tf.user_id,COALESCE(u.language,'en') AS language
    FROM title_follows tf
    JOIN users u ON u.telegram_id=tf.user_id
    WHERE tf.follow_key IN (${placeholders}) AND tf.user_id<>?
    ORDER BY tf.user_id ASC
  `).bind(...keys, submission.user_id).all<FollowerRow>();
  return rows.results;
}

async function deliverFollowerStatus(
  env: Env,
  telegram: TelegramClient,
  submission: SubmissionRow,
  kind: Exclude<FollowLifecycleKind, 'progress'>,
): Promise<void> {
  const followers = await followerRows(env, submission);
  if (!followers.length) return;
  await mapConcurrent(followers, DELIVERY_CONCURRENCY, async (follower) => {
    const lang = normalizeLocale(follower.language);
    const copy = COPY[lang] || COPY.en;
    let body = `${submission.title}\n${copy[kind + 'Body' as keyof FollowCopy]}`;
    if (kind === 'accepted' && submission.queue_position) body += `\n${copy.queue}: #${submission.queue_position}`;
    if (kind === 'completed') body += `\n${progressText(copy, submission.chapter_count, submission.chapter_count)}`;
    await sendUserNotification(
      env,
      telegram,
      follower.user_id,
      lang,
      'notify_request_updates',
      `follow_${kind}`,
      copy[kind],
      body,
      `/app/?title=${submission.id}`,
      statusDedupeKey(submission, follower.user_id, kind),
    );
  });
}

async function scheduleFollowerProgress(env: Env, telegram: TelegramClient, submission: SubmissionRow): Promise<void> {
  const chapter = Number(submission.current_chapter);
  if (!Number.isInteger(chapter) || chapter < 0) return;
  const state = await followProgressState(env, submission.id);
  const now = new Date();
  const lastAt = parsedTime(state?.last_notified_at ?? null);
  if (!lastAt || now.getTime() - lastAt >= FOLLOW_PROGRESS_WINDOW_MS) {
    await deliverFollowerProgress(env, telegram, submission, Number(state?.last_notified_chapter ?? 0), now);
    return;
  }
  const next = new Date(lastAt + FOLLOW_PROGRESS_WINDOW_MS).toISOString();
  await env.DB.prepare(`
    INSERT INTO title_follow_progress_state (
      submission_id,last_notified_chapter,last_notified_at,pending_chapter,next_notify_at,updated_at
    ) VALUES (?,?,?,?,?,?)
    ON CONFLICT(submission_id) DO UPDATE SET
      pending_chapter=excluded.pending_chapter,next_notify_at=excluded.next_notify_at,updated_at=excluded.updated_at
  `).bind(
    submission.id,
    state?.last_notified_chapter ?? null,
    state?.last_notified_at ?? null,
    chapter,
    next,
    now.toISOString(),
  ).run();
}

async function deliverFollowerProgress(
  env: Env,
  telegram: TelegramClient,
  submission: SubmissionRow,
  previousChapter: number,
  now: Date,
): Promise<void> {
  const chapter = Number(submission.current_chapter);
  if (!Number.isInteger(chapter) || chapter < 0) return;
  const followers = await followerRows(env, submission);
  if (followers.length) {
    await mapConcurrent(followers, DELIVERY_CONCURRENCY, async (follower) => {
      const lang = normalizeLocale(follower.language);
      const copy = COPY[lang] || COPY.en;
      const delta = chapter - Number(previousChapter || 0);
      let body = `${submission.title}\n${progressText(copy, chapter, submission.chapter_count)}`;
      if (delta !== 0) body += `\n${copy.since}: ${delta > 0 ? '+' : ''}${delta}`;
      await sendUserNotification(
        env,
        telegram,
        follower.user_id,
        lang,
        'notify_request_updates',
        'follow_progress',
        copy.progress,
        body,
        `/app/?title=${submission.id}`,
        `follow:${follower.user_id}:submission:${submission.id}:progress:${chapter}`,
      );
    });
  }
  await markFollowerProgressDelivered(env, submission.id, chapter, now);
}

async function markFollowerProgressDelivered(env: Env, submissionId: number, chapter: number, now: Date): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO title_follow_progress_state (
      submission_id,last_notified_chapter,last_notified_at,pending_chapter,next_notify_at,updated_at
    ) VALUES (?,?,?,NULL,NULL,?)
    ON CONFLICT(submission_id) DO UPDATE SET
      last_notified_chapter=excluded.last_notified_chapter,last_notified_at=excluded.last_notified_at,
      pending_chapter=NULL,next_notify_at=NULL,updated_at=excluded.updated_at
  `).bind(submissionId, chapter, now.toISOString(), now.toISOString()).run();
}

async function followProgressState(env: Env, submissionId: number): Promise<FollowProgressState | null> {
  return env.DB.prepare(`
    SELECT last_notified_chapter,last_notified_at,pending_chapter,next_notify_at
    FROM title_follow_progress_state WHERE submission_id=?
  `).bind(submissionId).first<FollowProgressState>();
}

function statusDedupeKey(
  submission: SubmissionRow,
  userId: number,
  kind: Exclude<FollowLifecycleKind, 'progress'>,
): string {
  if (kind === 'started') return `follow:${userId}:submission:${submission.id}:started:${submission.started_at ?? 'unknown'}`;
  if (kind === 'completed') return `follow:${userId}:submission:${submission.id}:completed:${submission.completed_at ?? 'unknown'}`;
  return `follow:${userId}:submission:${submission.id}:${kind}`;
}

function progressText(copy: FollowCopy, chapter: number, total: number): string {
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((chapter / total) * 100))) : 0;
  return `${copy.progressLabel}: ${chapter} / ${total} (${percent}%)`;
}

async function mapConcurrent<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  for (let offset = 0; offset < items.length; offset += concurrency) {
    await Promise.all(items.slice(offset, offset + concurrency).map(fn));
  }
}

function positiveInt(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function parsedTime(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
async function readJson<T>(request: Request): Promise<T> {
  try { return await request.json() as T; } catch { return {} as T; }
}
