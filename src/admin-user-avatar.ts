import { errorText } from './db';
import type { TelegramClient, TelegramPhotoSize } from './telegram';

type TelegramUserProfilePhotos = {
  total_count: number;
  photos: TelegramPhotoSize[][];
};

type TelegramFile = {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  file_path?: string;
};

const AVATAR_CACHE_SECONDS = 300;

export async function adminUserAvatarResponse(
  userId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<Response> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return emptyAvatar(400);

  const exists = await env.DB.prepare('SELECT telegram_id FROM users WHERE telegram_id=?')
    .bind(userId)
    .first<{ telegram_id: number }>();
  if (!exists) return emptyAvatar(404);

  try {
    const profile = await telegram.call<TelegramUserProfilePhotos>('getUserProfilePhotos', {
      user_id: userId,
      offset: 0,
      limit: 1,
    });
    const sizes = Array.isArray(profile.photos?.[0]) ? profile.photos[0] : [];
    if (!sizes.length) return emptyAvatar(204);

    const largest = sizes.reduce((best, candidate) => {
      const bestArea = Number(best.width || 0) * Number(best.height || 0);
      const candidateArea = Number(candidate.width || 0) * Number(candidate.height || 0);
      return candidateArea > bestArea ? candidate : best;
    });
    const file = await telegram.call<TelegramFile>('getFile', { file_id: largest.file_id });
    const filePath = safeTelegramFilePath(file.file_path);
    if (!filePath) return emptyAvatar(204);

    const upstream = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${filePath}`, {
      method: 'GET',
      redirect: 'error',
    });
    if (!upstream.ok || !upstream.body) return emptyAvatar(204);

    const upstreamType = String(upstream.headers.get('content-type') || '').toLowerCase();
    const contentType = upstreamType.startsWith('image/') ? upstreamType : 'image/jpeg';
    return new Response(upstream.body, {
      status: 200,
      headers: avatarHeaders(contentType),
    });
  } catch (error) {
    console.warn('[admin-avatar] Telegram avatar unavailable', {
      user_id: userId,
      error: errorText(error).replace(/https:\/\/api\.telegram\.org\/file\/bot[^/]+\//gi, '[telegram-file]/').slice(0, 240),
    });
    return emptyAvatar(204);
  }
}

function safeTelegramFilePath(value: unknown): string | null {
  const raw = String(value || '').replace(/^\/+/, '');
  if (!raw || raw.includes('..') || !/^[A-Za-z0-9_./-]+$/.test(raw)) return null;
  return raw.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function avatarHeaders(contentType?: string): Headers {
  const headers = new Headers({
    'cache-control': `private, max-age=${AVATAR_CACHE_SECONDS}`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  });
  if (contentType) headers.set('content-type', contentType);
  return headers;
}

function emptyAvatar(status: number): Response {
  return new Response(null, { status, headers: avatarHeaders() });
}