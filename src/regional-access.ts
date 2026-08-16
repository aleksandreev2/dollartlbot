import { isAdmin } from './db';
import { getRuntimeSetting, runtimeFlag } from './runtime-settings';
import { getSubscriptionState } from './subscription';
import type { InlineKeyboardMarkup, TelegramClient } from './telegram';

const DEFAULT_RESTRICTED = ['AM','AZ','BY','KZ','KG','MD','RU','TJ','TM','UZ'];
const DEFAULT_RUSSIAN_CHANNEL = 'https://t.me/domnekromanta';
const DEFAULT_COUNTRY_TTL_DAYS = 30;
const DEFAULT_CHALLENGE_TTL_MINUTES = 10;
const TOKEN_RE = /^[A-Za-z0-9_-]{24,80}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const INVALID_COUNTRY_CODES = new Set(['XX','T1']);
const REGION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const BOOSTY_POSITIVE_TTL_MS = 3 * 60 * 1000;
const BOOSTY_NEGATIVE_TTL_MS = 30 * 1000;
const BOOSTY_ERROR_TTL_MS = 15 * 1000;

export type RegionalAccessReason =
  | 'admin'
  | 'boosty'
  | 'disabled'
  | 'verified'
  | 'restricted'
  | 'verification_required';

export type RegionalAccessDecision = {
  allowed: boolean;
  reason: RegionalAccessReason;
  countryCode: string | null;
  russianChannelUrl: string;
  verifiedAt: string | null;
};

type UserRegionRow = {
  country_code: string | null;
  country_verified_at: string | null;
  language: string | null;
};

type ChallengeRow = {
  user_id: number;
  pending_action_json: string | null;
  expires_at: string;
};

type PendingAction = { type: 'download'; token: string } | { type: 'none' };

const regionObservationCache = new Map<number, number>();
const boostyCache = new Map<number, { subscriber: boolean; verificationError: boolean; expiresAt: number }>();

export async function checkRegionalDownloadAccess(
  userId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<RegionalAccessDecision> {
  const russianChannelUrl = normalizeTelegramUrl(
    await getRuntimeSetting(env, 'regional_russian_channel_url', DEFAULT_RUSSIAN_CHANNEL),
  ) || DEFAULT_RUSSIAN_CHANNEL;

  if (isAdmin(userId, env)) return decision(true, 'admin', null, null, russianChannelUrl);
  if (!(await runtimeFlag(env, 'regional_routing_enabled', true))) {
    return decision(true, 'disabled', null, null, russianChannelUrl);
  }

  const subscription = await cachedSubscription(userId, env, telegram);
  if (subscription.subscriber) return decision(true, 'boosty', null, null, russianChannelUrl);

  const row = await env.DB.prepare(`
    SELECT country_code,country_verified_at,language
    FROM users WHERE telegram_id=?
  `).bind(userId).first<UserRegionRow>();

  const country = normalizeCountry(row?.country_code);
  const verifiedAt = row?.country_verified_at || null;
  const ttlDays = boundedNumber(
    await getRuntimeSetting(env, 'regional_country_ttl_days', String(DEFAULT_COUNTRY_TTL_DAYS)),
    1,
    365,
    DEFAULT_COUNTRY_TTL_DAYS,
  );
  const fresh = Boolean(
    country
    && verifiedAt
    && Date.parse(verifiedAt) > Date.now() - ttlDays * 86_400_000,
  );

  if (!fresh) return decision(false, 'verification_required', country, verifiedAt, russianChannelUrl);

  const restricted = await restrictedCountries(env);
  if (country && restricted.has(country)) {
    return decision(false, 'restricted', country, verifiedAt, russianChannelUrl);
  }
  return decision(true, 'verified', country, verifiedAt, russianChannelUrl);
}

export async function captureRegionFromRequest(
  request: Request,
  userId: number,
  env: Env,
  source: 'miniapp' | 'web_challenge' = 'miniapp',
): Promise<string | null> {
  const country = requestCountry(request);
  if (!country) return null;

  const nowMs = Date.now();
  const cachedAt = regionObservationCache.get(userId) || 0;
  if (source === 'miniapp' && cachedAt > nowMs - REGION_CACHE_TTL_MS) return country;

  const now = new Date(nowMs).toISOString();
  const refreshCutoff = new Date(nowMs - REGION_CACHE_TTL_MS).toISOString();
  await env.DB.prepare(`
    UPDATE users SET
      country_code=?,
      country_verified_at=?,
      country_source=?
    WHERE telegram_id=? AND (
      country_code IS NULL OR country_code<>? OR country_verified_at IS NULL OR country_verified_at<?
    )
  `).bind(country, now, source, userId, country, refreshCutoff).run();
  regionObservationCache.set(userId, nowMs);
  return country;
}

export async function createRegionVerificationChallenge(
  env: Env,
  userId: number,
  pendingAction: PendingAction,
): Promise<string> {
  const token = randomToken();
  const tokenHash = await sha256Hex(token);
  const nowMs = Date.now();
  const ttlMinutes = boundedNumber(
    await getRuntimeSetting(env, 'regional_challenge_ttl_minutes', String(DEFAULT_CHALLENGE_TTL_MINUTES)),
    2,
    60,
    DEFAULT_CHALLENGE_TTL_MINUTES,
  );
  const now = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + ttlMinutes * 60_000).toISOString();

  await env.DB.batch([
    env.DB.prepare(`
      DELETE FROM region_verification_challenges
      WHERE user_id=? AND (used_at IS NOT NULL OR expires_at<?)
    `).bind(userId, now),
    env.DB.prepare(`
      INSERT INTO region_verification_challenges(
        token_hash,user_id,pending_action_json,created_at,expires_at,used_at,verified_country_code
      ) VALUES (?,?,?,?,?,NULL,NULL)
    `).bind(tokenHash, userId, JSON.stringify(pendingAction), now, expiresAt),
  ]);

  const origin = verificationOrigin(env);
  return `${origin}/verify/region/${encodeURIComponent(token)}`;
}

export async function handleRegionVerificationRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = /^\/verify\/region\/([A-Za-z0-9_-]{24,80})$/.exec(url.pathname);
  if (!match || request.method !== 'GET') return null;

  const token = match[1];
  if (!TOKEN_RE.test(token)) return verificationPage('Invalid verification link', 'This verification link is invalid.', 400);
  const country = requestCountry(request);
  if (!country) {
    return verificationPage(
      'Region check unavailable',
      'We could not verify your region from this connection. Disable a proxy or VPN if you use one, then open the verification link again.',
      503,
    );
  }

  const tokenHash = await sha256Hex(token);
  const now = new Date().toISOString();
  const challenge = await env.DB.prepare(`
    SELECT user_id,pending_action_json,expires_at
    FROM region_verification_challenges
    WHERE token_hash=? AND used_at IS NULL AND expires_at>?
    LIMIT 1
  `).bind(tokenHash, now).first<ChallengeRow>();
  if (!challenge) {
    return verificationPage('Verification link expired', 'Return to Dollar TL Bot and request a new verification link.', 410);
  }

  await captureRegionFromRequest(request, challenge.user_id, env, 'web_challenge');
  const used = await env.DB.prepare(`
    UPDATE region_verification_challenges
    SET used_at=?,verified_country_code=?
    WHERE token_hash=? AND used_at IS NULL AND expires_at>?
  `).bind(now, country, tokenHash, now).run();
  if ((used.meta.changes ?? 0) !== 1) {
    return verificationPage('Verification link expired', 'Return to Dollar TL Bot and request a new verification link.', 410);
  }

  const action = parsePendingAction(challenge.pending_action_json);
  if (action.type === 'download' && TOKEN_RE.test(action.token)) {
    const username = ((await getRuntimeSetting(env, 'bot_username', String((env as Env & { BOT_USERNAME?: string }).BOT_USERNAME || 'dollartlbot'))) || 'dollartlbot')
      .replace(/^@/, '');
    const location = `https://t.me/${encodeURIComponent(username)}?start=${encodeURIComponent(`dl_${action.token}`)}`;
    return new Response(null, {
      status: 302,
      headers: {
        location,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  }

  return verificationPage('Region verified', 'Your region has been verified. You can return to Dollar TL Bot.', 200);
}

export async function sendRegionVerificationPrompt(
  chatId: number,
  locale: string,
  verificationUrl: string,
  russianChannelUrl: string,
  telegram: TelegramClient,
): Promise<void> {
  const russian = locale.toLowerCase().startsWith('ru');
  const text = russian
    ? '<b>Нужно подтвердить регион</b>\n\nПеред получением первого файла требуется быстрая проверка доступности сервиса для вашего региона. Это один переход — после проверки вы автоматически вернётесь в Telegram.\n\nМы сохраняем только код страны, без IP-адреса.'
    : '<b>Region verification required</b>\n\nBefore the first file delivery, we need a quick availability check for your region. It takes one link open and then returns you to Telegram automatically.\n\nOnly the country code is stored; your IP address is not saved.';
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: russian ? 'Проверить доступ' : 'Verify access', url: verificationUrl }],
      [{ text: '🇷🇺 Русские переводы', url: russianChannelUrl }],
    ],
  };
  await telegram.sendMessage(chatId, text, { reply_markup: keyboard });
}

export async function sendRegionalRestriction(
  chatId: number,
  russianChannelUrl: string,
  telegram: TelegramClient,
): Promise<void> {
  const text = '<b>Русские переводы для вашего региона</b>\n\nДля пользователей из стран СНГ наши переводы на русском языке публикуются в отдельном Telegram-канале.\n\nПолучение файлов и скачивание глав через Dollar TL Bot для вашего региона ограничено, но вы по-прежнему можете предлагать новые произведения для перевода.\n\nПользователи с активной подпиской Boosty сохраняют полный доступ независимо от региона.';
  const keyboard: InlineKeyboardMarkup = {
    inline_keyboard: [
      [{ text: '🇷🇺 Русские переводы', url: russianChannelUrl }],
      [{ text: '➕ Предложить тайтл', callback_data: 'menu:submit' }],
    ],
  };
  await telegram.sendMessage(chatId, text, { reply_markup: keyboard });
}

export function requestCountry(request: Request): string | null {
  const cf = (request as Request & { cf?: { country?: string } }).cf;
  return normalizeCountry(cf?.country);
}

export async function regionalSummary(env: Env): Promise<Record<string, number>> {
  const restricted = [...await restrictedCountries(env)];
  const placeholders = restricted.map(() => '?').join(',');
  const query = restricted.length
    ? `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN country_code IS NOT NULL THEN 1 ELSE 0 END) AS verified,
         SUM(CASE WHEN country_code IS NULL THEN 1 ELSE 0 END) AS unknown,
         SUM(CASE WHEN country_code IN (${placeholders}) THEN 1 ELSE 0 END) AS restricted
       FROM users`
    : `SELECT COUNT(*) AS total,
              SUM(CASE WHEN country_code IS NOT NULL THEN 1 ELSE 0 END) AS verified,
              SUM(CASE WHEN country_code IS NULL THEN 1 ELSE 0 END) AS unknown,
              0 AS restricted
       FROM users`;
  const row = await env.DB.prepare(query).bind(...restricted).first<Record<string, number>>();
  return {
    total: Number(row?.total || 0),
    verified: Number(row?.verified || 0),
    unknown: Number(row?.unknown || 0),
    restricted: Number(row?.restricted || 0),
  };
}

async function restrictedCountries(env: Env): Promise<Set<string>> {
  const raw = await getRuntimeSetting(env, 'regional_restricted_countries', DEFAULT_RESTRICTED.join(','));
  const parsed = String(raw || '')
    .split(/[\s,;|]+/)
    .map(normalizeCountry)
    .filter((value): value is string => Boolean(value));
  return new Set(parsed.length ? parsed : DEFAULT_RESTRICTED);
}

async function cachedSubscription(userId: number, env: Env, telegram: TelegramClient) {
  const now = Date.now();
  const cached = boostyCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return { subscriber: cached.subscriber, verificationError: cached.verificationError };
  }
  const state = await getSubscriptionState(userId, env, telegram);
  const ttl = state.subscriber
    ? BOOSTY_POSITIVE_TTL_MS
    : state.verificationError
      ? BOOSTY_ERROR_TTL_MS
      : BOOSTY_NEGATIVE_TTL_MS;
  boostyCache.set(userId, { ...state, expiresAt: now + ttl });
  return state;
}

function decision(
  allowed: boolean,
  reason: RegionalAccessReason,
  countryCode: string | null,
  verifiedAt: string | null,
  russianChannelUrl: string,
): RegionalAccessDecision {
  return { allowed, reason, countryCode, verifiedAt, russianChannelUrl };
}

function normalizeCountry(value: unknown): string | null {
  const code = String(value || '').trim().toUpperCase();
  if (!COUNTRY_RE.test(code) || INVALID_COUNTRY_CODES.has(code)) return null;
  return code;
}

function normalizeTelegramUrl(value: string): string | null {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || !['t.me','telegram.me','telegram.dog'].includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function verificationOrigin(env: Env): string {
  const candidates = [
    String((env as Env & { MINI_APP_URL?: string }).MINI_APP_URL || ''),
    'https://dollartlbot.sashahumortele2.workers.dev/',
  ];
  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      if (url.protocol === 'https:') return url.origin;
    } catch {}
  }
  throw new Error('Regional verification origin is not configured');
}

function parsePendingAction(value: string | null): PendingAction {
  try {
    const parsed = JSON.parse(value || '{}') as Record<string, unknown>;
    if (parsed.type === 'download' && typeof parsed.token === 'string' && TOKEN_RE.test(parsed.token)) {
      return { type: 'download', token: parsed.token };
    }
  } catch {}
  return { type: 'none' };
}

function boundedNumber(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function verificationPage(title: string, message: string, status: number): Response {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${safeTitle}</title></head><body><main><h1>${safeTitle}</h1><p>${safeMessage}</p><p><a href="https://t.me/dollartlbot">Open Dollar TL Bot</a></p></main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] || char);
}
