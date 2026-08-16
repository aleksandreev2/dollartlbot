import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const file = path.resolve(process.cwd(), '.dev.vars');
if (!fs.existsSync(file)) {
  console.error('Missing .dev.vars. Create it with the normal bot secrets before configuring the scanner.');
  process.exit(1);
}

const source = fs.readFileSync(file, 'utf8');
const match = /^ASSET_SCANNER_TOKEN\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m.exec(source);
if (match?.[1] && !/replace|changeme|example/i.test(match[1])) {
  console.log('ASSET_SCANNER_TOKEN is already configured.');
  process.exit(0);
}

const token = crypto.randomBytes(32).toString('base64url');
const line = `ASSET_SCANNER_TOKEN="${token}"`;
let updated;
if (/^ASSET_SCANNER_TOKEN\s*=.*$/m.test(source)) {
  updated = source.replace(/^ASSET_SCANNER_TOKEN\s*=.*$/m, line);
} else {
  updated = `${source.replace(/\s*$/, '')}\n${line}\n`;
}
fs.writeFileSync(file, updated, { encoding: 'utf8', mode: 0o600 });
console.log('Generated ASSET_SCANNER_TOKEN in .dev.vars (value intentionally not printed).');
