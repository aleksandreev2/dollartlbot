import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { regionalSummary } from './regional-access';
import { getRuntimeSetting, invalidateRuntimeSetting } from './runtime-settings';

const PATH = '/api/app/admin/security/regional';
const DEFAULT_COUNTRIES = 'AM,AZ,BY,KZ,KG,MD,RU,TJ,TM,UZ';
const DEFAULT_CHANNEL = 'https://t.me/domnekromanta';

export async function handleAdminRegionalAccessRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== PATH || !['GET','POST'].includes(request.method)) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (request.method === 'GET') return regionalConfig(env);

  let body: Record<string, unknown>;
  try {
    body = await request.json<Record<string, unknown>>();
  } catch {
    return miniAppJsonError('invalid_json', 'Request body must be JSON.', 400);
  }

  const updates = new Map<string, string>();
  if ('enabled' in body) {
    const enabled = truthy(body.enabled);
    updates.set('regional_routing_enabled', enabled ? '1' : '0');
    // Regional enforcement is impossible while release files are dumped
    // publicly. Enabling the policy therefore also enables private delivery.
    if (enabled) updates.set('download_gate_enabled', '1');
  }
  if ('restricted_countries' in body) {
    const countries = normalizeCountries(body.restricted_countries);
    if (!countries.length) return miniAppJsonError('invalid_countries', 'Add at least one ISO country code.', 400);
    updates.set('regional_restricted_countries', countries.join(','));
  }
  if ('russian_channel_url' in body) {
    const channel = normalizeTelegramUrl(body.russian_channel_url);
    if (!channel) return miniAppJsonError('invalid_channel', 'Use a valid https://t.me/... link.', 400);
    updates.set('regional_russian_channel_url', channel);
  }
  if ('country_ttl_days' in body) {
    const value = integer(body.country_ttl_days, 1, 365);
    if (value === null) return miniAppJsonError('invalid_country_ttl', 'Country TTL must be 1-365 days.', 400);
    updates.set('regional_country_ttl_days', String(value));
  }
  if ('challenge_ttl_minutes' in body) {
    const value = integer(body.challenge_ttl_minutes, 2, 60);
    if (value === null) return miniAppJsonError('invalid_challenge_ttl', 'Challenge TTL must be 2-60 minutes.', 400);
    updates.set('regional_challenge_ttl_minutes', String(value));
  }
  if (!updates.size) return miniAppJsonError('no_updates', 'No regional settings supplied.', 400);

  const now = new Date().toISOString();
  await env.DB.batch([...updates].map(([key, value]) => env.DB.prepare(`
    INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
  `).bind(key, value, now)));
  for (const key of updates.keys()) invalidateRuntimeSetting(key);
  return regionalConfig(env);
}

async function regionalConfig(env: Env): Promise<Response> {
  const [enabled, countries, channel, countryTtl, challengeTtl, downloadGate, summary] = await Promise.all([
    getRuntimeSetting(env, 'regional_routing_enabled', '1'),
    getRuntimeSetting(env, 'regional_restricted_countries', DEFAULT_COUNTRIES),
    getRuntimeSetting(env, 'regional_russian_channel_url', DEFAULT_CHANNEL),
    getRuntimeSetting(env, 'regional_country_ttl_days', '30'),
    getRuntimeSetting(env, 'regional_challenge_ttl_minutes', '10'),
    getRuntimeSetting(env, 'download_gate_enabled', '0'),
    regionalSummary(env),
  ]);
  const routingEnabled = enabled !== '0';
  return miniAppJson({
    config: {
      enabled: routingEnabled,
      restricted_countries: normalizeCountries(countries),
      russian_channel_url: channel || DEFAULT_CHANNEL,
      country_ttl_days: Number(countryTtl) || 30,
      challenge_ttl_minutes: Number(challengeTtl) || 10,
      private_download_required: routingEnabled,
      private_download_setting: downloadGate !== '0',
    },
    summary,
  });
}

function normalizeCountries(value: unknown): string[] {
  const input = Array.isArray(value) ? value.join(',') : String(value || '');
  return [...new Set(input
    .split(/[\s,;|]+/)
    .map((part) => part.trim().toUpperCase())
    .filter((part) => /^[A-Z]{2}$/.test(part) && part !== 'XX' && part !== 'T1'))]
    .slice(0, 80);
}

function normalizeTelegramUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' || !['t.me','telegram.me','telegram.dog'].includes(url.hostname.toLowerCase())) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || String(value).toLowerCase() === 'true' || String(value) === '1';
}

function integer(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
