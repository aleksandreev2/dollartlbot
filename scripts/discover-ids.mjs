import { loadLocalVars } from './env.mjs';

const vars = loadLocalVars();
const token = vars.TELEGRAM_BOT_TOKEN;
if (!token || token.includes('replace_me')) {
  console.error('Set TELEGRAM_BOT_TOKEN in .dev.vars first.');
  process.exit(1);
}

const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ timeout: 0, allowed_updates: ['message'] }),
});
const body = await response.json();
if (!response.ok || !body.ok) {
  console.error(body.description ?? `Telegram HTTP ${response.status}`);
  if (String(body.description ?? '').toLowerCase().includes('webhook')) {
    console.error('getUpdates cannot be used while a webhook is active.');
  }
  process.exit(1);
}

if (!body.result.length) {
  console.log('No pending messages found.');
  console.log('Send the bot /id in private chat and /chatid in the verification group, then run this command again.');
  process.exit(0);
}

const seen = new Set();
for (const update of body.result) {
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
