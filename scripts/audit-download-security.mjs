import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const entry = read('src/entry.ts');
const antiAbuse = read('src/anti-abuse.ts');
const gate = read('src/download-gate.ts');
const delivery = read('src/publication-delivery.ts');
const assetSecurity = read('src/asset-security.ts');
const coverVariants = read('src/cover-variants.ts');
const coverUi = read('public/app/cover-ui.js');
const adminApi = read('src/admin-reader-security.ts');
const wrangler = read('wrangler.jsonc');
const m32 = read('migrations/0032_download_gate.sql');
const m33 = read('migrations/0033_anti_abuse.sql');
const m34 = read('migrations/0034_asset_security.sql');
const m35 = read('migrations/0035_cover_variants.sql');

function need(source, token, label = token) {
  if (!source.includes(token)) throw new Error(`Download/security audit: missing ${label}`);
}
function before(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) throw new Error(`Download/security audit: invalid order ${label}`);
}

need(wrangler, '"main": "src/entry.ts"');
need(wrangler, '"name": "USER_GUARD"');
need(wrangler, '"storage": "sqlite"');
need(entry, 'guardTelegramUpdate(update, env, ctx)');
need(entry, 'handleDownloadGateUpdate(update, env, telegram, ctx)');
before(entry, 'INSERT OR IGNORE INTO processed_updates', 'guardTelegramUpdate(update, env, ctx)', 'webhook dedupe before anti-abuse');
need(antiAbuse, "type GuardMode = 'off' | 'monitor' | 'enforce'");
need(antiAbuse, 'same_action_cooldown');
need(antiAbuse, 'NOTICE_COOLDOWN_MS');

need(m32, "UPDATE publications SET download_gate_status='legacy' WHERE status='published'", 'historical release compatibility');
need(m32, "('download_gate_enabled','0'", 'download gate defaults off');
need(m33, "('anti_abuse_mode','monitor'", 'anti-abuse defaults monitor');
need(m34, "('asset_scan_enforcement','0'", 'AV enforcement defaults off');
need(m35, "('cover_variants_enabled','0'", 'cover variants default off');
for (const migration of [m32,m33,m34,m35]) need(migration, 'updated_at', 'app_settings timestamp seed');

need(delivery, "text:'Thank you.'", 'exact Thank you button');
need(delivery, "callback_data:`dl:${gate.token}`", 'tracked download callback');
need(delivery, "callback_data:`dn:${gate.token}`", 'tracked donate callback');
need(delivery, "publication.download_gate_status!=='legacy'", 'legacy release fallback');
need(gate, 'eventType: string', 'reader event ledger');
need(gate, "asset.scan_status !== 'clean'", 'fail-closed scan enforcement');
need(gate, 'telegram_file_id', 'Telegram file cache');
need(gate, 'publication_deliveries', 'per-user delivery ledger');

need(assetSecurity, "crypto.subtle.digest('SHA-256'", 'asset SHA-256');
need(assetSecurity, 'file_scan_cache', 'scan hash cache');
need(assetSecurity, "'/internal/asset-scan/result'", 'scanner result endpoint');
need(assetSecurity, 'x-dollar-sha256', 'scanner content integrity hint');

need(coverVariants, 'max-age=31536000, immutable', 'immutable cover cache');
for (const width of ['160','320','640']) need(coverUi, width, `cover UI ${width}px variant`);
need(coverUi, 'img.srcset', 'responsive cover srcset');
need(coverUi, 'canvas.toBlob', 'client-side cover optimization');

need(adminApi, "const publicationReaders = /^\\/api\\/app\\/admin\\/publications", 'publication readers admin route');
need(adminApi, "const userActivity = /^\\/api\\/app\\/admin\\/users", 'user reader activity admin route');
for (const route of [
  "'/api/app/admin/security/anti-abuse'",
  "'/api/app/admin/security/assets'",
  "'/api/app/admin/security/config'",
]) need(adminApi, route, `admin route ${route}`);

console.log('Download/security audit passed: dedupe, anti-abuse, tracked gate, per-user delivery, AV gate, immutable cover variants, and admin observability are wired.');
