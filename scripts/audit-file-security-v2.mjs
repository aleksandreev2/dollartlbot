import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const entry = read('src/entry.ts');
const statusApi = read('src/asset-scanner-status.ts');
const assetSecurity = read('src/asset-security.ts');
const preflight = read('src/file-download-preflight.ts');
const guard = read('src/asset-security-config-guard.ts');
const scannerWorker = read('scanner/src/index.ts');
const scannerConfig = read('scanner/wrangler.jsonc');
const dockerfile = read('scanner/container/Dockerfile');
const clamd = read('scanner/container/clamd.conf');
const start = read('scanner/container/start.sh');
const scannerGo = read('scanner/container/main.go');
const scannerWorkflow = read('.github/workflows/scanner-ci.yml');
const rootPackage = read('package.json');
const secretHelper = read('scripts/ensure-scanner-token.mjs');
const usersTest = read('tests/admin-users-presence.spec.mjs');
const adminExtension = read('public/app/admin-regional-access.js');

function need(source, token, label = token) {
  if (!source.includes(token)) throw new Error(`File Security v2 audit: missing ${label}`);
}
function forbid(source, token, label = token) {
  if (source.includes(token)) throw new Error(`File Security v2 audit: forbidden ${label}`);
}
function before(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) throw new Error(`File Security v2 audit: invalid order ${label}`);
}

need(statusApi, "'/internal/asset-scan/status'", 'cheap queue status endpoint');
need(statusApi, 'runnable', 'runnable scan count');
need(entry, 'handleAssetScannerStatusRequest(request, env)', 'scanner status route');
need(scannerWorker, '/internal/asset-scan/status', 'scanner checks queue before container');
before(scannerWorker, '/internal/asset-scan/status', "getContainer(env.CLAMAV, 'primary')", 'empty queue must not wake Container');
need(scannerWorker, 'if (Number(queueData.runnable || 0) <= 0) return;', 'empty queue fast exit');

need(preflight, 'Boolean(asset.quarantine_reason)', 'quarantine hold');
need(preflight, "asset.scan_status === 'infected'", 'infected absolute block');
need(preflight, "asset.scan_status === 'suspicious'", 'suspicious absolute block');
need(preflight, "runtimeFlag(env, 'asset_scan_enforcement'", 'CLEAN-only feature flag');
before(preflight, "const unfinished = assets.results.some", 'const health = await scannerHealth(env)', 'clean files bypass sleeping scanner health');
need(preflight, 'if (!unfinished) return false;', 'clean verdict remains deliverable while Container sleeps');

need(guard, 'ACTIVATION_HEALTH_MAX_AGE_MS', 'idle scanner activation window');
need(guard, "'scanner_backfill_incomplete'", 'backfill activation guard');
need(assetSecurity, "verdict IN ('clean','infected','suspicious')", 'failed verdicts excluded from cache');
need(assetSecurity, 'quarantined_at=?', 'quarantine persistence');
need(assetSecurity, 'scan_claimed_at=NULL', 'lease release');

need(scannerConfig, '"instance_type": "standard-1"', '4 GiB scanner profile');
need(scannerConfig, '"max_instances": 1', 'single scanner instance');
need(scannerWorker, "sleepAfter = '30s'", 'Container sleeps after work');
need(clamd, 'TCPAddr 127.0.0.1', 'clamd loopback binding');
need(clamd, 'StreamMaxLength 128M', 'clamd input cap');
need(scannerGo, 'zINSTREAM\\x00', 'ClamAV INSTREAM');
need(scannerGo, 'sha256.New()', 'stream SHA-256');
need(scannerGo, 'maxRunDuration', 'bounded scanner run');
need(start, 'freshclam --stdout || true', 'signature refresh on cold start');
need(start, 'freshclam -d', 'background signature updater');
need(dockerfile, 'FROM clamav/clamav:stable', 'official ClamAV image');
forbid(dockerfile, 'EXPOSE 3310', 'raw clamd exposure');

need(secretHelper, "path.join(scannerDir, '.dev.vars')", 'scanner-only secret file');
need(secretHelper, '`ASSET_SCANNER_TOKEN="${token}"\\n`', 'only scanner token copied');
forbid(secretHelper, 'TELEGRAM_BOT_TOKEN=', 'Telegram token copied into scanner secret file');
need(scannerWorkflow, 'docker build -t dollartlbot-clamav-scanner:ci .', 'Docker image build CI');
need(scannerWorkflow, 'Smoke test live ClamAV container', 'live container startup CI');

need(adminExtension, 'ensureUsersNavigation', 'Users navigation recovery');
need(adminExtension, 'Пользователи', 'Users navigation label');
need(usersTest, 'Users navigation is restored', 'Users browser regression test');
need(rootPackage, 'tests/admin-users-presence.spec.mjs', 'Users test runs in browser suite');

console.log('File Security v2 audit passed: lazy scanner wake, quarantine, CLEAN-only delivery, cache safety, isolated secrets, live ClamAV CI, and Users navigation recovery are enforced.');
