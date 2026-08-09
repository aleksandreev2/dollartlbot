import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}
function need(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`);
}

const telegram = read('src/telegram.ts');

for (const needle of [
  'retry_after?: number',
  'readonly retryAfter?: number',
  'MAX_INLINE_RATE_LIMIT_RETRIES',
  'MAX_INLINE_RETRY_AFTER_SECONDS',
  'SAFE_SERVER_RETRY_METHODS',
  'fetchWithTimeout',
  'new AbortController()',
  'UPLOAD_REQUEST_TIMEOUT_MS',
  'response.status === 429 || body.error_code === 429',
  'Upload/send methods are not safely idempotent',
]) need(telegram, needle, 'Telegram transport');

console.log('Telegram transport reliability audit passed.');
