const token = process.env.TELEGRAM_BOT_TOKEN;
const webhookUrl = process.env.WEBHOOK_URL;
const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!token || !webhookUrl || !webhookSecret) {
  console.error('Required env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WEBHOOK_URL');
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
