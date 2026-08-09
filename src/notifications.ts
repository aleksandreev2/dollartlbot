import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { normalizeLocale } from './i18n/index';
import { escapeHtml, type TelegramClient } from './telegram';

const BROADCAST_BATCH = 25;
const MINI_APP_PATH = '/app/';

type PreferenceKey = 'notify_request_updates' | 'notify_releases' | 'notify_announcements' | 'notify_referrals';

const OPEN_LABEL: Record<string, string> = {
  en:'Open Dollar TL', es:'Abrir Dollar TL', fil:'Buksan ang Dollar TL', hi:'Dollar TL खोलें',
  pt:'Abrir Dollar TL', id:'Buka Dollar TL', vi:'Mở Dollar TL', fr:'Ouvrir Dollar TL', de:'Dollar TL öffnen', ru:'Открыть Dollar TL',
};
const RELEASE_TITLE: Record<string, string> = {
  en:'New translation release', es:'Nueva publicación de traducción', fil:'Bagong salin', hi:'नया अनुवाद जारी',
  pt:'Nova tradução publicada', id:'Rilis terjemahan baru', vi:'Bản dịch mới', fr:'Nouvelle traduction', de:'Neue Übersetzung', ru:'Новый перевод',
};

export async function handleNotificationApiRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/notifications')) return null;
  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  if (request.method === 'GET' && url.pathname === '/api/app/notifications') {
    const prefs = await env.DB.prepare(`
      SELECT notify_request_updates, notify_releases, notify_announcements, notify_referrals
      FROM users WHERE telegram_id = ?
    `).bind(auth.telegramUser.id).first<Record<PreferenceKey, number>>();
    const rows = await env.DB.prepare(`
      SELECT id, type, title, body, action_url, created_at, read_at
      FROM user_notifications WHERE user_id = ? ORDER BY id DESC LIMIT 40
    `).bind(auth.telegramUser.id).all<Record<string, unknown>>();
    const unread = rows.results.reduce((n, row) => n + (row.read_at ? 0 : 1), 0);
    return miniAppJson({
      preferences: {
        request_updates: Number(prefs?.notify_request_updates ?? 1) === 1,
        releases: Number(prefs?.notify_releases ?? 1) === 1,
        announcements: Number(prefs?.notify_announcements ?? 1) === 1,
        referrals: Number(prefs?.notify_referrals ?? 1) === 1,
      },
      unread,
      notifications: rows.results,
    });
  }

  if (request.method === 'POST' && url.pathname === '/api/app/notifications/preferences') {
    const body = await readJson<Record<string, unknown>>(request);
    const values = {
      notify_request_updates: bool(body.request_updates),
      notify_releases: bool(body.releases),
      notify_announcements: bool(body.announcements),
      notify_referrals: bool(body.referrals),
    };
    await env.DB.prepare(`
      UPDATE users SET notify_request_updates = ?, notify_releases = ?, notify_announcements = ?, notify_referrals = ?, updated_at = ?
      WHERE telegram_id = ?
    `).bind(
      values.notify_request_updates, values.notify_releases, values.notify_announcements, values.notify_referrals,
      new Date().toISOString(), auth.telegramUser.id,
    ).run();
    return miniAppJson({ ok:true });
  }

  if (request.method === 'POST' && url.pathname === '/api/app/notifications/read') {
    const body = await readJson<{ id?: number }>(request);
    const now = new Date().toISOString();
    if (Number.isSafeInteger(Number(body.id)) && Number(body.id) > 0) {
      await env.DB.prepare('UPDATE user_notifications SET read_at = COALESCE(read_at, ?) WHERE id = ? AND user_id = ?')
        .bind(now, Number(body.id), auth.telegramUser.id).run();
    } else {
      await env.DB.prepare('UPDATE user_notifications SET read_at = COALESCE(read_at, ?) WHERE user_id = ?')
        .bind(now, auth.telegramUser.id).run();
    }
    return miniAppJson({ ok:true });
  }

  return miniAppJsonError('not_found', 'Notification route not found.', 404);
}

export async function createInAppNotification(
  env: Env,
  userId: number,
  type: string,
  title: string,
  body: string,
  actionUrl: string | null = MINI_APP_PATH,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO user_notifications (user_id, type, title, body, action_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(userId, type, title, body, actionUrl, new Date().toISOString()).run();
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
): Promise<void> {
  await createInAppNotification(env, userId, type, title, body);
  const row = await env.DB.prepare(`SELECT ${preference} AS enabled FROM users WHERE telegram_id = ?`)
    .bind(userId).first<{ enabled: number }>();
  if (Number(row?.enabled ?? 1) !== 1) return;
  const lang = normalizeLocale(locale);
  const miniAppUrl = String((env as unknown as { MINI_APP_URL?: string }).MINI_APP_URL || 'https://t.me/dollartlbot');
  await telegram.sendMessage(userId, `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`, {
    reply_markup: { inline_keyboard: [[{ text: OPEN_LABEL[lang] || OPEN_LABEL.en, web_app: { url: miniAppUrl } }]] },
  }).catch(() => undefined);
}

export async function queueReleaseBroadcast(
  env: Env,
  publicationId: number,
  title: string,
  body: string,
): Promise<number> {
  const now = new Date().toISOString();
  const result = await env.DB.prepare(`
    INSERT INTO broadcasts (publication_id, kind, status, title, body, created_at)
    VALUES (?, 'release', 'queued', ?, ?, ?)
  `).bind(publicationId, title, body, now).run();
  return Number(result.meta.last_row_id);
}

export async function runBroadcastMaintenance(env: Env, telegram: TelegramClient, maxBatches = 1): Promise<void> {
  for (let i = 0; i < maxBatches; i += 1) {
    const job = await env.DB.prepare(`
      SELECT id, status, title, body, cursor_user_id, sent_count, failed_count
      FROM broadcasts WHERE status IN ('queued','running') ORDER BY id ASC LIMIT 1
    `).first<{ id:number; status:string; title:string; body:string; cursor_user_id:number; sent_count:number; failed_count:number }>();
    if (!job) return;
    const now = new Date().toISOString();
    if (job.status === 'queued') {
      await env.DB.prepare("UPDATE broadcasts SET status='running', started_at=COALESCE(started_at, ?) WHERE id=?")
        .bind(now, job.id).run();
    }
    const users = await env.DB.prepare(`
      SELECT telegram_id, language FROM users
      WHERE telegram_id > ? AND notify_releases = 1
      ORDER BY telegram_id ASC LIMIT ?
    `).bind(job.cursor_user_id, BROADCAST_BATCH).all<{ telegram_id:number; language:string }>();
    if (!users.results.length) {
      await env.DB.prepare("UPDATE broadcasts SET status='completed', completed_at=? WHERE id=?").bind(now, job.id).run();
      continue;
    }

    let sent = 0;
    let failed = 0;
    await Promise.all(users.results.map(async (user) => {
      const lang = normalizeLocale(user.language);
      const heading = RELEASE_TITLE[lang] || RELEASE_TITLE.en;
      await createInAppNotification(env, user.telegram_id, 'release', heading, job.title, MINI_APP_PATH).catch(() => undefined);
      try {
        const miniAppUrl = String((env as unknown as { MINI_APP_URL?: string }).MINI_APP_URL || 'https://t.me/dollartlbot');
        await telegram.sendMessage(user.telegram_id,
          `<b>📚 ${escapeHtml(heading)}</b>\n\n<b>${escapeHtml(job.title)}</b>\n${escapeHtml(shorten(job.body, 500))}`,
          { reply_markup:{ inline_keyboard:[[ { text: OPEN_LABEL[lang] || OPEN_LABEL.en, web_app:{ url: miniAppUrl } } ]] } },
        );
        sent += 1;
      } catch {
        failed += 1;
      }
    }));
    const cursor = users.results.at(-1)?.telegram_id ?? job.cursor_user_id;
    await env.DB.prepare(`
      UPDATE broadcasts SET cursor_user_id=?, sent_count=sent_count+?, failed_count=failed_count+? WHERE id=?
    `).bind(cursor, sent, failed, job.id).run();
    if (users.results.length < BROADCAST_BATCH) {
      await env.DB.prepare("UPDATE broadcasts SET status='completed', completed_at=? WHERE id=?").bind(new Date().toISOString(), job.id).run();
    }
  }
}

function bool(value: unknown): number { return value === true || value === 1 || value === '1' ? 1 : 0; }
function shorten(value: string, max: number): string { return value.length <= max ? value : `${value.slice(0, max - 1)}…`; }
async function readJson<T>(request: Request): Promise<T> { try { return await request.json() as T; } catch { return {} as T; } }
