import { getAccessGateDiagnostics, invalidateAccessConfigCache } from './access-gate';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import type { TelegramClient } from './telegram';

export async function handleAccessAdminRequest(
  request: Request,
  env: Env,
  telegram: TelegramClient,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/app/admin/access') return null;
  if (request.method !== 'GET' && request.method !== 'POST') {
    return miniAppJsonError('method_not_allowed', 'Method not allowed.', 405);
  }

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (request.method === 'POST') {
    let body: { channel_id?: string; join_url?: string } = {};
    try {
      body = (await request.json()) as { channel_id?: string; join_url?: string };
    } catch {
      return miniAppJsonError('bad_request', 'Invalid JSON body.', 400);
    }
    const channelId = cleanChannelId(body.channel_id ?? '');
    const joinUrl = cleanTelegramJoinUrl(body.join_url ?? '');
    if (body.channel_id && !channelId) {
      return miniAppJsonError('invalid_access_channel', 'Use @channelusername or a numeric Telegram chat ID.', 400);
    }
    if (body.join_url && !joinUrl) {
      return miniAppJsonError('invalid_access_url', 'Use a valid HTTPS t.me invite or channel URL.', 400);
    }

    const now = new Date().toISOString();
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO app_settings (key,value,updated_at) VALUES ('access_channel_id',?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
      `).bind(channelId, now),
      env.DB.prepare(`
        INSERT INTO app_settings (key,value,updated_at) VALUES ('access_channel_url',?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
      `).bind(joinUrl, now),
    ]);
    invalidateAccessConfigCache();
  }

  const settings = await readSettings(env);
  const diagnostics = await getAccessGateDiagnostics(env, telegram);
  return miniAppJson({ settings, diagnostics });
}

async function readSettings(env: Env) {
  const rows = await env.DB.prepare(`
    SELECT key,value FROM app_settings
    WHERE key IN ('access_channel_id','access_channel_url')
  `).all<{ key: string; value: string }>();
  const map = Object.fromEntries(rows.results.map((row) => [row.key, String(row.value || '')]));
  return {
    access_channel_id: map.access_channel_id || '',
    access_channel_url: map.access_channel_url || '',
  };
}

function cleanChannelId(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^-?\d+$/.test(raw)) return raw.slice(0, 32);
  const username = raw.replace(/^@/, '');
  return /^[A-Za-z0-9_]{5,}$/.test(username) ? `@${username.slice(0, 64)}` : '';
}

function cleanTelegramJoinUrl(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    if (!['t.me', 'telegram.me', 'telegram.dog'].includes(url.hostname.toLowerCase())) return '';
    return url.toString().slice(0, 500);
  } catch {
    return '';
  }
}
