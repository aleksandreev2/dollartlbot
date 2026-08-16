import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const runtime = read('src/runtime-settings.ts');
const auth = read('src/miniapp-auth.ts');
const policy = read('src/access-policy.ts');
const gate = read('src/miniapp-regional-gate.ts');
const botSubmit = read('src/bot-submit-deeplink.ts');
const entry = read('src/entry.ts');
const downloadPreflight = read('src/regional-download-preflight.ts');
const delivery = read('src/publication-delivery.ts');
const discussion = read('src/publishing-discussion.ts');
const admin = read('src/admin-regional-access.ts');
const ui = read('public/app/access-gate-ui.js');
const handlers = read('src/handlers.ts');
const migration = read('migrations/0039_regional_enforcement.sql');

function need(source, token, label = token) {
  if (!source.includes(token)) throw new Error(`Regional enforcement audit: missing ${label}`);
}
function forbid(source, token, label = token) {
  if (source.includes(token)) throw new Error(`Regional enforcement audit: forbidden ${label}`);
}

need(runtime, "download_gate_enabled: ['regional_routing_enabled']", 'regional routing implies private download gate');
need(migration, "'download_gate_enabled','1'", 'production setting self-heal');
need(migration, "key='regional_routing_enabled'", 'self-heal conditional on regional routing');
need(admin, "updates.set('download_gate_enabled', '1')", 'admin enabling routing also enables private delivery');

need(auth, 'evaluateAccessPolicy(telegramUser.id, env, telegram', 'canonical Mini App access policy');
need(auth, 'policy.capabilities.miniapp', 'canonical Mini App capability enforcement');
need(auth, 'evaluateMiniAppRegionalAccess', 'regional denial preserves specialized Mini App UX');
need(auth, 'regionalGate.code', 'regional auth error returned from canonical auth');
need(auth, 'requestCountry(request)', 'current Cloudflare country observed on every Mini App auth');
need(auth, "COALESCE(country_code,'')<>?", 'country changes bypass same-country write suppression');
need(policy, 'checkRegionalDownloadAccess(userId, env, telegram)', 'policy owns regional decision');
need(policy, "make(userId, 'regional_restricted', true, false, true, false", 'restricted region capability matrix');
need(policy, "make(userId, 'regional_verification_required', true, false, true, false", 'unknown region capability matrix');
need(gate, "code: 'regional_restricted'", 'restricted-region Mini App deny');
need(gate, "code: 'regional_verification_required'", 'unknown-region fail-closed Mini App deny');
need(gate, '?start=submit', 'ordinary bot suggestion deep link');
need(gate, 'checkRegionalDownloadAccess(userId, env, telegram)', 'Boosty/admin-aware regional UX decision');

need(ui, "'regional_restricted'", 'regional restricted UI lock code');
need(ui, "'regional_verification_required'", 'regional verification UI lock code');
need(ui, 'primary_url', 'regional primary action');
need(ui, 'secondary_url', 'ordinary bot suggestion action');
need(ui, 'setChromeLocked(true)', 'Mini App navigation hidden while region-locked');

need(downloadPreflight, "payload.startsWith(DOWNLOAD_START_PREFIX)", 'bot region preflight remains download-specific');
need(downloadPreflight, 'evaluateAccessPolicy(message.from.id, env, telegram', 'download preflight uses canonical policy');
need(downloadPreflight, "policy.reason === 'regional_restricted'", 'restricted download routed to Russian channel');
need(downloadPreflight, "policy.reason === 'regional_verification_required'", 'unknown download requires verification');
forbid(handlers, 'evaluateMiniAppRegionalAccess', 'ordinary Telegram bot must not inherit Mini App region ban');
need(handlers, "case 'menu:submit':", 'ordinary bot title suggestion remains available');
need(botSubmit, "/^\\/start\\s+submit", 'bot submit deep link interception');
need(botSubmit, 'beginSubmission(', 'deep link opens title suggestion flow');
need(entry, 'handleBotSubmitDeepLink(update, env, telegram)', 'bot submit deep link wired in production');
need(delivery, "runtimeFlag(env,'download_gate_enabled',false)", 'publishing honors effective private gate');
need(discussion, "runtimeFlag(env,'download_gate_enabled',false)", 'discussion routing honors effective private gate');

new Function(ui);
console.log('Regional enforcement audit passed: centralized policy keeps CIS/unknown Mini App fail-closed, private delivery mandatory, Boosty/admin bypass canonical, country changes fresh, and ordinary bot suggestions available.');