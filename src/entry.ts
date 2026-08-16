import baseWorker from './index';
import { guardTelegramUpdate } from './anti-abuse';
import { handleAccessChatMemberUpdate } from './access-gate';
import { handleAdminChannelAutoBanRequest } from './admin-channel-autoban';
import { handleAdminCoreReliabilityRequest } from './admin-core-reliability';
import { runAdminEventMaintenance } from './admin-events';
import { handleAdminFileSecurityRequest } from './admin-file-security';
import { handleAdminReaderSecurityRequest } from './admin-reader-security';
import { handleAdminRegionalAccessRequest } from './admin-regional-access';
import { handleAssetScannerStatusRequest } from './asset-scanner-status';
import { guardAssetScanEnforcementConfig } from './asset-security-config-guard';
import { capturePublicationAssetSecurity, handleAssetScannerRequest } from './asset-security';
import { handleBotSubmitDeepLink } from './bot-submit-deeplink';
import { handleChannelLeaveAutoBan, runChannelLeaveAutoBanMaintenance } from './channel-leave-autoban';
import { handleCoverVariantRequest } from './cover-variants';
import { errorText, safeSecretEqual } from './db';
import { handleDownloadGateUpdate } from './download-gate';
import { recordPublicationRateLimit } from './download-rate-limit';
import { handleFileDownloadPreflight } from './file-download-preflight';
import { handleUpdate } from './handlers';
import { runProductionSecurityAlerts } from './production-alerts';
import { handleLinkedPublicationDiscussion } from './publishing-discussion';
import { handleRegionVerificationRequest } from './regional-access';
import { handleRegionalDownloadPreflight } from './regional-download-preflight';
import { handleReferralChatMemberUpdate } from './referrals';
import { TelegramClient, type TelegramUpdate } from './telegram';
import { denyBlockedPrivateBotUpdate } from './user-controls';

export { UserGuard } from './anti-abuse';

const MAX_UPDATE_BYTES = 1_000_000;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/webhook') {
      const regionVerification = await handleRegionVerificationRequest(request, env);
      if (regionVerification) return regionVerification;
      const scannerStatus = await handleAssetScannerStatusRequest(request, env);
      if (scannerStatus) return scannerStatus;
      const scannerResponse = await handleAssetScannerRequest(request, env);
      if (scannerResponse) return scannerResponse;
      const coverVariant = await handleCoverVariantRequest(request, env);
      if (coverVariant) return coverVariant;
      const regionalAdmin = await handleAdminRegionalAccessRequest(request, env);
      if (regionalAdmin) return regionalAdmin;
      const reliabilityAdmin = await handleAdminCoreReliabilityRequest(request, env);
      if (reliabilityAdmin) return reliabilityAdmin;
      const fileSecurityAdmin = await handleAdminFileSecurityRequest(request, env);
      if (fileSecurityAdmin) return fileSecurityAdmin;
      if (url.pathname === '/api/app/admin/security/channel-autobans') {
        const channelAutoBanAdmin = await handleAdminChannelAutoBanRequest(
          request,
          env,
          new TelegramClient(env.TELEGRAM_BOT_TOKEN, env),
        );
        if (channelAutoBanAdmin) return channelAutoBanAdmin;
      }
      const enforcementGuard = await guardAssetScanEnforcementConfig(request, env);
      if (enforcementGuard) return enforcementGuard;
      const readerSecurity = await handleAdminReaderSecurityRequest(request, env);
      if (readerSecurity) return readerSecurity;

      const captureAssetSecurity = request.method === 'POST' && url.pathname === '/api/app/admin/publications';
      const response = await baseWorker.fetch(request, env, ctx);
      if (captureAssetSecurity) {
        await capturePublicationAssetSecurity(response, env, ctx).catch((error) => {
          console.warn(JSON.stringify({ event: 'asset_security_intake_failed', error: errorText(error) }));
        });
      }
      return response;
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
      ).bind(update.update_id, new Date().toISOString()).run();
      if ((inserted.meta.changes ?? 0) === 0) return new Response('OK');

      if (update.chat_member) {
        await Promise.all([
          handleReferralChatMemberUpdate(update.chat_member, env),
          handleAccessChatMemberUpdate(update.chat_member, env),
        ]);
        await handleChannelLeaveAutoBan(update.chat_member, env, telegram, ctx);
      } else {
        const abuse = await guardTelegramUpdate(update, env, ctx);
        if (!abuse.allowed) {
          recordPublicationRateLimit(update, env, ctx);
          if (update.callback_query) {
            await telegram.answerCallbackQuery(
              update.callback_query.id,
              abuse.notify ? 'Too many actions. Try again shortly.' : undefined,
            ).catch(() => undefined);
          } else if (abuse.notify && abuse.user) {
            await telegram.sendMessage(
              abuse.user.id,
              '<b>Too many actions.</b>\n\nPlease try again shortly.',
            ).catch(() => undefined);
          }
        } else if (await denyBlockedPrivateBotUpdate(update, env, telegram)) {
          // Admin-blocked private accounts stop here.
        } else if (update.message && await handleLinkedPublicationDiscussion(update.message, env, telegram, ctx)) {
          // Automatic linked-discussion forward handled by publishing center.
        } else if (await handleRegionalDownloadPreflight(update, env, telegram)) {
          // Canonical access policy denied regional download or required verification.
        } else if (await handleFileDownloadPreflight(update, env, telegram)) {
          // Quarantine is absolute; optional enforcement requires final CLEAN verdicts for unfinished files.
        } else if (await handleDownloadGateUpdate(update, env, telegram, ctx)) {
          // Tracked Thank you / Donate / private download deep-link handled here.
        } else if (await handleBotSubmitDeepLink(update, env, telegram)) {
          // Region-restricted users may still suggest titles through the ordinary Telegram bot.
        } else {
          await handleUpdate(update, env, telegram, ctx);
        }
      }

      ctx.waitUntil(runAdminEventMaintenance(env, telegram, 4));
      return new Response('OK');
    } catch (error) {
      ctx.waitUntil(
        env.DB.prepare('DELETE FROM processed_updates WHERE update_id = ?')
          .bind(update.update_id)
          .run()
          .catch(() => undefined),
      );
      console.error(JSON.stringify({
        event: 'update_failed',
        update_id: update.update_id,
        error: errorText(error),
      }));
      return new Response('Temporary error', { status: 500 });
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    const telegram = new TelegramClient(env.TELEGRAM_BOT_TOKEN, env);
    await Promise.all([
      baseWorker.scheduled(controller, env),
      runChannelLeaveAutoBanMaintenance(env, telegram, 20).catch((error) => {
        console.error(JSON.stringify({
          event: 'channel_leave_autoban_maintenance_failed',
          error: errorText(error),
        }));
      }),
      runProductionSecurityAlerts(env, telegram).catch((error) => {
        console.error(JSON.stringify({
          event: 'production_security_alerts_failed',
          error: errorText(error),
        }));
      }),
    ]);
  },
} satisfies ExportedHandler<Env>;
