const DEFAULT_TTL_MS = 60_000;

type CacheEntry = { value: string; expiresAt: number };
const cache = new Map<string, CacheEntry>();

export async function getRuntimeSetting(
  env: Env,
  key: string,
  fallback = '',
  ttlMs = DEFAULT_TTL_MS,
): Promise<string> {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const row = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?')
    .bind(key)
    .first<{ value: string | null }>();
  const value = String(row?.value ?? fallback).trim();
  cache.set(key, { value, expiresAt: now + Math.max(1_000, ttlMs) });
  return value;
}

export async function getRuntimeSettings(
  env: Env,
  keys: readonly string[],
  ttlMs = DEFAULT_TTL_MS,
): Promise<Record<string, string>> {
  const now = Date.now();
  const result: Record<string, string> = {};
  const missing: string[] = [];

  for (const key of keys) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) result[key] = cached.value;
    else missing.push(key);
  }

  if (missing.length) {
    const placeholders = missing.map(() => '?').join(',');
    const rows = await env.DB.prepare(`SELECT key,value FROM app_settings WHERE key IN (${placeholders})`)
      .bind(...missing)
      .all<{ key: string; value: string | null }>();
    const found = new Map(rows.results.map((row) => [row.key, String(row.value ?? '').trim()]));
    for (const key of missing) {
      const value = found.get(key) ?? '';
      result[key] = value;
      cache.set(key, { value, expiresAt: now + Math.max(1_000, ttlMs) });
    }
  }

  return result;
}

export async function runtimeFlag(env: Env, key: string, fallback = false): Promise<boolean> {
  const value = (await getRuntimeSetting(env, key, fallback ? '1' : '0')).toLowerCase();
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
}

export function runtimeNumber(
  values: Record<string, string>,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(values[key]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
}

export function invalidateRuntimeSetting(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}
