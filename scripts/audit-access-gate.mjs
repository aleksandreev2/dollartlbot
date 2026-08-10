import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const need = (source, needle, label) => { if (!source.includes(needle)) throw new Error(`${label}: missing ${needle}`); };
const forbid = (source, needle, label) => { if (source.includes(needle)) throw new Error(`${label}: forbidden ${needle}`); };

const migration = read('migrations/0016_channel_access_gate.sql');
const gate = read('src/access-gate.ts');
const gateCopy = read('src/i18n/access_gate.ts');
const i18n = read('src/i18n/index.ts');
const auth = read('src/miniapp-auth.ts');
const baseAccess = read('src/miniapp-access.ts');
const handlers = read('src/handlers.ts');
const indexTs = read('src/index.ts');
const telegram = read('src/telegram.ts');
const configure = read('scripts/configure-bot.mjs');
const adminApi = read('src/access-admin.ts');
const gateUi = read('public/app/access-gate-ui.js');
const gateCss = read('public/app/access-gate-ui.css');
const adminUi = read('public/app/access-admin-ui.js');
const html = read('public/app/index.html');
const wrangler = read('wrangler.jsonc');

for (const token of [
  "('access_channel_id', '@dollartranslate'",
  "('access_channel_url', 'https://t.me/dollartranslate'",
  'CREATE TABLE IF NOT EXISTS access_membership_cache',
  'PRIMARY KEY (user_id, channel_key)',
  'expires_at TEXT NOT NULL',
  'stale_until TEXT NOT NULL',
]) need(migration, token, 'access migration');

for (const token of [
  'POSITIVE_TTL_MS = 3 * 60 * 1000',
  'NEGATIVE_TTL_MS = 15 * 1000',
  'STALE_POSITIVE_GRACE_MS = 30 * 60 * 1000',
  "WHERE key IN ('access_channel_id','access_channel_url')",
  'getSubscriptionState(userId, env, telegram)',
  "cached.source === 'denied'",
  "cached.source === 'entitlement'",
  'subscription.verificationError',
  'cached?.is_member === 1',
  'Date.parse(cached.stale_until) > now',
  'handleAccessChatMemberUpdate',
  "'channel_event'",
  'active ? POSITIVE_TTL_MS : 0',
  'active ? STALE_POSITIVE_GRACE_MS : 0',
  "writeCache(env, userId, config.channelKey, false, 'denied'",
  'runAccessGateMaintenance',
  'getAccessGateDiagnostics',
  'invalidateAccessConfigCache',
]) need(gate, token, 'access gate');
forbid(gate, 'publish_channel_id', 'access gate channel ownership');

need(telegram, 'export function isActiveChatMember(', 'Telegram membership semantics');
need(auth, 'checkBotAccess(telegramUser.id, env, telegram', 'Mini App shared auth gate');
need(auth, "request.headers.get('x-access-recheck') === '1'", 'forced Mini App recheck');
need(auth, 'accessErrorDetails(locale, access)', 'localized Mini App gate details');
need(baseAccess, "url.pathname !== '/api/app/access'", 'Mini App access heartbeat endpoint');
need(baseAccess, 'authenticateMiniAppRequest(request, env)', 'Mini App access heartbeat auth');

for (const token of [
  'ensureBotAccess(from.id, locale, env, telegram)',
  "data === 'access:retry'",
  'checkBotAccess(userId, env, telegram, { force: true })',
  'sendAccessGate(',
  'const referralHandled = await handleReferralBotStart(',
  'if (referralHandled)',
]) need(handlers, token, 'Telegram bot gate');

for (const token of [
  'handleAccessAdminRequest',
  'handleAccessChatMemberUpdate(update.chat_member, env)',
  "runScheduledTask('access_gate_maintenance'",
  'handleBaseMiniAppAccess(request, env)',
]) need(indexTs, token, 'Worker routing');

for (const token of [
  "ACCESS_CODES = new Set(['membership_required', 'access_check_unavailable'])",
  "fetch('/api/app/access'",
  "headers.set('x-access-recheck', '1')",
  'tg?.openTelegramLink',
  'window.setInterval(verifyAccess, 60_000)',
  "document.addEventListener('visibilitychange'",
  'runtime.registerResponseHandler',
  'app.state.accessLocked = true',
  'function setChromeLocked(locked)',
  "app.root.classList.toggle('access-locked', locked)",
  "app.sheetRoot.innerHTML = ''",
  'bell.disabled = locked',
]) need(gateUi, token, 'Mini App gate UX');
for (const token of [
  '.app-shell.access-locked .topbar .brand',
  '.app-shell.access-locked .topbar .notification-button',
  'pointer-events: none',
]) need(gateCss, token, 'Mini App gate CSS');

for (const token of [
  "url.pathname !== '/api/app/admin/access'",
  'getAccessGateDiagnostics',
  'invalidateAccessConfigCache',
  'cleanTelegramJoinUrl',
  "WHERE key IN ('access_channel_id','access_channel_url')",
]) need(adminApi, token, 'Access admin API');
forbid(adminApi, 'publish_channel_id', 'Access admin independence');
for (const token of [
  "api('/api/app/admin/access'",
  'Канал обязательного доступа',
  'Ссылка для вступления',
  'Пустое значение отключает ограничение доступа',
  'Сохранить доступ',
]) need(adminUi, token, 'Access admin UI');

need(i18n, "import { accessGateTranslations } from './access_gate'", 'access gate translations');
for (const locale of ['en','es','fil','hi','pt','id','vi','fr','de','ru']) need(gateCopy, `${locale}: {`, `access gate locale ${locale}`);
forbid(gateCopy, 'Boosty', 'user-facing access gate copy');
forbid(gateCopy, 'boosty', 'user-facing access gate copy');

need(configure, "allowed_updates: ['message', 'callback_query', 'chat_member']", 'Telegram webhook membership updates');
need(html, '/app/access-gate-ui.css?v=20260810-access1', 'access gate CSS asset');
need(html, '/app/access-gate-ui.js?v=20260810-access1', 'access gate JS asset');
need(html, '/app/access-admin-ui.js?v=20260810-access1', 'access admin JS asset');
need(wrangler, 'MINI_APP_URL', 'fresh Mini App URL');
if (!/\/app\/\?build=[A-Za-z0-9._-]+/.test(wrangler)) throw new Error('Mini App URL must retain a versioned build query.');

new Function(gateUi);
new Function(adminUi);

console.log('Channel access gate audit passed: explicit Dollar TL channel, backend enforcement, immediate membership invalidation, bounded cache/grace, internal entitlement safety, referral-safe onboarding, full Mini App chrome lock, localized UX, admin diagnostics, and live rechecks are wired.');
