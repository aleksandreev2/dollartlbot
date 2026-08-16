import { checkBotAccess, type AccessDecision } from './access-gate';
import { isAdmin } from './db';
import { checkRegionalDownloadAccess, type RegionalAccessDecision } from './regional-access';
import type { TelegramClient } from './telegram';

export type Capability = 'use_bot' | 'miniapp' | 'suggest_title' | 'download';
export type PolicyReason =
  | 'admin'
  | 'manual_block'
  | 'channel_leave_banned'
  | 'regional_restricted'
  | 'regional_verification_required'
  | 'membership_required'
  | 'access_check_unavailable'
  | 'allowed';

export type AccessPolicyDecision = {
  userId: number;
  reason: PolicyReason;
  capabilities: Record<Capability, boolean>;
  access: AccessDecision | null;
  regional: RegionalAccessDecision | null;
};

export async function evaluateAccessPolicy(
  userId: number,
  env: Env,
  telegram: TelegramClient,
  options: { forceMembership?: boolean; activationSource?: 'bot' | 'miniapp' } = {},
): Promise<AccessPolicyDecision> {
  if (isAdmin(userId, env)) return make(userId, 'admin', true, true, true, true, null, null);

  const [manualBlock, leaveBan] = await Promise.all([
    hasManualBlock(env, userId),
    hasActiveLeaveBan(env, userId),
  ]);
  if (manualBlock) return make(userId, 'manual_block', false, false, false, false, null, null);
  if (leaveBan) return make(userId, 'channel_leave_banned', false, false, false, false, null, null);

  const regional = await checkRegionalDownloadAccess(userId, env, telegram);
  if (!regional.allowed) {
    if (regional.reason === 'restricted') {
      // Regional routing is not a punitive bot ban: title suggestions stay in
      // the ordinary Telegram bot, while Mini App and English file delivery are closed.
      return make(userId, 'regional_restricted', true, false, true, false, null, regional);
    }
    if (regional.reason === 'verification_required') {
      return make(userId, 'regional_verification_required', true, false, true, false, null, regional);
    }
  }

  const access = await checkBotAccess(userId, env, telegram, {
    force: options.forceMembership,
    activationSource: options.activationSource,
  });
  if (!access.allowed) {
    const reason: PolicyReason = access.reason === 'check_unavailable'
      ? 'access_check_unavailable'
      : 'membership_required';
    return make(userId, reason, false, false, false, false, access, regional);
  }

  return make(userId, 'allowed', true, true, true, true, access, regional);
}

export function capabilityAllowed(decision: AccessPolicyDecision, capability: Capability): boolean {
  return decision.capabilities[capability] === true;
}

async function hasManualBlock(env: Env, userId: number): Promise<boolean> {
  try {
    const row = await env.DB.prepare(`
      SELECT blocked_at FROM user_admin_controls
      WHERE user_id=? AND blocked_at IS NOT NULL
      LIMIT 1
    `).bind(userId).first<{ blocked_at: string }>();
    return Boolean(row?.blocked_at);
  } catch {
    return false;
  }
}

async function hasActiveLeaveBan(env: Env, userId: number): Promise<boolean> {
  try {
    const row = await env.DB.prepare(`
      SELECT status FROM channel_leave_auto_bans
      WHERE user_id=? AND status='banned'
      ORDER BY left_at DESC LIMIT 1
    `).bind(userId).first<{ status: string }>();
    return row?.status === 'banned';
  } catch {
    return false;
  }
}

function make(
  userId: number,
  reason: PolicyReason,
  useBot: boolean,
  miniapp: boolean,
  suggestTitle: boolean,
  download: boolean,
  access: AccessDecision | null,
  regional: RegionalAccessDecision | null,
): AccessPolicyDecision {
  return {
    userId,
    reason,
    capabilities: {
      use_bot: useBot,
      miniapp,
      suggest_title: suggestTitle,
      download,
    },
    access,
    regional,
  };
}
