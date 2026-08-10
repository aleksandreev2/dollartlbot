import { handleAdminActionV2 } from './admin-actions-v2';
import { handleAdminAnalyticsRequest } from './admin-analytics';
import { handleAdminPublicationsRequest } from './admin-publications';
import { handleAdminUsersRequest } from './admin-users';
import { handleCoverHealthRequest } from './cover-health';
import { handleCoverRequest } from './covers';
import { errorText, safeSecretEqual } from './db';
import { runDailyEngagement } from './engagement';
import { handleUpdate } from './handlers';
import { handleHomeReleasesRequest } from './home-releases';
import { enhanceMiniAppResponse, handleEnhancedMiniAppRequest } from './miniapp-enhanced';
import { handleMiniAppRequest } from './miniapp';
import { handleNotificationApiRequest, runBroadcastMaintenance, runNotificationMaintenance } from './notifications';
import { handleOnboardingRequest } from './onboarding';
import { runPublicationDeliveryMaintenance, handlePublicationDeliveryAdminRequest } from './publication-delivery';
import { handlePublishingCommentsV3Request } from './publishing-comments-v3';
import { handleLinkedPublicationDiscussion } from './publishing-discussion';
import { handlePublishingRequest } from './publishing';
import { handlePublishingV2Request } from './publishing-v2';
import { guardPublishingRequest } from './publishing-guard';
import { normalizeQueuePositions } from './queue';
import { handleReferralApiRequest, handleReferralChatMemberUpdate, runReferralMaintenance } from './referrals';
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
    const coverHealthResponse = await handleCoverHealthRequest(request, env);
    if (coverHealthResponse) return coverHealthResponse;
    const coverResponse = await handleCoverRequest(request, env);
    if (coverResponse) return coverResponse;
    const releasesResponse = await handleHomeReleasesRequest(request, env);
    if (releasesResponse) return releasesResponse;

    const apiTelegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);
    const adminUsersResponse = await handleAdminUsersRequest(request, env, apiTelegram);
    if (adminUsersResponse) return adminUsersResponse;
    const adminAnalyticsResponse = await handleAdminAnalyticsRequest(request, env);
    if (adminAnalyticsResponse) return adminAnalyticsResponse;
    const adminPublicationsResponse = await handleAdminPublicationsRequest(request, env, apiTelegram);
    if (adminPublicationsResponse) return adminPublicationsResponse;
    const publicationDeliveryResponse = await handlePublicationDeliveryAdminRequest(request, env, apiTelegram);
    if (publicationDeliveryResponse) return publicationDeliveryResponse;
    const adminActionResponse = await handleAdminActionV2(request, env, apiTelegram);
    if (adminActionResponse) return adminActionResponse;

    const publishingCommentsV3Response = await handlePublishingCommentsV3Request(request, env, apiTelegram, ctx);
    if (publishingCommentsV3Response) return publishingCommentsV3Response;
    const publishingV2Response = await handlePublishingV2Request(request, env, apiTelegram, ctx);
    if (publishingV2Response) return publishingV2Response;
    const publishingGuardResponse = await guardPublishingRequest(request, env);
    if (publishingGuardResponse) return publishingGuardResponse;
    const publishingResponse = await handlePublishingRequest(request, env, apiTelegram, ctx);
    if (publishingResponse) return publishingResponse;
    const notificationResponse = await handleNotificationApiRequest(request, env);
    if (notificationResponse) return notificationResponse;
    const referralResponse = await handleReferralApiRequest(request, env, apiTelegram);
    if (referralResponse) return referralResponse;
    const miniAppResponse = await handleMiniAppRequest(request, env, ctx);
    if (miniAppResponse) return enhanceMiniAppResponse(request, miniAppResponse, env);

    if (request.method === 'GET' && url.pathname === '/') {
      return Response.json({ ok: true, service: 'dollartlbot', mini_app: `${url.origin}/app/` });
    }
    if (request.method !== 'POST' || url.pathname !== '/webhook') return new Response('Not found', { status: 404 });

    const suppliedSecret = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
    if (!(await safeSecretEqual(suppliedSecret, env.TELEGRAM_WEBHOOK_SECRET))) return new Response('Unauthorized', { status: 401 });
    const contentLength = Number(request.headers.get('content-length') ?? '0');
    if (Number.isFinite(contentLength) && contentLength > MAX_UPDATE_BYTES) return new Response('Payload too large', { status: 413 });

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
      ).bind(update.update_id, new Date().toISOString()).run();
      if ((inserted.meta.changes ?? 0) === 0) return new Response('OK');

      if (update.chat_member) {
        await handleReferralChatMemberUpdate(update.chat_member, env);
      } else if (update.message && await handleLinkedPublicationDiscussion(update.message, env, telegram, ctx)) {
        // handled by publishing center
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
      console.error(JSON.stringify({ event: 'update_failed', update_id: update.update_id, error: errorText(error) }));
      return new Response('Temporary error', { status: 500 });
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);
    const scheduledAt = new Date(controller.scheduledTime);

    await runScheduledTask('queue_normalize', () => normalizeQueuePositions(env));
    await runScheduledTask('admin_delivery_retry', () => retryPendingAdminDeliveries(env, telegram));
    await runScheduledTask('referral_maintenance', () => runReferralMaintenance(env, telegram, scheduledAt));
    await runScheduledTask('notification_maintenance', () => runNotificationMaintenance(env, telegram));
    await runScheduledTask('broadcast_maintenance', () => runBroadcastMaintenance(env, telegram, 2));
    await runScheduledTask('publication_delivery', () => runPublicationDeliveryMaintenance(env, telegram, 8));

    if (scheduledAt.getUTCHours() === 10 && scheduledAt.getUTCMinutes() === 0) {
      await runScheduledTask('daily_engagement', () => runDailyEngagement(env, telegram, scheduledAt));
    }

    const cutoff = new Date(controller.scheduledTime - PROCESSED_UPDATE_RETENTION_MS).toISOString();
    await runScheduledTask('processed_update_cleanup', async () => {
      await env.DB.prepare('DELETE FROM processed_updates WHERE created_at < ?').bind(cutoff).run();
    });
  },
} satisfies ExportedHandler<Env>;

async function runScheduledTask(name: string, task: () => Promise<unknown>): Promise<void> {
  const startedAt = Date.now();
  try {
    await task();
    const durationMs = Date.now() - startedAt;
    if (durationMs >= 1_000) {
      console.log(JSON.stringify({ event: 'scheduled_task_complete', task: name, duration_ms: durationMs }));
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: 'scheduled_task_failed',
      task: name,
      duration_ms: Date.now() - startedAt,
      error: errorText(error),
    }));
  }
}
