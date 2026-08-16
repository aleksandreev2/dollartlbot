import baseWorker from './index';
import { guardTelegramUpdate } from './anti-abuse';
import { handleAccessChatMemberUpdate } from './access-gate';
import { runAdminEventMaintenance } from './admin-events';
import { handleAdminReaderSecurityRequest } from './admin-reader-security';
import { capturePublicationAssetSecurity, handleAssetScannerRequest } from './asset-security';
import { handleCoverVariantRequest } from './cover-variants';
import { errorText, safeSecretEqual } from './db';
import { handleDownloadGateUpdate } from './download-gate';
import { recordPublicationRateLimit } from './download-rate-limit';
import { handleUpdate } from './handlers';
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
      const scannerResponse = await handleAssetScannerRequest(request, env);
      if (scannerResponse) return scannerResponse;
      const coverVariant = await handleCoverVariantRequest(request, env);
      if (coverVariant) return coverVariant;
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
          // Free download requires a fresh verified country; CIS users are routed to Russian translations.
        } else if (await handleDownloadGateUpdate(update, env, telegram, ctx)) {
          // Tracked Thank you / Donate / private download deep-link handled here.
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
    return baseWorker.scheduled(controller, env);
  },
} satisfies ExportedHandler<Env>;
