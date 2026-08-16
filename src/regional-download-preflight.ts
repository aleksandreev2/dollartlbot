import { evaluateAccessPolicy } from './access-policy';
import { getUser, upsertUser } from './db';
import { normalizeLocale } from './i18n/index';
import {
  createRegionVerificationChallenge,
  sendRegionalRestriction,
  sendRegionVerificationPrompt,
} from './regional-access';
import { runtimeFlag } from './runtime-settings';
import { recordSecurityEvent } from './security-events';
import type { TelegramClient, TelegramUpdate } from './telegram';

const DOWNLOAD_START_PREFIX = 'dl_';
const TOKEN_RE = /^[A-Za-z0-9_-]{20,48}$/;

export async function handleRegionalDownloadPreflight(
  update: TelegramUpdate,
  env: Env,
  telegram: TelegramClient,
): Promise<boolean> {
  const message = update.message;
  if (!message || message.chat.type !== 'private' || !message.from || !message.text?.startsWith('/start')) return false;

  const payload = message.text.trim().split(/\s+/, 2)[1] || '';
  if (!payload.startsWith(DOWNLOAD_START_PREFIX)) return false;
  const downloadToken = payload.slice(DOWNLOAD_START_PREFIX.length);
  if (!TOKEN_RE.test(downloadToken)) return false;
  if (!(await runtimeFlag(env, 'download_gate_enabled', false))) return false;

  await upsertUser(env, message.from);
  const policy = await evaluateAccessPolicy(message.from.id, env, telegram, { activationSource: 'bot' });
  if (policy.capabilities.download) return false;

  if (policy.reason === 'regional_restricted' && policy.regional) {
    await recordSecurityEvent(env, 'download_denied_region', 'access_policy', {
      userId: message.from.id,
      severity: 'warning',
      metadata: { country_code: policy.regional.countryCode },
    });
    await sendRegionalRestriction(message.from.id, policy.regional.russianChannelUrl, telegram);
    return true;
  }

  if (policy.reason === 'regional_verification_required' && policy.regional) {
    const account = await getUser(env, message.from.id).catch(() => null);
    const locale = normalizeLocale(account?.language || message.from.language_code);
    const verificationUrl = await createRegionVerificationChallenge(env, message.from.id, {
      type: 'download',
      token: downloadToken,
    });
    await recordSecurityEvent(env, 'download_region_verification_required', 'access_policy', {
      userId: message.from.id,
      metadata: { country_code: policy.regional.countryCode },
    });
    await sendRegionVerificationPrompt(
      message.from.id,
      locale,
      verificationUrl,
      policy.regional.russianChannelUrl,
      telegram,
    );
    return true;
  }

  // Non-regional denials continue into the existing access/download guards so
  // their established user-facing copy and retry behavior remain unchanged.
  return false;
}
