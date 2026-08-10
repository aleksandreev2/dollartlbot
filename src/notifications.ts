import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { errorText, getSubmission } from './db';
import type { SubmissionRow } from './domain';
import { normalizeLocale } from './i18n/index';
import { escapeHtml, TelegramApiError, type TelegramClient } from './telegram';

const BROADCAST_BATCH = 25;
const BROADCAST_MAX_ATTEMPTS = 5;
const DIRECT_NOTIFICATION_BATCH = 50;
const DIRECT_NOTIFICATION_MAX_ATTEMPTS = 5;
const PROGRESS_NOTIFICATION_BATCH = 50;
const PROGRESS_NOTIFICATION_WINDOW_MS = 10 * 60 * 1000;
const MINI_APP_PATH = '/app/';

type PreferenceKey = 'notify_request_updates' | 'notify_releases' | 'notify_announcements' | 'notify_referrals';
export type RequestNotificationKind = 'accepted' | 'rejected' | 'rejected_returned' | 'started' | 'completed' | 'progress';

type BroadcastJob = {
  id: number;
  status: 'queued' | 'running';
  title: string;
  body: string;
};

type BroadcastRecipient = {
  user_id: number;
  attempts: number;
  language: string;
  notify_releases: number;
};

type DirectNotificationRow = {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string;
  action_url: string | null;
  preference_key: PreferenceKey;
  telegram_attempts: number;
  language: string;
  notify_request_updates: number;
  notify_releases: number;
  notify_announcements: number;
  notify_referrals: number;
};

type ProgressNotificationState = {
  last_progress_notified_chapter: number | null;
  last_progress_notified_at: string | null;
  pending_progress_chapter: number | null;
  next_progress_notify_at: string | null;
};

type DueProgressRow = {
  submission_id: number;
  last_progress_notified_chapter: number | null;
};

type RequestCopy = {
  titles: Record<RequestNotificationKind, string>;
  queuePosition: string;
  started: string;
  progress: string;
  sinceLast: string;
};

const OPEN_LABEL: Record<string, string> = {
  en:'Open Dollar TL', es:'Abrir Dollar TL', fil:'Buksan ang Dollar TL', hi:'Dollar TL खोलें', pt:'Abrir Dollar TL', id:'Buka Dollar TL', vi:'Mở Dollar TL', fr:'Ouvrir Dollar TL', de:'Dollar TL öffnen', ru:'Открыть Dollar TL',
};
const RELEASE_TITLE: Record<string, string> = {
  en:'New translation release', es:'Nueva publicación de traducción', fil:'Bagong salin', hi:'नया अनुवाद जारी', pt:'Nova tradução publicada', id:'Rilis terjemahan baru', vi:'Bản dịch mới', fr:'Nouvelle traduction', de:'Neue Übersetzung', ru:'Новый перевод',
};
const REQUEST_COPY: Record<string, RequestCopy> = {
  en:{
    titles:{accepted:'Request accepted',rejected:'Request rejected',rejected_returned:'Request rejected · quota returned',started:'Translation started',completed:'Translation completed',progress:'Translation progress updated'},
    queuePosition:'Queue position', started:'Translation is now visible in your progress.', progress:'Progress', sinceLast:'Since the last notification',
  },
  ru:{
    titles:{accepted:'Заявка принята',rejected:'Заявка отклонена',rejected_returned:'Заявка отклонена · слот возвращён',started:'Перевод начался',completed:'Перевод завершён',progress:'Прогресс перевода обновлён'},
    queuePosition:'Позиция в очереди', started:'Перевод начался и теперь отображается в прогрессе.', progress:'Прогресс', sinceLast:'С прошлого уведомления',
  },
  es:{
    titles:{accepted:'Solicitud aceptada',rejected:'Solicitud rechazada',rejected_returned:'Solicitud rechazada · cupo devuelto',started:'La traducción ha comenzado',completed:'Traducción completada',progress:'Progreso de traducción actualizado'},
    queuePosition:'Posición en la cola', started:'La traducción ya aparece en tu progreso.', progress:'Progreso', sinceLast:'Desde la última notificación',
  },
  fil:{
    titles:{accepted:'Tinanggap ang kahilingan',rejected:'Tinanggihan ang kahilingan',rejected_returned:'Tinanggihan · ibinalik ang quota',started:'Nagsimula na ang pagsasalin',completed:'Tapos na ang pagsasalin',progress:'Na-update ang progreso ng pagsasalin'},
    queuePosition:'Puwesto sa pila', started:'Makikita na ang pagsasalin sa iyong progreso.', progress:'Progreso', sinceLast:'Mula sa huling abiso',
  },
  hi:{
    titles:{accepted:'अनुरोध स्वीकार हुआ',rejected:'अनुरोध अस्वीकृत',rejected_returned:'अनुरोध अस्वीकृत · कोटा वापस',started:'अनुवाद शुरू हुआ',completed:'अनुवाद पूरा हुआ',progress:'अनुवाद प्रगति अपडेट हुई'},
    queuePosition:'कतार में स्थान', started:'अनुवाद अब आपकी प्रगति में दिखाई दे रहा है।', progress:'प्रगति', sinceLast:'पिछली सूचना से',
  },
  pt:{
    titles:{accepted:'Pedido aceito',rejected:'Pedido rejeitado',rejected_returned:'Pedido rejeitado · cota devolvida',started:'Tradução iniciada',completed:'Tradução concluída',progress:'Progresso da tradução atualizado'},
    queuePosition:'Posição na fila', started:'A tradução agora aparece no seu progresso.', progress:'Progresso', sinceLast:'Desde a última notificação',
  },
  id:{
    titles:{accepted:'Permintaan diterima',rejected:'Permintaan ditolak',rejected_returned:'Ditolak · kuota dikembalikan',started:'Terjemahan dimulai',completed:'Terjemahan selesai',progress:'Progres terjemahan diperbarui'},
    queuePosition:'Posisi antrean', started:'Terjemahan sekarang muncul di progresmu.', progress:'Progres', sinceLast:'Sejak notifikasi terakhir',
  },
  vi:{
    titles:{accepted:'Yêu cầu đã được chấp nhận',rejected:'Yêu cầu bị từ chối',rejected_returned:'Bị từ chối · đã hoàn lượt',started:'Đã bắt đầu dịch',completed:'Bản dịch hoàn tất',progress:'Đã cập nhật tiến độ dịch'},
    queuePosition:'Vị trí trong hàng đợi', started:'Bản dịch hiện đã xuất hiện trong tiến độ của bạn.', progress:'Tiến độ', sinceLast:'Từ thông báo trước',
  },
  fr:{
    titles:{accepted:'Demande acceptée',rejected:'Demande refusée',rejected_returned:'Demande refusée · quota rendu',started:'Traduction commencée',completed:'Traduction terminée',progress:'Progression de la traduction mise à jour'},
    queuePosition:'Position dans la file', started:'La traduction apparaît maintenant dans votre progression.', progress:'Progression', sinceLast:'Depuis la dernière notification',
  },
  de:{
    titles:{accepted:'Anfrage angenommen',rejected:'Anfrage abgelehnt',rejected_returned:'Abgelehnt · Kontingent zurückgegeben',started:'Übersetzung gestartet',completed:'Übersetzung abgeschlossen',progress:'Übersetzungsfortschritt aktualisiert'},
    queuePosition:'Warteschlangenposition', started:'Die Übersetzung wird jetzt in deinem Fortschritt angezeigt.', progress:'Fortschritt', sinceLast:'Seit der letzten Benachrichtigung',
  },
};

export async function handleNotificationApiRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/notifications')) return null;
  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  if (request.method === 'GET' && url.pathname === '/api/app/notifications') {
    const prefs = await env.DB.prepare(`SELECT notify_request_updates, notify_releases, notify_announcements, notify_referrals FROM users WHERE telegram_id = ?`).bind(auth.telegramUser.id).first<Record<PreferenceKey, number>>();
    const rows = await env.DB.prepare(`SELECT id, type, title, body, action_url, created_at, read_at FROM user_notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40`).bind(auth.telegramUser.id).all<Record<string, unknown>>();
    const unread = rows.results.reduce((n, row) => n + (row.read_at ? 0 : 1), 0);
    return miniAppJson({preferences:{request_updates:Number(prefs?.notify_request_updates ?? 1)===1,releases:Number(prefs?.notify_releases ?? 1)===1,announcements:Number(prefs?.notify_announcements ?? 1)===1,referrals:Number(prefs?.notify_referrals ?? 1)===1},unread,notifications:rows.results});
  }

  if (request.method === 'POST' && url.pathname === '/api/app/notifications/preferences') {
    const body = await readJson<Record<string, unknown>>(request);
    const current = await env.DB.prepare(`SELECT notify_request_updates, notify_releases, notify_announcements, notify_referrals FROM users WHERE telegram_id = ?`).bind(auth.telegramUser.id).first<Record<PreferenceKey, number>>();
    const next = {
      request_updates: preferenceValue(body, 'request_updates', current?.notify_request_updates),
      releases: preferenceValue(body, 'releases', current?.notify_releases),
      announcements: preferenceValue(body, 'announcements', current?.notify_announcements),
      referrals: preferenceValue(body, 'referrals', current?.notify_referrals),
    };
    await env.DB.prepare(`UPDATE users SET notify_request_updates=?, notify_releases=?, notify_announcements=?, notify_referrals=?, updated_at=? WHERE telegram_id=?`)
      .bind(next.request_updates,next.releases,next.announcements,next.referrals,new Date().toISOString(),auth.telegramUser.id).run();
    return miniAppJson({ok:true,preferences:{request_updates:next.request_updates===1,releases:next.releases===1,announcements:next.announcements===1,referrals:next.referrals===1}});
  }

  if (request.method === 'POST' && url.pathname === '/api/app/notifications/read') {
    const body = await readJson<{id?:number}>(request); const now=new Date().toISOString();
    if(Number.isSafeInteger(Number(body.id))&&Number(body.id)>0) await env.DB.prepare('UPDATE user_notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND user_id=?').bind(now,Number(body.id),auth.telegramUser.id).run();
    else await env.DB.prepare('UPDATE user_notifications SET read_at=COALESCE(read_at,?) WHERE user_id=?').bind(now,auth.telegramUser.id).run();
    return miniAppJson({ok:true});
  }
  return miniAppJsonError('not_found','Notification route not found.',404);
}

export async function createInAppNotification(
  env: Env,
  userId: number,
  type: string,
  title: string,
  body: string,
  actionUrl: string | null = MINI_APP_PATH,
  broadcastId: number | null = null,
): Promise<void> {
  if (broadcastId !== null) {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO user_notifications (
        user_id, type, title, body, action_url, broadcast_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, type, title, body, actionUrl, broadcastId, new Date().toISOString()).run();
    return;
  }
  await env.DB.prepare(`INSERT INTO user_notifications (user_id,type,title,body,action_url,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(userId,type,title,body,actionUrl,new Date().toISOString()).run();
}

export async function sendUserNotification(
  env: Env,
  telegram: TelegramClient,
  userId: number,
  locale: string,
  preference: PreferenceKey,
  type: string,
  title: string,
  body: string,
  actionUrl: string | null = MINI_APP_PATH,
  dedupeKey: string | null = null,
): Promise<void> {
  const now = new Date().toISOString();
  const inserted = await env.DB.prepare(`
    INSERT OR IGNORE INTO user_notifications (
      user_id, type, title, body, action_url, created_at,
      preference_key, dedupe_key, telegram_status, telegram_attempts, telegram_next_attempt_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?)
  `).bind(userId,type,title,body,actionUrl,now,preference,dedupeKey,now).run();
  if ((inserted.meta.changes ?? 0) === 0) return;

  const notificationId = Number(inserted.meta.last_row_id);
  if (!Number.isSafeInteger(notificationId) || notificationId <= 0) return;
  await deliverDirectNotificationById(env, telegram, notificationId, locale);
}

export async function notifySubmissionStatus(
  env: Env,
  telegram: TelegramClient,
  submissionId: number,
  kind: RequestNotificationKind,
): Promise<void> {
  const s = await getSubmission(env, submissionId);
  if (!s) return;
  const lang = normalizeLocale(s.language);
  const copy = REQUEST_COPY[lang] || REQUEST_COPY.en;

  if (kind === 'progress') {
    await scheduleProgressNotification(env, telegram, s);
    return;
  }

  let body = `${s.title}`;
  if (kind === 'accepted' && s.queue_position) body += `\n${copy.queuePosition}: #${s.queue_position}`;
  if (kind === 'started') body += `\n${copy.started}`;
  if (kind === 'completed') body += `\n${progressLine(copy, s.chapter_count, s.chapter_count)}`;

  await sendUserNotification(
    env,
    telegram,
    s.user_id,
    lang,
    'notify_request_updates',
    `request_${kind}`,
    copy.titles[kind],
    body,
    requestActionUrl(s.id),
    requestStatusDedupeKey(s, kind),
  );

  if (kind === 'completed') {
    await markProgressNotificationDelivered(env, s.id, s.chapter_count, new Date());
  }
}

export async function resetProgressNotificationState(
  env: Env,
  submissionId: number,
  baselineChapter: number | null = null,
): Promise<void> {
  if (baselineChapter === null) {
    await env.DB.prepare('DELETE FROM submission_notification_state WHERE submission_id = ?').bind(submissionId).run();
    return;
  }
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO submission_notification_state (
      submission_id, last_progress_notified_chapter, last_progress_notified_at,
      pending_progress_chapter, next_progress_notify_at, updated_at
    ) VALUES (?, ?, NULL, NULL, NULL, ?)
    ON CONFLICT(submission_id) DO UPDATE SET
      last_progress_notified_chapter=excluded.last_progress_notified_chapter,
      last_progress_notified_at=NULL,
      pending_progress_chapter=NULL,
      next_progress_notify_at=NULL,
      updated_at=excluded.updated_at
  `).bind(submissionId, baselineChapter, now).run();
}

export async function runNotificationMaintenance(
  env: Env,
  telegram: TelegramClient,
): Promise<void> {
  await runDirectNotificationMaintenance(env, telegram, DIRECT_NOTIFICATION_BATCH);
  await runProgressNotificationMaintenance(env, telegram, PROGRESS_NOTIFICATION_BATCH);
}

export async function queueReleaseBroadcast(env:Env,publicationId:number,title:string,body:string):Promise<number>{
  const now=new Date().toISOString(); const result=await env.DB.prepare(`INSERT INTO broadcasts (publication_id,kind,status,title,body,created_at) VALUES (?,'release','queued',?,?,?)`).bind(publicationId,title,body,now).run(); return Number(result.meta.last_row_id);
}

export async function runBroadcastMaintenance(env: Env, telegram: TelegramClient, maxBatches = 1): Promise<void> {
  for (let batch = 0; batch < maxBatches; batch += 1) {
    const job = await env.DB.prepare(`
      SELECT id, status, title, body
      FROM broadcasts
      WHERE status IN ('queued', 'running')
      ORDER BY id ASC
      LIMIT 1
    `).first<BroadcastJob>();
    if (!job) return;

    const now = new Date().toISOString();
    await ensureBroadcastRecipients(env, job, now);
    await skipOptedOutRecipients(env, job.id, now);

    const recipients = await env.DB.prepare(`
      SELECT br.user_id, br.attempts, u.language, u.notify_releases
      FROM broadcast_recipients br
      JOIN users u ON u.telegram_id = br.user_id
      WHERE br.broadcast_id = ?
        AND br.status IN ('queued', 'retry')
        AND br.next_attempt_at <= ?
      ORDER BY br.user_id ASC
      LIMIT ?
    `).bind(job.id, now, BROADCAST_BATCH).all<BroadcastRecipient>();

    if (!recipients.results.length) {
      const pending = await refreshBroadcastTotals(env, job.id, now);
      if (pending === 0) continue;
      return;
    }

    for (const recipient of recipients.results) {
      if (Number(recipient.notify_releases) !== 1) {
        await markBroadcastRecipientSkipped(env, job.id, recipient.user_id);
        continue;
      }
      await deliverBroadcastRecipient(env, telegram, job, recipient);
    }

    await refreshBroadcastTotals(env, job.id, new Date().toISOString());
  }
}

async function scheduleProgressNotification(
  env: Env,
  telegram: TelegramClient,
  submission: SubmissionRow,
): Promise<void> {
  const chapter = Number(submission.current_chapter);
  if (!Number.isInteger(chapter) || chapter < 0) return;

  const state = await env.DB.prepare(`
    SELECT last_progress_notified_chapter, last_progress_notified_at,
           pending_progress_chapter, next_progress_notify_at
    FROM submission_notification_state
    WHERE submission_id = ?
  `).bind(submission.id).first<ProgressNotificationState>();

  const now = new Date();
  const lastAtMs = parsedTime(state?.last_progress_notified_at ?? null);
  if (!lastAtMs || now.getTime() - lastAtMs >= PROGRESS_NOTIFICATION_WINDOW_MS) {
    await deliverProgressNotification(
      env,
      telegram,
      submission,
      state?.last_progress_notified_chapter ?? 0,
      now,
    );
    return;
  }

  const nextAt = new Date(lastAtMs + PROGRESS_NOTIFICATION_WINDOW_MS).toISOString();
  await env.DB.prepare(`
    INSERT INTO submission_notification_state (
      submission_id, last_progress_notified_chapter, last_progress_notified_at,
      pending_progress_chapter, next_progress_notify_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(submission_id) DO UPDATE SET
      pending_progress_chapter=excluded.pending_progress_chapter,
      next_progress_notify_at=excluded.next_progress_notify_at,
      updated_at=excluded.updated_at
  `).bind(
    submission.id,
    state?.last_progress_notified_chapter ?? null,
    state?.last_progress_notified_at ?? null,
    chapter,
    nextAt,
    now.toISOString(),
  ).run();
}

async function runProgressNotificationMaintenance(
  env: Env,
  telegram: TelegramClient,
  limit: number,
): Promise<void> {
  const now = new Date();
  const due = await env.DB.prepare(`
    SELECT sns.submission_id, sns.last_progress_notified_chapter
    FROM submission_notification_state sns
    JOIN submissions s ON s.id = sns.submission_id
    WHERE sns.pending_progress_chapter IS NOT NULL
      AND sns.next_progress_notify_at IS NOT NULL
      AND sns.next_progress_notify_at <= ?
      AND s.status = 'accepted'
      AND s.queue_status = 'in_progress'
    ORDER BY sns.next_progress_notify_at ASC, sns.submission_id ASC
    LIMIT ?
  `).bind(now.toISOString(), limit).all<DueProgressRow>();

  for (const row of due.results) {
    const submission = await getSubmission(env, row.submission_id);
    if (!submission || submission.status !== 'accepted' || submission.queue_status !== 'in_progress') continue;
    if (submission.current_chapter === null) continue;
    await deliverProgressNotification(
      env,
      telegram,
      submission,
      row.last_progress_notified_chapter ?? 0,
      now,
    );
  }
}

async function deliverProgressNotification(
  env: Env,
  telegram: TelegramClient,
  submission: SubmissionRow,
  previousChapter: number,
  now: Date,
): Promise<void> {
  const chapter = Number(submission.current_chapter);
  if (!Number.isInteger(chapter) || chapter < 0) return;
  const lang = normalizeLocale(submission.language);
  const copy = REQUEST_COPY[lang] || REQUEST_COPY.en;
  const delta = chapter - Number(previousChapter || 0);
  let body = `${submission.title}\n${progressLine(copy, chapter, submission.chapter_count)}`;
  if (delta !== 0) body += `\n${copy.sinceLast}: ${delta > 0 ? '+' : ''}${delta}`;

  await sendUserNotification(
    env,
    telegram,
    submission.user_id,
    lang,
    'notify_request_updates',
    'request_progress',
    copy.titles.progress,
    body,
    requestActionUrl(submission.id),
    `submission:${submission.id}:progress:${chapter}:${now.toISOString()}`,
  );
  await markProgressNotificationDelivered(env, submission.id, chapter, now);
}

async function markProgressNotificationDelivered(
  env: Env,
  submissionId: number,
  chapter: number,
  now: Date,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO submission_notification_state (
      submission_id, last_progress_notified_chapter, last_progress_notified_at,
      pending_progress_chapter, next_progress_notify_at, updated_at
    ) VALUES (?, ?, ?, NULL, NULL, ?)
    ON CONFLICT(submission_id) DO UPDATE SET
      last_progress_notified_chapter=excluded.last_progress_notified_chapter,
      last_progress_notified_at=excluded.last_progress_notified_at,
      pending_progress_chapter=NULL,
      next_progress_notify_at=NULL,
      updated_at=excluded.updated_at
  `).bind(submissionId, chapter, now.toISOString(), now.toISOString()).run();
}

async function runDirectNotificationMaintenance(
  env: Env,
  telegram: TelegramClient,
  limit: number,
): Promise<void> {
  const rows = await env.DB.prepare(`
    SELECT n.id, n.user_id, n.type, n.title, n.body, n.action_url,
           n.preference_key, n.telegram_attempts,
           u.language, u.notify_request_updates, u.notify_releases,
           u.notify_announcements, u.notify_referrals
    FROM user_notifications n
    JOIN users u ON u.telegram_id = n.user_id
    WHERE n.telegram_status IN ('queued', 'retry')
      AND n.telegram_next_attempt_at IS NOT NULL
      AND n.telegram_next_attempt_at <= ?
    ORDER BY n.telegram_next_attempt_at ASC, n.id ASC
    LIMIT ?
  `).bind(new Date().toISOString(), limit).all<DirectNotificationRow>();

  for (const row of rows.results) {
    await deliverDirectNotification(env, telegram, row, row.language);
  }
}

async function deliverDirectNotificationById(
  env: Env,
  telegram: TelegramClient,
  notificationId: number,
  fallbackLocale: string,
): Promise<void> {
  const row = await env.DB.prepare(`
    SELECT n.id, n.user_id, n.type, n.title, n.body, n.action_url,
           n.preference_key, n.telegram_attempts,
           COALESCE(u.language, ?) AS language,
           u.notify_request_updates, u.notify_releases,
           u.notify_announcements, u.notify_referrals
    FROM user_notifications n
    JOIN users u ON u.telegram_id = n.user_id
    WHERE n.id = ? AND n.telegram_status IN ('queued', 'retry')
  `).bind(fallbackLocale, notificationId).first<DirectNotificationRow>();
  if (!row) return;
  await deliverDirectNotification(env, telegram, row, fallbackLocale);
}

async function deliverDirectNotification(
  env: Env,
  telegram: TelegramClient,
  row: DirectNotificationRow,
  fallbackLocale: string,
): Promise<void> {
  const now = new Date();
  if (!preferenceEnabled(row, row.preference_key)) {
    await env.DB.prepare(`
      UPDATE user_notifications
      SET telegram_status='skipped', telegram_last_error=NULL
      WHERE id=? AND telegram_status IN ('queued','retry')
    `).bind(row.id).run();
    return;
  }

  const lang = normalizeLocale(row.language || fallbackLocale);
  const actionUrl = resolveMiniAppActionUrl(env, row.action_url);
  const icon = notificationIcon(row.type);

  try {
    await telegram.sendMessage(
      row.user_id,
      `<b>${icon} ${escapeHtml(row.title)}</b>\n\n${escapeHtml(row.body)}`,
      {reply_markup:{inline_keyboard:[[{text:OPEN_LABEL[lang]||OPEN_LABEL.en,web_app:{url:actionUrl}}]]}},
    );
    await env.DB.prepare(`
      UPDATE user_notifications
      SET telegram_status='sent', telegram_attempts=telegram_attempts+1,
          telegram_sent_at=?, telegram_last_error=NULL, telegram_next_attempt_at=NULL
      WHERE id=? AND telegram_status IN ('queued','retry')
    `).bind(now.toISOString(), row.id).run();
  } catch (error) {
    const attempts = Number(row.telegram_attempts ?? 0) + 1;
    const retryable = isRetryableNotificationError(error) && attempts < DIRECT_NOTIFICATION_MAX_ATTEMPTS;
    const nextAttemptAt = retryable ? notificationRetryAt(now, attempts, error) : null;
    await env.DB.prepare(`
      UPDATE user_notifications
      SET telegram_status=?, telegram_attempts=?, telegram_next_attempt_at=?,
          telegram_last_error=?
      WHERE id=? AND telegram_status IN ('queued','retry')
    `).bind(
      retryable ? 'retry' : 'failed',
      attempts,
      nextAttemptAt,
      errorText(error).slice(0, 1000),
      row.id,
    ).run();
  }
}

async function ensureBroadcastRecipients(env: Env, job: BroadcastJob, now: string): Promise<void> {
  let shouldSnapshot = job.status === 'queued';
  if (!shouldSnapshot) {
    const existing = await env.DB.prepare(`
      SELECT 1 AS present
      FROM broadcast_recipients
      WHERE broadcast_id = ?
      LIMIT 1
    `).bind(job.id).first<{ present: number }>();
    shouldSnapshot = !existing;
  }

  if (!shouldSnapshot) return;

  await env.DB.batch([
    env.DB.prepare(`
      UPDATE broadcasts
      SET status = 'running', started_at = COALESCE(started_at, ?)
      WHERE id = ? AND status IN ('queued', 'running')
    `).bind(now, job.id),
    env.DB.prepare(`
      INSERT OR IGNORE INTO broadcast_recipients (
        broadcast_id, user_id, status, attempts, next_attempt_at, created_at, updated_at
      )
      SELECT ?, telegram_id, 'queued', 0, ?, ?, ?
      FROM users
      WHERE notify_releases = 1
    `).bind(job.id, now, now, now),
  ]);
}

async function skipOptedOutRecipients(env: Env, broadcastId: number, now: string): Promise<void> {
  await env.DB.prepare(`
    UPDATE broadcast_recipients
    SET status = 'skipped', updated_at = ?
    WHERE broadcast_id = ?
      AND status IN ('queued', 'retry')
      AND EXISTS (
        SELECT 1 FROM users u
        WHERE u.telegram_id = broadcast_recipients.user_id
          AND u.notify_releases = 0
      )
  `).bind(now, broadcastId).run();
}

async function markBroadcastRecipientSkipped(env: Env, broadcastId: number, userId: number): Promise<void> {
  await env.DB.prepare(`
    UPDATE broadcast_recipients
    SET status = 'skipped', updated_at = ?
    WHERE broadcast_id = ? AND user_id = ? AND status IN ('queued', 'retry')
  `).bind(new Date().toISOString(), broadcastId, userId).run();
}

async function deliverBroadcastRecipient(
  env: Env,
  telegram: TelegramClient,
  job: BroadcastJob,
  recipient: BroadcastRecipient,
): Promise<void> {
  const lang = normalizeLocale(recipient.language);
  const heading = RELEASE_TITLE[lang] || RELEASE_TITLE.en;
  const miniAppUrl = resolveMiniAppActionUrl(env, `${MINI_APP_PATH}?view=home`);

  await createInAppNotification(
    env,
    recipient.user_id,
    'release',
    heading,
    job.title,
    `${MINI_APP_PATH}?view=home`,
    job.id,
  );

  try {
    await telegram.sendMessage(
      recipient.user_id,
      `<b>📚 ${escapeHtml(heading)}</b>\n\n<b>${escapeHtml(job.title)}</b>\n${escapeHtml(shorten(job.body,500))}`,
      {reply_markup:{inline_keyboard:[[{text:OPEN_LABEL[lang]||OPEN_LABEL.en,web_app:{url:miniAppUrl}}]]}},
    );
    await env.DB.prepare(`
      UPDATE broadcast_recipients
      SET status = 'sent', attempts = attempts + 1,
          telegram_sent_at = ?, last_error = NULL, updated_at = ?
      WHERE broadcast_id = ? AND user_id = ? AND status IN ('queued', 'retry')
    `).bind(
      new Date().toISOString(),
      new Date().toISOString(),
      job.id,
      recipient.user_id,
    ).run();
  } catch (error) {
    const attempts = Number(recipient.attempts ?? 0) + 1;
    const retryable = isRetryableBroadcastError(error) && attempts < BROADCAST_MAX_ATTEMPTS;
    const now = new Date();
    const nextAttemptAt = retryable ? broadcastRetryAt(now, attempts, error) : now.toISOString();
    await env.DB.prepare(`
      UPDATE broadcast_recipients
      SET status = ?, attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ?
      WHERE broadcast_id = ? AND user_id = ? AND status IN ('queued', 'retry')
    `).bind(
      retryable ? 'retry' : 'failed',
      attempts,
      nextAttemptAt,
      errorText(error).slice(0, 1000),
      now.toISOString(),
      job.id,
      recipient.user_id,
    ).run();
  }
}

async function refreshBroadcastTotals(env: Env, broadcastId: number, now: string): Promise<number> {
  const totals = await env.DB.prepare(`
    SELECT
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN status IN ('queued', 'retry') THEN 1 ELSE 0 END) AS pending
    FROM broadcast_recipients
    WHERE broadcast_id = ?
  `).bind(broadcastId).first<{ sent: number | null; failed: number | null; pending: number | null }>();

  const sent = Number(totals?.sent ?? 0);
  const failed = Number(totals?.failed ?? 0);
  const pending = Number(totals?.pending ?? 0);
  await env.DB.prepare(`
    UPDATE broadcasts
    SET sent_count = ?, failed_count = ?, status = ?, completed_at = ?
    WHERE id = ?
  `).bind(
    sent,
    failed,
    pending === 0 ? 'completed' : 'running',
    pending === 0 ? now : null,
    broadcastId,
  ).run();
  return pending;
}

function requestStatusDedupeKey(submission: SubmissionRow, kind: Exclude<RequestNotificationKind, 'progress'>): string {
  if (kind === 'started') return `submission:${submission.id}:started:${submission.started_at ?? 'unknown'}`;
  if (kind === 'completed') return `submission:${submission.id}:completed:${submission.completed_at ?? 'unknown'}`;
  return `submission:${submission.id}:${kind}`;
}

function requestActionUrl(submissionId: number): string {
  return `${MINI_APP_PATH}?view=requests&request=${submissionId}`;
}

function progressLine(copy: RequestCopy, chapter: number, chapterCount: number): string {
  const percent = chapterCount > 0 ? Math.max(0, Math.min(100, Math.round((chapter / chapterCount) * 100))) : 0;
  return `${copy.progress}: ${chapter} / ${chapterCount} (${percent}%)`;
}

function resolveMiniAppActionUrl(env: Env, actionUrl: string | null): string {
  const configured = String((env as unknown as {MINI_APP_URL?:string}).MINI_APP_URL || 'https://t.me/dollartlbot');
  if (!actionUrl) return configured;
  if (/^https:\/\//i.test(actionUrl)) return actionUrl;
  try {
    return new URL(actionUrl, configured).toString();
  } catch {
    return configured;
  }
}

function notificationIcon(type: string): string {
  if (type === 'release') return '📚';
  if (type.includes('referral')) return '🎁';
  if (type.includes('completed')) return '✅';
  if (type.includes('rejected')) return '✕';
  if (type.includes('started')) return '▶️';
  if (type.includes('progress')) return '📈';
  if (type.includes('accepted')) return '✓';
  if (type.includes('announce')) return '📣';
  return '🔔';
}

function preferenceEnabled(row: DirectNotificationRow, key: PreferenceKey): boolean {
  return Number(row[key] ?? 1) === 1;
}

function preferenceValue(body: Record<string, unknown>, key: string, fallback: number | undefined): number {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return Number(fallback ?? 1) === 1 ? 1 : 0;
  return bool(body[key]);
}

function isRetryableNotificationError(error: unknown): boolean {
  if (!(error instanceof TelegramApiError)) return true;
  if (error.retryAfter !== undefined || error.code === 429 || error.httpStatus === 429) return true;
  if ((error.httpStatus ?? 0) >= 500 || (error.code ?? 0) >= 500) return true;
  if (error.code === undefined && error.httpStatus === undefined) return true;
  return false;
}

function notificationRetryAt(now: Date, attempts: number, error: unknown): string {
  const retryAfter = error instanceof TelegramApiError ? error.retryAfter : undefined;
  const seconds = retryAfter !== undefined
    ? Math.max(1, Math.min(3600, retryAfter))
    : Math.min(3600, 60 * (2 ** Math.max(0, attempts - 1)));
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function isRetryableBroadcastError(error: unknown): boolean {
  if (!(error instanceof TelegramApiError)) return true;
  if (error.retryAfter !== undefined || error.code === 429 || error.httpStatus === 429) return true;
  if ((error.httpStatus ?? 0) >= 500 || (error.code ?? 0) >= 500) return true;
  // No Telegram/HTTP code means a transport timeout/network failure. The delivery
  // result is ambiguous, so retry only through the bounded recipient attempt state.
  if (error.code === undefined && error.httpStatus === undefined) return true;
  return false;
}

function broadcastRetryAt(now: Date, attempts: number, error: unknown): string {
  const retryAfter = error instanceof TelegramApiError ? error.retryAfter : undefined;
  const seconds = retryAfter !== undefined
    ? Math.max(1, Math.min(3600, retryAfter))
    : Math.min(3600, 60 * (2 ** Math.max(0, attempts - 1)));
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

function parsedTime(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function bool(v:unknown):number{return v===true||v===1||v==='1'?1:0;}
function shorten(v:string,max:number):string{return v.length<=max?v:`${v.slice(0,max-1)}…`;}
async function readJson<T>(r:Request):Promise<T>{try{return await r.json() as T;}catch{return{} as T;}}
