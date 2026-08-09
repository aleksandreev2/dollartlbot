import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { errorText, getSubmission } from './db';
import { normalizeLocale } from './i18n/index';
import { escapeHtml, TelegramApiError, type TelegramClient } from './telegram';

const BROADCAST_BATCH = 25;
const BROADCAST_MAX_ATTEMPTS = 5;
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

const OPEN_LABEL: Record<string, string> = {
  en:'Open Dollar TL', es:'Abrir Dollar TL', fil:'Buksan ang Dollar TL', hi:'Dollar TL खोलें', pt:'Abrir Dollar TL', id:'Buka Dollar TL', vi:'Mở Dollar TL', fr:'Ouvrir Dollar TL', de:'Dollar TL öffnen', ru:'Открыть Dollar TL',
};
const RELEASE_TITLE: Record<string, string> = {
  en:'New translation release', es:'Nueva publicación de traducción', fil:'Bagong salin', hi:'नया अनुवाद जारी', pt:'Nova tradução publicada', id:'Rilis terjemahan baru', vi:'Bản dịch mới', fr:'Nouvelle traduction', de:'Neue Übersetzung', ru:'Новый перевод',
};
const STATUS_TITLE: Record<string, Record<RequestNotificationKind,string>> = {
  en:{accepted:'Request accepted',rejected:'Request rejected',rejected_returned:'Request rejected · quota returned',started:'Translation started',completed:'Translation completed',progress:'Translation progress updated'},
  ru:{accepted:'Заявка принята',rejected:'Заявка отклонена',rejected_returned:'Заявка отклонена · слот возвращён',started:'Перевод начался',completed:'Перевод завершён',progress:'Прогресс перевода обновлён'},
  es:{accepted:'Solicitud aceptada',rejected:'Solicitud rechazada',rejected_returned:'Solicitud rechazada · cupo devuelto',started:'La traducción ha comenzado',completed:'Traducción completada',progress:'Progreso actualizado'},
  fil:{accepted:'Tinanggap ang kahilingan',rejected:'Tinanggihan ang kahilingan',rejected_returned:'Tinanggihan · ibinalik ang quota',started:'Nagsimula na ang pagsasalin',completed:'Tapos na ang pagsasalin',progress:'Na-update ang progreso'},
  hi:{accepted:'अनुरोध स्वीकार हुआ',rejected:'अनुरोध अस्वीकृत',rejected_returned:'अनुरोध अस्वीकृत · कोटा वापस',started:'अनुवाद शुरू हुआ',completed:'अनुवाद पूरा हुआ',progress:'अनुवाद प्रगति अपडेट हुई'},
  pt:{accepted:'Pedido aceito',rejected:'Pedido rejeitado',rejected_returned:'Pedido rejeitado · cota devolvida',started:'Tradução iniciada',completed:'Tradução concluída',progress:'Progresso atualizado'},
  id:{accepted:'Permintaan diterima',rejected:'Permintaan ditolak',rejected_returned:'Ditolak · kuota dikembalikan',started:'Terjemahan dimulai',completed:'Terjemahan selesai',progress:'Progres diperbarui'},
  vi:{accepted:'Yêu cầu đã được chấp nhận',rejected:'Yêu cầu bị từ chối',rejected_returned:'Bị từ chối · đã hoàn lượt',started:'Đã bắt đầu dịch',completed:'Bản dịch hoàn tất',progress:'Đã cập nhật tiến độ'},
  fr:{accepted:'Demande acceptée',rejected:'Demande refusée',rejected_returned:'Demande refusée · quota rendu',started:'Traduction commencée',completed:'Traduction terminée',progress:'Progression mise à jour'},
  de:{accepted:'Anfrage angenommen',rejected:'Anfrage abgelehnt',rejected_returned:'Abgelehnt · Kontingent zurückgegeben',started:'Übersetzung gestartet',completed:'Übersetzung abgeschlossen',progress:'Fortschritt aktualisiert'},
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
    await env.DB.prepare(`UPDATE users SET notify_request_updates=?, notify_releases=?, notify_announcements=?, notify_referrals=?, updated_at=? WHERE telegram_id=?`)
      .bind(bool(body.request_updates),bool(body.releases),bool(body.announcements),bool(body.referrals),new Date().toISOString(),auth.telegramUser.id).run();
    return miniAppJson({ok:true});
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

export async function sendUserNotification(env:Env,telegram:TelegramClient,userId:number,locale:string,preference:PreferenceKey,type:string,title:string,body:string):Promise<void>{
  await createInAppNotification(env,userId,type,title,body);
  const row=await env.DB.prepare(`SELECT ${preference} AS enabled FROM users WHERE telegram_id=?`).bind(userId).first<{enabled:number}>();
  if(Number(row?.enabled??1)!==1)return;
  const lang=normalizeLocale(locale); const miniAppUrl=String((env as unknown as {MINI_APP_URL?:string}).MINI_APP_URL||'https://t.me/dollartlbot');
  await telegram.sendMessage(userId,`<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`,{reply_markup:{inline_keyboard:[[{text:OPEN_LABEL[lang]||OPEN_LABEL.en,web_app:{url:miniAppUrl}}]]}}).catch(()=>undefined);
}

export async function notifySubmissionStatus(env:Env,telegram:TelegramClient,submissionId:number,kind:RequestNotificationKind):Promise<void>{
  const s=await getSubmission(env,submissionId); if(!s)return; const lang=normalizeLocale(s.language); const title=(STATUS_TITLE[lang]||STATUS_TITLE.en)[kind];
  let body=`${s.title}`;
  if(kind==='accepted') body += s.queue_position ? `\n${lang==='ru'?'Позиция в очереди':'Queue position'}: #${s.queue_position}` : '';
  if(kind==='started') body += `\n${lang==='ru'?'Перевод уже отображается в вашем прогрессе.':'Translation is now visible in your progress.'}`;
  if(kind==='completed') body += `\n${s.chapter_count} / ${s.chapter_count}`;
  if(kind==='progress'&&s.current_chapter!=null) body += `\n${s.current_chapter} / ${s.chapter_count}`;
  await sendUserNotification(env,telegram,s.user_id,lang,'notify_request_updates','request_status',title,body);
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
  const miniAppUrl = String((env as unknown as { MINI_APP_URL?: string }).MINI_APP_URL || 'https://t.me/dollartlbot');

  await createInAppNotification(
    env,
    recipient.user_id,
    'release',
    heading,
    job.title,
    MINI_APP_PATH,
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

function bool(v:unknown):number{return v===true||v===1||v==='1'?1:0;}
function shorten(v:string,max:number):string{return v.length<=max?v:`${v.slice(0,max-1)}…`;}
async function readJson<T>(r:Request):Promise<T>{try{return await r.json() as T;}catch{return{} as T;}}
