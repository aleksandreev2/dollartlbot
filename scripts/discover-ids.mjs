import { loadLocalVars } from './env.mjs';

const vars = loadLocalVars();
const token = vars.TELEGRAM_BOT_TOKEN;
const allowDeleteWebhook = process.argv.includes('--delete-webhook');

if (!token || token.includes('replace_me')) {
  console.error('Set TELEGRAM_BOT_TOKEN in .dev.vars first.');
  process.exit(1);
}

async function telegram(method, payload = {}) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) {
    throw new Error(body.description ?? `Telegram HTTP ${response.status}`);
  }
  return body.result;
}

try {
  const webhook = await telegram('getWebhookInfo');
  if (webhook?.url) {
    console.log(`An active Telegram webhook is configured: ${webhook.url}`);
    if (!allowDeleteWebhook) {
      console.log('Telegram does not allow getUpdates while a webhook is active.');
      console.log('For first-time setup, run:');
      console.log('  npm run discover-ids -- --delete-webhook');
      console.log('This removes the old webhook WITHOUT dropping pending updates.');
      console.log('Later, npm run configure-bot will install the Cloudflare webhook again.');
      process.exit(2);
    }

    await telegram('deleteWebhook', { drop_pending_updates: false });
    console.log('Old webhook removed. Pending updates were kept.');
  }

  const updates = await telegram('getUpdates', {
    timeout: 0,
    allowed_updates: ['message'],
  });

  if (!updates.length) {
    console.log('No pending messages found.');
    console.log('Send the bot /id in private chat and /chatid in the verification group, then run this command again.');
    process.exit(0);
  }

  const seen = new Set();
  for (const update of updates) {
    const message = update.message;
    if (!message?.chat || !message?.from) continue;
    const key = `${message.chat.id}:${message.from.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (message.chat.type === 'private') {
      const username = message.from.username ? `@${message.from.username}` : message.from.first_name ?? 'unknown';
      console.log(`PRIVATE  ${username}`);
      console.log(`  ADMIN_TELEGRAM_ID=${message.from.id}`);
    } else if (message.chat.type === 'group' || message.chat.type === 'supergroup') {
      console.log(`GROUP    ${message.chat.title ?? 'unnamed group'}`);
      console.log(`  BOOSTY_GROUP_ID=${message.chat.id}`);
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
