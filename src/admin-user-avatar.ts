import { errorText } from './db';
import type { TelegramClient, TelegramPhotoSize } from './telegram';

type TelegramUserProfilePhotos = {
  total_count: number;
  photos: TelegramPhotoSize[][];
};

type TelegramChatPhoto = {
  small_file_id: string;
  small_file_unique_id: string;
  big_file_id: string;
  big_file_unique_id: string;
};

type TelegramChatFullInfo = {
  id: number;
  type: string;
  photo?: TelegramChatPhoto;
};

type TelegramFile = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
};

type StoredPhotoRow = {
  telegram_photo_url: string | null;
};

const AVATAR_CACHE_SECONDS = 300;
const MAX_STORED_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_STORED_PHOTO_REDIRECTS = 2;

export async function adminUserAvatarResponse(
  userId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<Response> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return emptyAvatar(400, 'invalid_user');

  const exists = await env.DB.prepare('SELECT telegram_id FROM users WHERE telegram_id=?')
    .bind(userId)
    .first<{ telegram_id: number }>();
  if (!exists) return emptyAvatar(404, 'unknown_user');

  const storedPhotoUrl = await storedTelegramPhotoUrl(userId, env);
  if (storedPhotoUrl) {
    try {
      const stored = await fetchStoredTelegramPhoto(storedPhotoUrl);
      if (stored) return imageResponse(stored, 'miniapp');
    } catch (error) {
      console.warn('[admin-avatar] Signed Mini App photo unavailable; falling back to Bot API', {
        user_id: userId,
        error: safeAvatarError(error),
      });
    }
  }

  try {
    const fileId = await currentAvatarFileId(userId, telegram);
    if (!fileId) return emptyAvatar(204, 'not_available');

    const file = await telegram.call<TelegramFile>('getFile', { file_id: fileId });
    const filePath = safeTelegramFilePath(file.file_path);
    if (!filePath) return avatarError('invalid_file_path');

    const upstream = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`, {
      method: 'GET',
      redirect: 'error',
    });
    if (!upstream.ok || !upstream.body) return avatarError(`telegram_file_${upstream.status}`);

    const upstreamType = String(upstream.headers.get('content-type') || '').toLowerCase();
    const contentType = upstreamType.startsWith('image/') ? upstreamType : 'image/jpeg';
    return new Response(upstream.body, {
      status: 200,
      headers: avatarHeaders(contentType, 'bot_api', 'ok'),
    });
  } catch (error) {
    console.warn('[admin-avatar] Telegram avatar lookup failed', {
      user_id: userId,
      error: safeAvatarError(error),
    });
    return avatarError('telegram_lookup_failed');
  }
}

async function storedTelegramPhotoUrl(userId: number, env: Env): Promise<string | null> {
  try {
    const row = await env.DB.prepare('SELECT telegram_photo_url FROM users WHERE telegram_id=?')
      .bind(userId)
      .first<StoredPhotoRow>();
    return safeStoredPhotoUrl(row?.telegram_photo_url);
  } catch (error) {
    const text = errorText(error).toLowerCase();
    if (text.includes('telegram_photo_url') && (text.includes('no such column') || text.includes('has no column named'))) {
      return null;
    }
    throw error;
  }
}

function safeStoredPhotoUrl(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchStoredTelegramPhoto(url: string, redirects = 0): Promise<Response | null> {
  const safeUrl = safeStoredPhotoUrl(url);
  if (!safeUrl) return null;

  const response = await fetch(safeUrl, {
    method: 'GET',
    redirect: 'manual',
    headers: { accept: 'image/avif,image/webp,image/svg+xml,image/jpeg,image/png,image/*;q=0.8' },
  });

  if (response.status >= 300 && response.status < 400) {
    if (redirects >= MAX_STORED_PHOTO_REDIRECTS) return null;
    const location = response.headers.get('location');
    if (!location) return null;
    const next = safeStoredPhotoUrl(new URL(location, safeUrl).toString());
    return next ? fetchStoredTelegramPhoto(next, redirects + 1) : null;
  }

  if (!response.ok || !response.body) return null;
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('image/')) return null;
  const size = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(size) && size > MAX_STORED_PHOTO_BYTES) return null;
  return response;
}

function imageResponse(upstream: Response, source: 'miniapp'): Response {
  const type = String(upstream.headers.get('content-type') || 'image/jpeg').toLowerCase();
  return new Response(upstream.body, {
    status: 200,
    headers: avatarHeaders(type.startsWith('image/') ? type : 'image/jpeg', source, 'ok'),
  });
}

async function currentAvatarFileId(userId: number, telegram: TelegramClient): Promise<string | null> {
  // getChat exposes the current chat photo for a private chat. Prefer it when a
  // signed Mini App photo URL has not been observed for this user yet.
  try {
    const chat = await telegram.call<TelegramChatFullInfo>('getChat', { chat_id: userId });
    if (Number(chat.id) === userId && chat.type === 'private' && chat.photo?.big_file_id) {
      return chat.photo.big_file_id;
    }
  } catch {
    // Fall back to profile photos below. Some accounts/privacy combinations may
    // not expose ChatFullInfo.photo even though profile photo history is usable.
  }

  const profile = await telegram.call<TelegramUserProfilePhotos>('getUserProfilePhotos', {
    user_id: userId,
    offset: 0,
    limit: 1,
  });
  const sizes = Array.isArray(profile.photos?.[0]) ? profile.photos[0] : [];
  if (!sizes.length) return null;

  const largest = sizes.reduce((best, candidate) => {
    const bestArea = Number(best.width || 0) * Number(best.height || 0);
    const candidateArea = Number(candidate.width || 0) * Number(candidate.height || 0);
    return candidateArea > bestArea ? candidate : best;
  });
  return largest.file_id || null;
}

function safeTelegramFilePath(value: unknown): string | null {
  const raw = String(value || '').replace(/^\/+/, '');
  if (!raw || raw.includes('..') || !/^[A-Za-z0-9_./-]+$/.test(raw)) return null;
  return raw.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function avatarHeaders(contentType?: string, source?: string, status?: string): Headers {
  const headers = new Headers({
    'cache-control': `private, max-age=${AVATAR_CACHE_SECONDS}`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  if (contentType) headers.set('content-type', contentType);
  if (source) headers.set('x-dtl-avatar-source', source);
  if (status) headers.set('x-dtl-avatar-status', status);
  return headers;
}

function emptyAvatar(status: number, reason: string): Response {
  return new Response(null, { status, headers: avatarHeaders(undefined, undefined, reason) });
}

function avatarError(reason: string): Response {
  const headers = avatarHeaders(undefined, undefined, reason);
  headers.set('cache-control', 'no-store');
  return new Response(null, { status: 502, headers });
}

function safeAvatarError(error: unknown): string {
  return errorText(error)
    .replace(/https:\/\/api\.telegram\.org\/file\/bot[^/]+\//gi, '[telegram-file]/')
    .replace(/https:\/\/api\.telegram\.org\/bot[^/]+\//gi, '[telegram-api]/')
    .slice(0, 240);
}
