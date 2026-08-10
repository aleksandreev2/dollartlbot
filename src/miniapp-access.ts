import { authenticateMiniAppRequest, miniAppJson } from './miniapp-auth';

/**
 * Covers the legacy Mini App router that still owns a private copy of initData
 * validation. Feature routers already call authenticateMiniAppRequest directly.
 * Keeping this thin middleware here makes access control authoritative today;
 * the remaining auth duplication can then be removed independently without a
 * security gap.
 */
export async function handleBaseMiniAppAccess(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/app/')) return null;
  if (request.method === 'OPTIONS') return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  if (request.method === 'GET' && url.pathname === '/api/app/access') {
    return miniAppJson({ ok: true, checked_at: new Date().toISOString() });
  }
  return null;
}
