import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';

export async function handleOnboardingRequest(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== '/api/app/onboarding') return null;
  if (request.method !== 'GET' && request.method !== 'POST') {
    return miniAppJsonError('method_not_allowed', 'Method not allowed.', 405);
  }

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;

  if (request.method === 'GET') {
    const user = auth.dbUser;
    return miniAppJson({
      required: !(user?.miniapp_onboarded_at && user?.adult_confirmed_at),
      adult_confirmed: Boolean(user?.adult_confirmed_at),
      completed: Boolean(user?.miniapp_onboarded_at),
      locale: auth.locale,
    });
  }

  let body: { adult_confirmed?: boolean } = {};
  try {
    body = (await request.json()) as { adult_confirmed?: boolean };
  } catch {
    return miniAppJsonError('bad_request', 'Invalid request.', 400);
  }
  if (body.adult_confirmed !== true) {
    return miniAppJsonError(
      'adult_confirmation_required',
      'You must confirm that you are of legal age in your country or jurisdiction.',
      400,
    );
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE users
    SET adult_confirmed_at = COALESCE(adult_confirmed_at, ?),
        miniapp_onboarded_at = ?,
        updated_at = ?
    WHERE telegram_id = ?
  `).bind(now, now, now, auth.telegramUser.id).run();

  return miniAppJson({ ok: true, completed: true, adult_confirmed: true, locale: auth.locale });
}
