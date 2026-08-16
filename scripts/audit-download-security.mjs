import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const entry = read('src/entry.ts');
const antiAbuse = read('src/anti-abuse.ts');
const gate = read('src/download-gate.ts');
const filePreflight = read('src/file-download-preflight.ts');
const scanConfigGuard = read('src/asset-security-config-guard.ts');
const regional = read('src/regional-access.ts');
const regionalPreflight = read('src/regional-download-preflight.ts');
const regionalAdmin = read('src/admin-regional-access.ts');
const securityUi = read('public/app/admin-regional-access.js');
const appIndex = read('public/app/index.html');
const miniappAuth = read('src/miniapp-auth.ts');
const delivery = read('src/publication-delivery.ts');
const discussion = read('src/publishing-discussion.ts');
const assetSecurity = read('src/asset-security.ts');
const adminFileSecurity = read('src/admin-file-security.ts');
const coverVariants = read('src/cover-variants.ts');
const coverUi = read('public/app/cover-ui.js');
const adminApi = read('src/admin-reader-security.ts');
const wrangler = read('wrangler.jsonc');
const scannerWrangler = read('scanner/wrangler.jsonc');
const scannerWorker = read('scanner/src/index.ts');
const scannerGo = read('scanner/container/main.go');
const scannerDocker = read('scanner/container/Dockerfile');
const clamdConfig = read('scanner/container/clamd.conf');
const scannerStart = read('scanner/container/start.sh');
const m32 = read('migrations/0032_download_gate.sql');
const m33 = read('migrations/0033_anti_abuse.sql');
const m34 = read('migrations/0034_asset_security.sql');
const m35 = read('migrations/0035_cover_variants.sql');
const m36 = read('migrations/0036_regional_access.sql');
const m37 = read('migrations/0037_file_security_v2.sql');

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
need(entry, 'handleFileDownloadPreflight(update, env, telegram)');
need(entry, 'handleDownloadGateUpdate(update, env, telegram, ctx)');
need(entry, 'handleAdminRegionalAccessRequest(request, env)', 'regional admin API routed');
need(entry, 'handleAdminFileSecurityRequest(request, env)', 'file security admin API routed');
need(entry, 'guardAssetScanEnforcementConfig(request, env)', 'AV enforcement guard routed');
before(entry, 'INSERT OR IGNORE INTO processed_updates', 'guardTelegramUpdate(update, env, ctx)', 'webhook dedupe before anti-abuse');
before(entry, 'handleRegionalDownloadPreflight(update, env, telegram)', 'handleFileDownloadPreflight(update, env, telegram)', 'regional policy before file security');
before(entry, 'handleFileDownloadPreflight(update, env, telegram)', 'handleDownloadGateUpdate(update, env, telegram, ctx)', 'file security before delivery');
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
need(securityUi, '/api/app/admin/security/regional', 'regional admin UI API');
need(securityUi, 'regionalCountries', 'regional country editor');
need(appIndex, '/app/admin-regional-access.js', 'security extension UI loaded');

need(delivery, "text:'Thank you.'", 'exact Thank you button');
need(delivery, "callback_data:`dl:${gate.token}`", 'tracked download callback');
need(delivery, "callback_data:`dn:${gate.token}`", 'tracked donate callback');
need(delivery, "publication.download_gate_status!=='legacy'", 'legacy release fallback');
need(gate, 'eventType: string', 'reader event ledger');
need(gate, "asset.scan_status !== 'clean'", 'legacy fail-closed scan enforcement');
need(gate, 'telegram_file_id', 'Telegram file cache');
need(gate, 'publication_deliveries', 'per-user delivery ledger');

for (const token of [
  'scan_claimed_at TEXT',
  'scan_attempts INTEGER NOT NULL DEFAULT 0',
  'quarantined_at TEXT',
  'quarantine_reason TEXT',
  'CREATE TABLE IF NOT EXISTS asset_scanner_health',
]) need(m37, token, 'file security v2 migration');
need(assetSecurity, "'/internal/asset-scan/pending'", 'scanner pending queue');
need(assetSecurity, "'/internal/asset-scan/heartbeat'", 'scanner heartbeat');
need(assetSecurity, 'asset_scanner_health', 'scanner health persistence');
need(assetSecurity, "verdict IN ('clean','infected','suspicious')", 'failed verdicts not reused from cache');
need(assetSecurity, 'scan_claimed_at=NULL', 'scan claim release');
need(assetSecurity, 'quarantined_at=?', 'quarantine persistence');
need(assetSecurity, "crypto.subtle.digest('SHA-256'", 'asset SHA-256');
need(assetSecurity, 'file_scan_cache', 'scan hash cache');
need(assetSecurity, "'/internal/asset-scan/result'", 'scanner result endpoint');
need(assetSecurity, 'x-dollar-sha256', 'scanner content integrity hint');
need(assetSecurity, 'hashStoredAssets(publicationId, env)', 'post-upload R2 hashing');
need(filePreflight, 'Boolean(asset.quarantine_reason)', 'quarantine hold is absolute');
need(filePreflight, "runtimeFlag(env, 'asset_scan_enforcement'", 'optional CLEAN-only enforcement');
need(filePreflight, 'scannerHealth(env)', 'scanner health required when enforcing');
need(scanConfigGuard, "'scanner_not_ready'", 'cannot enable AV without scanner');
need(scanConfigGuard, "'scanner_backfill_incomplete'", 'cannot enable AV before protected backlog completes');
need(adminFileSecurity, "'/api/app/admin/security/scanner'", 'scanner admin endpoint');
need(adminFileSecurity, "action === 'rescan_asset'", 'manual rescan');
need(adminFileSecurity, "action === 'backfill'", 'scanner backfill');
forbid(entry, 'request.clone()', 'large multipart request clone');

need(scannerWrangler, '"instance_type": "standard-1"', 'ClamAV 4 GiB container');
need(scannerWrangler, '"max_instances": 1', 'single scanner container');
need(scannerWrangler, '"*/5 * * * *"', 'scanner wake schedule');
need(scannerWorker, "sleepAfter = '30s'", 'scanner scales to sleep');
need(scannerWorker, "getContainer(env.CLAMAV, 'primary')", 'stable scanner container');
need(scannerGo, 'zINSTREAM\\x00', 'ClamAV INSTREAM protocol');
need(scannerGo, 'sha256.New()', 'scanner-side stream hash');
need(scannerGo, 'maxAssetBytes', 'scanner stream size cap');
need(clamdConfig, 'TCPAddr 127.0.0.1', 'clamd only listens locally');
need(clamdConfig, 'StreamMaxLength 128M', 'clamd stream cap');
need(scannerStart, 'freshclam', 'signature refresh');
need(scannerDocker, 'FROM clamav/clamav:stable', 'official ClamAV image');
forbid(scannerDocker, 'EXPOSE 3310', 'raw clamd port exposure');

need(securityUi, 'ensureUsersNavigation', 'Users nav regression guard');
need(securityUi, 'data-admin-tools="users"', 'Users control center nav button');
need(securityUi, '/api/app/admin/security/scanner', 'scanner health UI');
need(securityUi, 'data-rescan-asset', 'manual scanner action UI');
new Function(securityUi);

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

console.log('Download/security audit passed: tracked downloads, regional verification, restored Users controls, scanner queue/heartbeat, ClamAV INSTREAM, quarantine, guarded CLEAN-only enforcement, cache safety, immutable covers, and admin observability are wired.');
