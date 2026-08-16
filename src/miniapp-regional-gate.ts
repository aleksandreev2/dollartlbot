import { checkRegionalDownloadAccess, createRegionVerificationChallenge } from './regional-access';
import { getRuntimeSetting } from './runtime-settings';
import type { TelegramClient } from './telegram';

export type MiniAppRegionalGate = {
  code: 'regional_restricted' | 'regional_verification_required';
  message: string;
  details: Record<string, unknown>;
};

export async function evaluateMiniAppRegionalAccess(
  userId: number,
  locale: string,
  env: Env,
  telegram: TelegramClient,
): Promise<MiniAppRegionalGate | null> {
  const regional = await checkRegionalDownloadAccess(userId, env, telegram);
  if (regional.allowed) return null;

  const username = (
    await getRuntimeSetting(
      env,
      'bot_username',
      String((env as Env & { BOT_USERNAME?: string }).BOT_USERNAME || 'dollartlbot'),
    )
  ).replace(/^@/, '') || 'dollartlbot';
  const suggestUrl = `https://t.me/${encodeURIComponent(username)}?start=submit`;
  const russian = String(locale || '').toLowerCase().startsWith('ru');

  if (regional.reason === 'restricted') {
    return {
      code: 'regional_restricted',
      message: russian
        ? 'Для пользователей из стран СНГ Dollar TL Mini App недоступен. Предложить новый тайтл можно через обычного Telegram-бота, а русские переводы публикуются в нашем отдельном канале.'
        : 'Dollar TL Mini App is unavailable in your region. You can still suggest a new title through the regular Telegram bot, while Russian translations are published in our separate channel.',
      details: {
        title: russian ? 'Русские переводы для вашего региона' : 'Regional access',
        country_code: regional.countryCode,
        primary_label: '🇷🇺 Русские переводы',
        primary_url: regional.russianChannelUrl,
        secondary_label: russian ? '➕ Предложить тайтл в боте' : '➕ Suggest a title in the bot',
        secondary_url: suggestUrl,
        retry_label: russian ? 'Проверить доступ снова' : 'Check access again',
      },
    };
  }

  if (regional.reason === 'verification_required') {
    let verificationUrl = '';
    try {
      verificationUrl = await createRegionVerificationChallenge(env, userId, { type: 'none' });
    } catch {
      // The Mini App remains fail-closed when the region cannot be verified.
    }
    return {
      code: 'regional_verification_required',
      message: russian
        ? 'Перед использованием Dollar TL Mini App необходимо подтвердить регион. Если Mini App работает нестабильно, проверку можно открыть обычной HTTPS-ссылкой. Предложение тайтлов через Telegram-бот остаётся доступным.'
        : 'Your region must be verified before Dollar TL Mini App can be used. If the Mini App connection is unstable, use the regular HTTPS verification link. Title suggestions through the Telegram bot remain available.',
      details: {
        title: russian ? 'Нужно подтвердить регион' : 'Region verification required',
        primary_label: russian ? 'Проверить регион' : 'Verify region',
        primary_url: verificationUrl || undefined,
        secondary_label: russian ? '➕ Предложить тайтл в боте' : '➕ Suggest a title in the bot',
        secondary_url: suggestUrl,
        russian_channel_url: regional.russianChannelUrl,
        retry_label: russian ? 'Проверить доступ снова' : 'Check access again',
      },
    };
  }

  return null;
}
