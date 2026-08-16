import { checkBotAccess, sendAccessGate } from './access-gate';
import { getUser, upsertUser } from './db';
import { normalizeLocale } from './i18n/index';
import { beginSubmission } from './submissions';
import type { TelegramClient, TelegramUpdate } from './telegram';

export async function handleBotSubmitDeepLink(
  update: TelegramUpdate,
  env: Env,
  telegram: TelegramClient,
): Promise<boolean> {
  const message = update.message;
  if (!message || message.chat.type !== 'private' || !message.from) return false;
  const text = message.text?.trim() || '';
  if (!/^\/start\s+submit(?:\s|$)/i.test(text)) return false;

  await upsertUser(env, message.from);
  const user = await getUser(env, message.from.id);
  if (!user?.language_selected) {
    // Let the canonical handler show the language picker. Once language is set,
    // the normal menu still exposes Suggest; existing users jump straight in.
    return false;
  }

  const locale = normalizeLocale(user.language || message.from.language_code);
  const access = await checkBotAccess(message.from.id, env, telegram, { activationSource: 'bot' });
  if (!access.allowed) {
    await sendAccessGate(message.from.id, locale, access, telegram);
    return true;
  }

  await beginSubmission(message.from.id, locale, env, telegram);
  return true;
}
