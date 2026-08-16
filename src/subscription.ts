import type { SubscriptionState } from './domain';
import { errorText } from './db';
import { getRuntimeSetting } from './runtime-settings';
import { isActiveChatMember, type TelegramClient } from './telegram';

type CacheEntry = SubscriptionState & {
  checkedAt: number;
  expiresAt: number;
  staleUntil: number;
};

type CacheRow = {
  subscriber: number;
  verification_error: number;
  checked_at: string;
  expires_at: string;
  stale_until: string;
};

const memoryCache = new Map<number, CacheEntry>();

export async function getSubscriptionState(
  userId: number,
  env: Env,
  telegram: TelegramClient,
  options: { force?: boolean } = {},
): Promise<SubscriptionState> {
  if (!env.BOOSTY_GROUP_ID || env.BOOSTY_GROUP_ID === '0') {
    return { subscriber: false, verificationError: true };
  }

  const now = Date.now();
  if (!options.force) {
    const memory = memoryCache.get(userId);
    if (memory && memory.expiresAt > now) return state(memory.subscriber, memory.verificationError);

    const durable = await readDurableCache(env, userId);
    if (durable && Date.parse(durable.expires_at) > now) {
      const entry = fromRow(durable);
      memoryCache.set(userId, entry);
      return state(entry.subscriber, entry.verificationError);
    }
  }

  const durableBeforeCheck = await readDurableCache(env, userId);
  try {
    const member = await telegram.getChatMember(env.BOOSTY_GROUP_ID, userId);
    const result = state(isActiveChatMember(member), false);
    await cacheResult(userId, result, env, now);
    return result;
  } catch (error) {
    console.warn(JSON.stringify({ event: 'boosty_check_failed', user_id: userId, error: errorText(error) }));

    // Recent positive entitlement survives a temporary Telegram outage. A stale
    // negative result never becomes an accidental bypass.
    if (
      durableBeforeCheck?.subscriber === 1
      && Date.parse(durableBeforeCheck.stale_until) > now
    ) {
      const stale = state(true, true);
      const entry = fromRow(durableBeforeCheck);
      memoryCache.set(userId, { ...entry, verificationError: true, expiresAt: now + 15_000 });
      return stale;
    }

    const result = state(false, true);
    await cacheResult(userId, result, env, now).catch(() => undefined);
    return result;
  }
}

export function invalidateSubscriptionCache(userId?: number): void {
  if (userId === undefined) memoryCache.clear();
  else memoryCache.delete(userId);
}

async function cacheResult(userId: number, result: SubscriptionState, env: Env, now: number): Promise<void> {
  const positiveTtl = await secondsSetting(env, 'subscription_positive_ttl_seconds', 300, 30, 3600);
  const negativeTtl = await secondsSetting(env, 'subscription_negative_ttl_seconds', 45, 10, 600);
  const errorTtl = await secondsSetting(env, 'subscription_error_ttl_seconds', 15, 5, 120);
  const staleMinutes = await secondsSetting(env, 'subscription_stale_positive_minutes', 30, 1, 240);
  const ttlSeconds = result.subscriber ? positiveTtl : result.verificationError ? errorTtl : negativeTtl;
  const staleSeconds = result.subscriber ? staleMinutes * 60 : ttlSeconds;
  const entry: CacheEntry = {
    ...result,
    checkedAt: now,
    expiresAt: now + ttlSeconds * 1000,
    staleUntil: now + staleSeconds * 1000,
  };
  memoryCache.set(userId, entry);

  try {
    await env.DB.prepare(`
      INSERT INTO subscription_entitlement_cache(
        user_id,subscriber,verification_error,checked_at,expires_at,stale_until
      ) VALUES (?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET
        subscriber=excluded.subscriber,
        verification_error=excluded.verification_error,
        checked_at=excluded.checked_at,
        expires_at=excluded.expires_at,
        stale_until=excluded.stale_until
    `).bind(
      userId,
      result.subscriber ? 1 : 0,
      result.verificationError ? 1 : 0,
      new Date(now).toISOString(),
      new Date(entry.expiresAt).toISOString(),
      new Date(entry.staleUntil).toISOString(),
    ).run();
  } catch (error) {
    // Keep the bot functional during a migration/deploy race. Memory caching
    // still prevents a hot loop until D1 catches up.
    console.warn(JSON.stringify({ event: 'subscription_cache_write_failed', user_id: userId, error: errorText(error) }));
  }
}

async function readDurableCache(env: Env, userId: number): Promise<CacheRow | null> {
  try {
    return await env.DB.prepare(`
      SELECT subscriber,verification_error,checked_at,expires_at,stale_until
      FROM subscription_entitlement_cache WHERE user_id=?
    `).bind(userId).first<CacheRow>();
  } catch {
    return null;
  }
}

function fromRow(row: CacheRow): CacheEntry {
  return {
    subscriber: row.subscriber === 1,
    verificationError: row.verification_error === 1,
    checkedAt: Date.parse(row.checked_at),
    expiresAt: Date.parse(row.expires_at),
    staleUntil: Date.parse(row.stale_until),
  };
}

async function secondsSetting(env: Env, key: string, fallback: number, min: number, max: number): Promise<number> {
  const raw = Number(await getRuntimeSetting(env, key, String(fallback)));
  return Number.isFinite(raw) ? Math.max(min, Math.min(max, Math.round(raw))) : fallback;
}

function state(subscriber: boolean, verificationError: boolean): SubscriptionState {
  return { subscriber, verificationError };
}
