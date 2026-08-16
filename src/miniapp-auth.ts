import {
  accessErrorCode,
  accessErrorDetails,
  accessErrorMessage,
} from './access-gate';
import { evaluateAccessPolicy } from './access-policy';
import { getUser, isAdmin, upsertUser } from './db';
import { normalizeLocale, t } from './i18n/index';
import { evaluateMiniAppRegionalAccess } from './miniapp-regional-gate';
import { captureRegionFromRequest, requestCountry } from './regional-access';
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
  const observedCountry = requestCountry(request);
  await captureRegionFromRequest(request, telegramUser.id, env, 'miniapp').catch((error) => {
    console.warn(JSON.stringify({ event: 'miniapp_region_capture_failed', user_id: telegramUser.id, error: String(error) }));
  });
  if (observedCountry) {
    const observedAt = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE users
      SET country_code=?,country_verified_at=?,country_source='miniapp'
      WHERE telegram_id=? AND COALESCE(country_code,'')<>?
    `).bind(observedCountry, observedAt, telegramUser.id, observedCountry).run();
  }

  const dbUser = await getUser(env, telegramUser.id);
  const locale = normalizeLocale(dbUser?.language || telegramUser.language_code);
  const admin = isAdmin(telegramUser.id, env);
  const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);
  const policy = await evaluateAccessPolicy(telegramUser.id, env, telegram, {
    forceMembership: request.headers.get('x-access-recheck') === '1',
    activationSource: 'miniapp',
  });

  if (!policy.capabilities.miniapp) {
    if (policy.reason === 'regional_restricted' || policy.reason === 'regional_verification_required') {
      const regionalGate = await evaluateMiniAppRegionalAccess(telegramUser.id, locale, env, telegram);
      if (regionalGate) {
        return miniAppJsonError(regionalGate.code, regionalGate.message, 403, regionalGate.details);
      }
    }

    if (policy.reason === 'membership_required' || policy.reason === 'access_check_unavailable') {
      const access = policy.access;
      if (access) {
        return miniAppJsonError(
          accessErrorCode(access),
          accessErrorMessage(locale, access),
          access.reason === 'check_unavailable' ? 503 : 403,
          accessErrorDetails(locale, access),
        );
      }
    }

    const leaveBan = policy.reason === 'channel_leave_banned';
    return miniAppJsonError(
      'access_restricted',
      leaveBan
        ? (locale === 'ru'
          ? 'Доступ к Dollar TL ограничен после добровольного выхода из обязательного канала.'
          : 'Dollar TL access is restricted after voluntarily leaving the required channel.')
        : t(locale, 'accessRestrictedText'),
      403,
      {
        title: leaveBan && locale === 'ru' ? 'Доступ ограничен' : t(locale, 'accessRestrictedTitle'),
        retry_label: t(locale, 'accessRetryButton'),
        policy_reason: policy.reason,
      },
    );
  }

  return { telegramUser, dbUser, locale, admin };
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
