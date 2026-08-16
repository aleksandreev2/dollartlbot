import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const entry = read('src/entry.ts');
const antiAbuse = read('src/anti-abuse.ts');
const gate = read('src/download-gate.ts');
const regional = read('src/regional-access.ts');
const regionalPreflight = read('src/regional-download-preflight.ts');
const regionalAdmin = read('src/admin-regional-access.ts');
const regionalAdminUi = read('public/app/admin-regional-access.js');
const appIndex = read('public/app/index.html');
const miniappAuth = read('src/miniapp-auth.ts');
const delivery = read('src/publication-delivery.ts');
const discussion = read('src/publishing-discussion.ts');
const assetSecurity = read('src/asset-security.ts');
const coverVariants = read('src/cover-variants.ts');
const coverUi = read('public/app/cover-ui.js');
const adminApi = read('src/admin-reader-security.ts');
const wrangler = read('wrangler.jsonc');
const m32 = read('migrations/0032_download_gate.sql');
const m33 = read('migrations/0033_anti_abuse.sql');
const m34 = read('migrations/0034_asset_security.sql');
const m35 = read('migrations/0035_cover_variants.sql');
const m36 = read('migrations/0036_regional_access.sql');

function need(source, token, label = token) {
  if (!source.includes(token)) throw new Error(`Download/security audit: missing ${label}`);
}
function forbid(source, token, label = token) {
  if (source.includes(token)) throw new Error(`Download/security audit: forbidden ${label}`);
}
function before(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) throw new Error(`Download/security audit: invalid order ${label}`);
}

need(wrangler, '"main": "src/entry.ts"');
need(wrangler, '"name": "USER_GUARD"');
need(wrangler, '"storage": "sqlite"');
need(wrangler, '"/verify/*"', 'verification route runs worker first');
need(entry, 'guardTelegramUpdate(update, env, ctx)');
need(entry, 'handleRegionalDownloadPreflight(update, env, telegram)');
need(entry, 'handleDownloadGateUpdate(update, env, telegram, ctx)');
need(entry, 'handleAdminRegionalAccessRequest(request, env)', 'regional admin API routed');
before(entry, 'INSERT OR IGNORE INTO processed_updates', 'guardTelegramUpdate(update, env, ctx)', 'webhook dedupe before anti-abuse');
before(entry, 'handleRegionalDownloadPreflight(update, env, telegram)', 'handleDownloadGateUpdate(update, env, telegram, ctx)', 'regional policy before file delivery');
need(antiAbuse, "type GuardMode = 'off' | 'monitor' | 'enforce'");
need(antiAbuse, 'same_action_cooldown');
need(antiAbuse, 'NOTICE_COOLDOWN_MS');

need(m32, "UPDATE publications SET download_gate_status='legacy' WHERE status='published'", 'historical release compatibility');
need(m32, "('download_gate_enabled','0'", 'download gate defaults off');
need(m33, "('anti_abuse_mode','monitor'", 'anti-abuse defaults monitor');
need(m34, "('asset_scan_enforcement','0'", 'AV enforcement defaults off');
need(m35, "('cover_variants_enabled','0'", 'cover variants default off');
for (const migration of [m32,m33,m34,m35]) need(migration, 'updated_at', 'app_settings timestamp seed');
need(discussion, "WHEN ?=0 AND download_gate_status='disabled' THEN 'legacy'", 'gate-off releases freeze into legacy mode');

need(m36, 'ALTER TABLE users ADD COLUMN country_code TEXT', 'stored country code');
need(m36, 'region_verification_challenges', 'one-time region challenges');
need(m36, "('regional_routing_enabled','1'", 'regional routing defaults enabled');
need(m36, 'https://t.me/domnekromanta', 'Russian translation channel');
need(regional, "getSubscriptionState(userId, env, telegram)", 'Boosty bypass check');
need(regional, "if (subscription.subscriber) return decision(true, 'boosty'", 'Boosty bypass before region deny');
need(regional, "crypto.subtle.digest('SHA-256'", 'verification tokens hashed before DB');
need(regional, "country_source=?", 'country provenance stored');
need(regional, "country_verified_at=?", 'country verification timestamp');
need(regional, "request as Request & { cf?: { country?: string } }", 'Cloudflare country source');
need(regional, 'Only the country code is stored; your IP address is not saved.', 'privacy disclosure');
forbid(m36, 'ip_address', 'IP persistence');
forbid(regional, 'cf?.city', 'city fingerprinting');
need(regionalPreflight, "payload.startsWith(DOWNLOAD_START_PREFIX)", 'download-only regional preflight');
need(regionalPreflight, "regional.reason === 'restricted'", 'CIS routing decision');
need(regionalPreflight, "regional.reason === 'verification_required'", 'unknown region verification challenge');
need(miniappAuth, "captureRegionFromRequest(request, telegramUser.id, env, 'miniapp')", 'Mini App country capture');
need(entry, 'handleRegionVerificationRequest(request, env)', 'browser verification endpoint');
need(regionalAdmin, "'/api/app/admin/security/regional'", 'regional admin endpoint');
need(regionalAdmin, 'regional_restricted_countries', 'editable restricted country list');
need(regionalAdminUi, '/api/app/admin/security/regional', 'regional admin UI API');
need(regionalAdminUi, 'regionalCountries', 'regional country editor');
need(appIndex, '/app/admin-regional-access.js', 'regional admin UI loaded');
new Function(regionalAdminUi);

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
need(assetSecurity, 'hashStoredAssets(publicationId, env)', 'post-upload R2 hashing');
forbid(entry, 'request.clone()', 'large multipart request clone');

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

console.log('Download/security audit passed: dedupe, anti-abuse, tracked gate, mandatory country verification, Boosty bypass, CIS routing, editable regional controls, rollout isolation, per-user delivery, AV gate, upload memory safety, immutable cover variants, and admin observability are wired.');
