import type { SubscriptionState } from './domain';
import { errorText } from './db';
import type { TelegramClient } from './telegram';

export async function getSubscriptionState(
  userId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<SubscriptionState> {
  if (!env.BOOSTY_GROUP_ID || env.BOOSTY_GROUP_ID === '0') {
    return { subscriber: false, verificationError: true };
  }

  try {
    const member = await telegram.getChatMember(env.BOOSTY_GROUP_ID, userId);
    const status = String(member.status ?? '');
    const subscriber =
      status === 'creator' ||
      status === 'administrator' ||
      status === 'member' ||
      (status === 'restricted' && member.is_member === true);
    return { subscriber, verificationError: false };
  } catch (error) {
    console.warn(
      JSON.stringify({ event: 'boosty_check_failed', user_id: userId, error: errorText(error) }),
    );
    return { subscriber: false, verificationError: true };
  }
}
