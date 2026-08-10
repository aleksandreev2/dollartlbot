import { authenticateMiniAppRequest, miniAppJson } from './miniapp-auth';

/**
 * Lightweight authenticated access heartbeat used by the Mini App access gate.
 * All authorization, initData validation and channel membership checks are
 * canonicalized in authenticateMiniAppRequest().
 */
export async function handleBaseMiniAppAccess(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/app/access') return null;
  if (request.method === 'OPTIONS') return null;
  if (request.method !== 'GET') return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  return miniAppJson({ ok: true, checked_at: new Date().toISOString() });
}
