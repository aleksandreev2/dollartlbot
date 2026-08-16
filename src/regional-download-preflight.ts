import { getUser, upsertUser } from './db';
import { normalizeLocale } from './i18n/index';
import {
  checkRegionalDownloadAccess,
  createRegionVerificationChallenge,
  sendRegionalRestriction,
  sendRegionVerificationPrompt,
} from './regional-access';
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

  await upsertUser(env, message.from);
  const regional = await checkRegionalDownloadAccess(message.from.id, env, telegram);
  if (regional.allowed) return false;

  if (regional.reason === 'restricted') {
    await sendRegionalRestriction(message.from.id, regional.russianChannelUrl, telegram);
    return true;
  }

  if (regional.reason === 'verification_required') {
    const account = await getUser(env, message.from.id).catch(() => null);
    const locale = normalizeLocale(account?.language || message.from.language_code);
    const verificationUrl = await createRegionVerificationChallenge(env, message.from.id, {
      type: 'download',
      token: downloadToken,
    });
    await sendRegionVerificationPrompt(
      message.from.id,
      locale,
      verificationUrl,
      regional.russianChannelUrl,
      telegram,
    );
    return true;
  }

  return false;
}
