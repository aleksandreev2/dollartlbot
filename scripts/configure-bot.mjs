import { readFileSync } from 'node:fs';
import { loadLocalVars } from './env.mjs';

const vars = loadLocalVars();
const token = vars.TELEGRAM_BOT_TOKEN;
const webhookUrl = vars.WEBHOOK_URL;
const webhookSecret = vars.TELEGRAM_WEBHOOK_SECRET;
const adminTelegramId = vars.ADMIN_TELEGRAM_ID;
const configuredMiniAppUrl = readConfiguredMiniAppUrl();
const miniAppUrl = process.env.MINI_APP_URL
  || configuredMiniAppUrl
  || vars.MINI_APP_URL
  || (webhookUrl ? `${webhookUrl.replace(/\/$/, '')}/app/` : '');

if (!token || !webhookUrl || !webhookSecret) {
  console.error('Required: TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .dev.vars, plus WEBHOOK_URL in the environment.');
  process.exit(1);
}

if (!/^[A-Za-z0-9_-]{1,256}$/.test(webhookSecret)) {
  console.error('TELEGRAM_WEBHOOK_SECRET must be 1-256 characters using only A-Z, a-z, 0-9, _ and -.');
  process.exit(1);
}

if (miniAppUrl && !/^https:\/\//i.test(miniAppUrl)) {
  console.error('MINI_APP_URL must use HTTPS.');
  process.exit(1);
}

const api = async (method, body = {}) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(`${method}: ${json.description ?? response.status}`);
  }
  return json.result;
};

const bot = await api('getMe');
const commands = [
  { command: 'start', description: 'Open the main menu' },
  { command: 'queue', description: 'View the translation queue' },
  { command: 'requests', description: 'View your submitted novels' },
  { command: 'limit', description: 'Check your monthly request limit' },
  { command: 'guide', description: 'How requests and the queue work' },
  { command: 'rules', description: 'View submission rules' },
  { command: 'language', description: 'Change bot language' },
  { command: 'cancel', description: 'Cancel the current submission' },
  { command: 'id', description: 'Show your Telegram ID' },
];

await api('setMyCommands', { commands });

if (adminTelegramId && /^\d+$/.test(adminTelegramId) && adminTelegramId !== '0') {
  await api('setMyCommands', {
    scope: { type: 'chat', chat_id: Number(adminTelegramId) },
    commands: [...commands, { command: 'admin', description: 'Open Dollar TL admin panel' }],
  });
}

if (miniAppUrl) {
  await api('setChatMenuButton', {
    menu_button: {
      type: 'web_app',
      text: 'Open Dollar TL',
      web_app: { url: miniAppUrl },
    },
  });
}

await api('setWebhook', {
  url: `${webhookUrl.replace(/\/$/, '')}/webhook`,
  secret_token: webhookSecret,
  allowed_updates: ['message', 'callback_query', 'chat_member'],
  drop_pending_updates: false,
});

console.log(`Telegram commands, Mini App menu button${miniAppUrl ? ` (${miniAppUrl})` : ''} and webhook configured.`);
if (miniAppUrl && bot?.username) {
  console.log('');
  console.log('Main Mini App profile button (one-time Telegram setup):');
  console.log(`  @BotFather → /mybots → @${bot.username} → Bot Settings → Configure Mini App → Enable Mini App`);
  console.log(`  Main Mini App URL: ${miniAppUrl}`);
  console.log(`  Direct Main Mini App link after enabling: https://t.me/${bot.username}?startapp`);
  console.log('  Telegram requires Main Mini App profile configuration through @BotFather; the Bot API only configures the chat menu button.');
}

function readConfiguredMiniAppUrl() {
  try {
    const source = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
    return /"MINI_APP_URL"\s*:\s*"([^"]+)"/.exec(source)?.[1]?.trim() || '';
  } catch {
    return '';
  }
}
