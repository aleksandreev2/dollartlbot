import { loadLocalVars } from './env.mjs';

const vars = loadLocalVars();
const token = vars.TELEGRAM_BOT_TOKEN;
const webhookUrl = vars.WEBHOOK_URL;
const webhookSecret = vars.TELEGRAM_WEBHOOK_SECRET;

if (!token || !webhookUrl || !webhookSecret) {
  console.error('Required: TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET in .dev.vars, plus WEBHOOK_URL in the environment.');
  process.exit(1);
}

const api = async (method, body) => {
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

const commands = [
  { command: 'start', description: 'Open the main menu' },
  { command: 'rules', description: 'View submission rules' },
  { command: 'limit', description: 'Check your monthly request limit' },
  { command: 'language', description: 'Change bot language' },
  { command: 'cancel', description: 'Cancel the current submission' },
  { command: 'id', description: 'Show your Telegram ID' },
];

await api('setMyCommands', { commands });
await api('setWebhook', {
  url: `${webhookUrl.replace(/\/$/, '')}/webhook`,
  secret_token: webhookSecret,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: false,
});

console.log('Telegram commands and webhook configured.');
