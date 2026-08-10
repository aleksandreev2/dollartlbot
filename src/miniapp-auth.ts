import {
  accessErrorCode,
  accessErrorDetails,
  accessErrorMessage,
  checkBotAccess,
} from './access-gate';
import { getUser, isAdmin, upsertUser } from './db';
import { normalizeLocale } from './i18n/index';
import { TelegramClient, type TelegramUser } from './telegram';

const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export type MiniAppAuthContext = {
  telegramUser: TelegramUser;
  dbUser: Awaited<ReturnType<typeof getUser>>;
  locale: ReturnType<typeof normalizeLocale>;
  admin: boolean;
};

export async function authenticateMiniAppRequest(
  request: Request,
  env: Env,
): Promise<MiniAppAuthContext | Response> {
  const initData = getInitDataHeader(request);
  if (!initData) return miniAppJsonError('unauthorized', 'Open this app from Telegram.', 401);

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  const authDateRaw = params.get('auth_date');
  const userRaw = params.get('user');
  if (!hash || !authDateRaw || !userRaw) {
    return miniAppJsonError('unauthorized', 'Telegram authorization data is incomplete.', 401);
  }

  const authDate = Number(authDateRaw);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(authDate) || authDate > now + 300 || now - authDate > INIT_DATA_MAX_AGE_SECONDS) {
    return miniAppJsonError('auth_expired', 'Telegram authorization has expired. Reopen the Mini App.', 401);
  }

  const entries = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join('\n');

  const encoder = new TextEncoder();
  const webAppKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode('WebAppData'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const secret = await crypto.subtle.sign('HMAC', webAppKey, encoder.encode(env.TELEGRAM_BOT_TOKEN));
  const verificationKey = await crypto.subtle.importKey(
    'raw',
    secret,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );

  let signature: Uint8Array;
  try {
    signature = hexToBytes(hash);
  } catch {
    return miniAppJsonError('unauthorized', 'Telegram authorization signature is invalid.', 401);
  }

  const valid = await crypto.subtle.verify(
    'HMAC',
    verificationKey,
    signature,
    encoder.encode(dataCheckString),
  );
  if (!valid) return miniAppJsonError('unauthorized', 'Telegram authorization signature is invalid.', 401);

  let telegramUser: TelegramUser;
  try {
    telegramUser = JSON.parse(userRaw) as TelegramUser;
  } catch {
    return miniAppJsonError('unauthorized', 'Telegram user data is invalid.', 401);
  }
  if (!Number.isSafeInteger(telegramUser.id) || telegramUser.id <= 0) {
    return miniAppJsonError('unauthorized', 'Telegram user data is invalid.', 401);
  }

  await upsertUser(env, telegramUser);
  const dbUser = await getUser(env, telegramUser.id);
  const locale = normalizeLocale(dbUser?.language);
  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);
  const access = await checkBotAccess(telegramUser.id, env, telegram, {
    force: request.headers.get('x-access-recheck') === '1',
  });
  if (!access.allowed) {
    return miniAppJsonError(
      accessErrorCode(access),
      accessErrorMessage(locale, access),
      access.reason === 'check_unavailable' ? 503 : 403,
      accessErrorDetails(locale, access),
    );
  }

  return {
    telegramUser,
    dbUser,
    locale,
    admin: isAdmin(telegramUser.id, env),
  };
}

export function miniAppApiHeaders(): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
  };
}

export function miniAppJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...miniAppApiHeaders(),
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

export function miniAppJsonError(
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  return miniAppJson({ error: { code, message, ...(details ? { details } : {}) } }, status);
}

function getInitDataHeader(request: Request): string {
  const direct = request.headers.get('x-telegram-init-data');
  if (direct) return direct;
  const authorization = request.headers.get('authorization') ?? '';
  return authorization.toLowerCase().startsWith('tma ') ? authorization.slice(4) : '';
}

function hexToBytes(value: string): Uint8Array {
  if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error('invalid hex');
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < value.length; i += 2) out[i / 2] = Number.parseInt(value.slice(i, i + 2), 16);
  return out;
}
