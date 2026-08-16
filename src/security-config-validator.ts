import { authenticateMiniAppRequest, miniAppJsonError } from './miniapp-auth';
import { runtimeFlag } from './runtime-settings';

const SECURITY_CONFIG_PATH = '/api/app/admin/security/config';
const MAX_CONFIG_BYTES = 64 * 1024;

export async function guardSecurityConfiguration(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== SECURITY_CONFIG_PATH) return null;

  const length = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(length) && length > MAX_CONFIG_BYTES) {
    return miniAppJsonError('config_too_large', 'Security configuration payload is too large.', 413);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.clone().json<Record<string, unknown>>();
  } catch {
    return null;
  }

  // The effective runtime already implies private delivery while regional
  // routing is on. Rejecting the contradictory persisted state prevents admin
  // confusion and keeps health dashboards/config exports truthful.
  if ('download_gate_enabled' in body && !truthy(body.download_gate_enabled)) {
    const regionalEnabled = await runtimeFlag(env, 'regional_routing_enabled', true);
    if (regionalEnabled) {
      const auth = await authenticateMiniAppRequest(request, env);
      if (auth instanceof Response) return auth;
      if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);
      return miniAppJsonError(
        'regional_requires_private_delivery',
        'Download gate cannot be disabled while Regional routing is enabled. Disable Regional routing first.',
        409,
      );
    }
  }

  return null;
}

function truthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return ['1','true','yes','on'].includes(String(value ?? '').trim().toLowerCase());
}
