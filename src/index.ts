import { handleCoverRequest } from './covers';
import { errorText, safeSecretEqual } from './db';
import { runDailyEngagement } from './engagement';
import { handleUpdate } from './handlers';
import { enhanceMiniAppResponse, handleEnhancedMiniAppRequest } from './miniapp-enhanced';
import { handleMiniAppRequest } from './miniapp';
import { handleNotificationApiRequest, runBroadcastMaintenance } from './notifications';
import { handleOnboardingRequest } from './onboarding';
import { handlePublicationDiscussionForward, handlePublishingRequest } from './publishing';
import {
  handleReferralApiRequest,
  handleReferralChatMemberUpdate,
  runReferralMaintenance,
} from './referrals';
import { retryPendingAdminDeliveries } from './submissions';
import { TelegramClient, type TelegramUpdate } from './telegram';

const MAX_UPDATE_BYTES = 1_000_000;
const PROCESSED_UPDATE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const onboardingResponse = await handleOnboardingRequest(request, env);
    if (onboardingResponse) return onboardingResponse;

    const enhancedMiniAppResponse = await handleEnhancedMiniAppRequest(request, env, ctx);
    if (enhancedMiniAppResponse) return enhancedMiniAppResponse;

    const coverResponse = await handleCoverRequest(request, env);
    if (coverResponse) return coverResponse;

    const apiTelegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);

    const publishingResponse = await handlePublishingRequest(request, env, apiTelegram, ctx);
    if (publishingResponse) return publishingResponse;

    const notificationResponse = await handleNotificationApiRequest(request, env);
    if (notificationResponse) return notificationResponse;

    const referralResponse = await handleReferralApiRequest(request, env, apiTelegram);
    if (referralResponse) return referralResponse;

    const miniAppResponse = await handleMiniAppRequest(request, env, ctx);
    if (miniAppResponse) return enhanceMiniAppResponse(request, miniAppResponse, env);

    if (request.method === 'GET' && url.pathname === '/') {
      return Response.json({
        ok: true,
        service: 'dollartlbot',
        mini_app: `${url.origin}/app/`,
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/webhook') {
      return new Response('Not found', { status: 404 });
    }

    const suppliedSecret = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
    if (!(await safeSecretEqual(suppliedSecret, env.TELEGRAM_WEBHOOK_SECRET))) {
      return new Response('Unauthorized', { status: 401 });
    }

    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_UPDATE_BYTES) {
      return new Response('Payload too large', { status: 413 });
    }

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch {
      return new Response('Bad request', { status: 400 });
    }

    const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);

    try {
      const inserted = await env.DB.prepare(
        'INSERT OR IGNORE INTO processed_updates (update_id, created_at) VALUES (?, ?)',
      )
        .bind(update.update_id, new Date().toISOString())
        .run();

      if ((inserted.meta.changes ?? 0) === 0) return new Response('OK');

      if (update.chat_member) {
        await handleReferralChatMemberUpdate(update.chat_member, env);
      } else if (update.message && await handlePublicationDiscussionForward(update.message, env, telegram, ctx)) {
        // Publication comment/file delivery is handled by the linked discussion-group forward.
      } else {
        await handleUpdate(update, env, telegram, ctx);
      }
      return new Response('OK');
    } catch (error) {
      ctx.waitUntil(
        env.DB.prepare('DELETE FROM processed_updates WHERE update_id = ?')
          .bind(update.update_id)
          .run()
          .catch(() => undefined),
      );
      console.error(
        JSON.stringify({ event: 'update_failed', update_id: update.update_id, error: errorText(error) }),
      );
      return new Response('Temporary error', { status: 500 });
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);
    await retryPendingAdminDeliveries(env, telegram);
    await runReferralMaintenance(env, telegram, new Date(controller.scheduledTime));
    await runBroadcastMaintenance(env, telegram, 2);

    const scheduledAt = new Date(controller.scheduledTime);
    if (scheduledAt.getUTCHours() === 10 && scheduledAt.getUTCMinutes() === 0) {
      await runDailyEngagement(env, telegram, scheduledAt);
    }

    const cutoff = new Date(controller.scheduledTime - PROCESSED_UPDATE_RETENTION_MS).toISOString();
    await env.DB.prepare('DELETE FROM processed_updates WHERE created_at < ?').bind(cutoff).run();
  },
} satisfies ExportedHandler<Env>;
