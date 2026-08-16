import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const runtime = read('src/runtime-settings.ts');
const auth = read('src/miniapp-auth.ts');
const gate = read('src/miniapp-regional-gate.ts');
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
function before(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) throw new Error(`Regional enforcement audit: invalid order ${label}`);
}

need(runtime, "download_gate_enabled: ['regional_routing_enabled']", 'regional routing implies private download gate');
need(migration, "'download_gate_enabled','1'", 'production setting self-heal');
need(migration, "key='regional_routing_enabled'", 'self-heal conditional on regional routing');
need(admin, "updates.set('download_gate_enabled', '1')", 'admin enabling routing also enables private delivery');

need(auth, 'evaluateMiniAppRegionalAccess', 'canonical Mini App regional authorization');
need(auth, 'regionalGate.code', 'regional auth error returned from canonical auth');
before(auth, 'evaluateMiniAppRegionalAccess(', 'checkBotAccess(telegramUser.id', 'regional Mini App lock before ordinary access gate');
need(gate, "code: 'regional_restricted'", 'restricted-region Mini App deny');
need(gate, "code: 'regional_verification_required'", 'unknown-region fail-closed Mini App deny');
need(gate, '?start=submit', 'ordinary bot suggestion deep link');
need(gate, 'checkRegionalDownloadAccess(userId, env, telegram)', 'Boosty/admin-aware regional decision');

need(ui, "'regional_restricted'", 'regional restricted UI lock code');
need(ui, "'regional_verification_required'", 'regional verification UI lock code');
need(ui, 'primary_url', 'regional primary action');
need(ui, 'secondary_url', 'ordinary bot suggestion action');
need(ui, 'setChromeLocked(true)', 'Mini App navigation hidden while region-locked');

need(downloadPreflight, "payload.startsWith(DOWNLOAD_START_PREFIX)", 'bot region preflight remains download-specific');
forbid(handlers, 'evaluateMiniAppRegionalAccess', 'ordinary Telegram bot must not inherit Mini App region ban');
need(handlers, "case 'menu:submit':", 'ordinary bot title suggestion remains available');
need(delivery, "runtimeFlag(env,'download_gate_enabled',false)", 'publishing honors effective private gate');
need(discussion, "runtimeFlag(env,'download_gate_enabled',false)", 'discussion routing honors effective private gate');

new Function(ui);
console.log('Regional enforcement audit passed: CIS/unknown Mini App access is fail-closed, private delivery is mandatory while routing is enabled, Boosty/admin bypass remains canonical, and ordinary bot suggestions stay available.');
