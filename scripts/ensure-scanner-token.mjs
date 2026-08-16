import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const rootFile = path.resolve(process.cwd(), '.dev.vars');
const scannerDir = path.resolve(process.cwd(), 'scanner');
const scannerFile = path.join(scannerDir, '.dev.vars');
if (!fs.existsSync(rootFile)) {
  console.error('Missing .dev.vars. Create it with the normal bot secrets before configuring the scanner.');
  process.exit(1);
}

const source = fs.readFileSync(rootFile, 'utf8');
const match = /^ASSET_SCANNER_TOKEN\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(source);
let token = match?.[1]?.trim() || '';
let updated = source;
if (!token || /replace|changeme|example/i.test(token)) {
  token = crypto.randomBytes(32).toString('base64url');
  const line = `ASSET_SCANNER_TOKEN="${token}"`;
  if (/^ASSET_SCANNER_TOKEN\s*=.*$/m.test(source)) {
    updated = source.replace(/^ASSET_SCANNER_TOKEN\s*=.*$/m, line);
  } else {
    updated = `${source.replace(/\s*$/, '')}\n${line}\n`;
  }
  fs.writeFileSync(rootFile, updated, { encoding: 'utf8', mode: 0o600 });
  console.log('Generated ASSET_SCANNER_TOKEN in .dev.vars (value intentionally not printed).');
} else {
  console.log('ASSET_SCANNER_TOKEN is already configured in .dev.vars.');
}

fs.mkdirSync(scannerDir, { recursive: true });
fs.writeFileSync(scannerFile, `ASSET_SCANNER_TOKEN="${token}"\n`, { encoding: 'utf8', mode: 0o600 });
console.log('Synced scanner/.dev.vars with scanner token only.');
