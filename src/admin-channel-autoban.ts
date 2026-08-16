import {
  getAccessChannelForAutoBan,
  getChannelLeaveAutoBanSummary,
  retryChannelLeaveAutoBan,
  unbanChannelLeaveUser,
} from './channel-leave-autoban';
import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { invalidateRuntimeSetting, runtimeFlag } from './runtime-settings';
import type { TelegramClient } from './telegram';

const PATH = '/api/app/admin/security/channel-autobans';

export async function handleAdminChannelAutoBanRequest(
  request: Request,
  env: Env,
  telegram: TelegramClient,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== PATH) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  if (request.method === 'GET') return readState(env, telegram);
  if (request.method !== 'POST') return miniAppJsonError('method_not_allowed', 'Method not allowed.', 405);

  let body: { action?: string; user_id?: number; enabled?: boolean; boosty_exempt?: boolean };
  try {
    body = await request.json();
  } catch {
    return miniAppJsonError('invalid_json', 'Invalid JSON body.', 400);
  }

  if (body.action === 'unban') {
    const userId = validUserId(body.user_id);
    if (!userId) return miniAppJsonError('invalid_user', 'Invalid Telegram user ID.', 400);
    try {
      const changed = await unbanChannelLeaveUser(userId, env, telegram);
      if (!changed) return miniAppJsonError('not_banned', 'User is not auto-banned by the channel-leave policy.', 409);
      return readState(env, telegram);
    } catch (error) {
      return miniAppJsonError('telegram_unban_failed', 'Telegram could not unban this user.', 502, { error: String(error).slice(0, 500) });
    }
  }

  if (body.action === 'retry') {
    const userId = validUserId(body.user_id);
    if (!userId) return miniAppJsonError('invalid_user', 'Invalid Telegram user ID.', 400);
    const changed = await retryChannelLeaveAutoBan(userId, env, telegram);
    if (!changed) return miniAppJsonError('not_retryable', 'No retryable auto-ban exists for this user.', 409);
    return readState(env, telegram);
  }

  if (body.action === 'config') {
    if (body.enabled === true) {
      const readiness = await botRestrictionReadiness(env, telegram);
      if (!readiness.configured) {
        return miniAppJsonError(
          'autoban_channel_not_configured',
          'Channel leave auto-ban cannot be enabled until the required access channel is configured.',
          409,
          readiness,
        );
      }
      if (!readiness.bot_can_restrict_members) {
        return miniAppJsonError(
          'autoban_permission_missing',
          'Channel leave auto-ban cannot be enabled until the bot can restrict/ban members in the required Telegram channel.',
          409,
          readiness,
        );
      }
    }

    const ops: D1PreparedStatement[] = [];
    if (typeof body.enabled === 'boolean') {
      ops.push(env.DB.prepare(`
        INSERT INTO app_settings(key,value) VALUES('channel_leave_autoban_enabled',?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
      `).bind(body.enabled ? '1' : '0'));
    }
    if (typeof body.boosty_exempt === 'boolean') {
      ops.push(env.DB.prepare(`
        INSERT INTO app_settings(key,value) VALUES('channel_leave_autoban_boosty_exempt',?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value
      `).bind(body.boosty_exempt ? '1' : '0'));
    }
    if (!ops.length) return miniAppJsonError('invalid_config', 'No configuration fields supplied.', 400);
    await env.DB.batch(ops);
    invalidateRuntimeSetting('channel_leave_autoban_enabled');
    invalidateRuntimeSetting('channel_leave_autoban_boosty_exempt');
    return readState(env, telegram);
  }

  return miniAppJsonError('unknown_action', 'Unknown channel auto-ban action.', 400);
}

async function readState(env: Env, telegram: TelegramClient): Promise<Response> {
  const [summary, rows, channel, enabled, boostyExempt, diagnostics] = await Promise.all([
    getChannelLeaveAutoBanSummary(env),
    env.DB.prepare(`
      SELECT b.user_id,b.channel_id,b.username,b.first_name,b.status,b.exemption_reason,b.leave_count,
             b.left_at,b.banned_at,b.unbanned_at,b.attempts,b.next_attempt_at,b.last_error,b.updated_at,
             (SELECT COUNT(*) FROM publication_deliveries d
               WHERE d.user_id=b.user_id AND d.status='delivered' AND d.delivered_at IS NOT NULL AND d.delivered_at<=b.left_at
             ) AS delivered_files_before_leave,
             (SELECT MAX(d.delivered_at) FROM publication_deliveries d
               WHERE d.user_id=b.user_id AND d.status='delivered' AND d.delivered_at IS NOT NULL AND d.delivered_at<=b.left_at
             ) AS last_download_at
      FROM channel_leave_auto_bans b
      ORDER BY b.left_at DESC
      LIMIT 100
    `).all<Record<string, unknown>>(),
    getAccessChannelForAutoBan(env),
    runtimeFlag(env, 'channel_leave_autoban_enabled', true),
    runtimeFlag(env, 'channel_leave_autoban_boosty_exempt', true),
    botRestrictionReadiness(env, telegram),
  ]);

  return miniAppJson({
    config: { enabled, boosty_exempt: boostyExempt },
    diagnostics: { ...diagnostics, channel_id: channel?.id || diagnostics.channel_id || null },
    summary,
    entries: rows.results,
  });
}

async function botRestrictionReadiness(env: Env, telegram: TelegramClient): Promise<Record<string, any>> {
  const channel = await getAccessChannelForAutoBan(env);
  if (!channel) return { configured: false, bot_can_restrict_members: false };
  try {
    const me = await telegram.call<{ id: number; username?: string }>('getMe', {});
    const member = await telegram.call<{ status: string; can_restrict_members?: boolean }>('getChatMember', {
      chat_id: normalizeChatId(channel.id),
      user_id: me.id,
    });
    return {
      configured: true,
      channel_id: channel.id,
      bot_status: member.status,
      bot_can_restrict_members: member.status === 'creator' || Boolean(member.can_restrict_members),
    };
  } catch (error) {
    return {
      configured: true,
      channel_id: channel.id,
      bot_can_restrict_members: false,
      error: String(error).slice(0, 500),
    };
  }
}

function validUserId(value: unknown): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeChatId(value: string): string | number {
  if (/^-?\d+$/.test(value)) {
    const numeric = Number(value);
    if (Number.isSafeInteger(numeric)) return numeric;
  }
  return value;
}
