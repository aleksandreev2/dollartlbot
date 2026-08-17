import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const appDir = path.join(root, 'public', 'app');
const source = path.join(root, 'node_modules', 'lucide', 'dist', 'umd', 'lucide.min.js');
const destination = path.join(appDir, 'vendor', 'lucide.min.js');
const indexPath = path.join(appDir, 'index.html');
const manifestPath = path.join(appDir, 'build.json');
const BUILD_PARAM = 'dtl_build';

if (!fs.existsSync(source)) {
  throw new Error('Missing lucide@1.27.0. Run npm install before Wrangler build/deploy.');
}

const content = fs.readFileSync(source, 'utf8');
if (!content.includes('@license lucide v1.27.0') || !content.includes('ISC')) {
  throw new Error('Unexpected Lucide vendor payload; expected lucide v1.27.0 ISC build.');
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
const current = fs.existsSync(destination) ? fs.readFileSync(destination, 'utf8') : null;
if (current !== content) fs.writeFileSync(destination, content);

const files = walk(appDir)
  .filter(file => path.resolve(file) !== path.resolve(manifestPath))
  .sort((a, b) => a.localeCompare(b));
const hash = crypto.createHash('sha256');
for (const file of files) {
  const relative = path.relative(appDir, file).replaceAll(path.sep, '/');
  hash.update(relative);
  hash.update('\0');
  if (path.resolve(file) === path.resolve(indexPath)) {
    hash.update(normalizeIndex(fs.readFileSync(file, 'utf8')));
  } else {
    hash.update(fs.readFileSync(file));
  }
  hash.update('\0');
}
const buildId = hash.digest('hex').slice(0, 16);

const originalIndex = fs.readFileSync(indexPath, 'utf8');
const builtIndex = stampIndex(originalIndex, buildId);
if (builtIndex !== originalIndex) fs.writeFileSync(indexPath, builtIndex);

const manifest = `${JSON.stringify({ build_id: buildId, asset_count: files.length })}\n`;
const currentManifest = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : null;
if (currentManifest !== manifest) fs.writeFileSync(manifestPath, manifest);

console.log(`Prepared ${path.relative(root, destination)} from pinned lucide@1.27.0.`);
console.log(`Prepared Mini App build ${buildId} across ${files.length} assets.`);

function walk(directory) {
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function normalizeIndex(value) {
  let html = ensureBuildMeta(value, '__BUILD__');
  html = rewriteLocalAppAssets(html, '__BUILD__');
  return html;
}

function stampIndex(value, buildId) {
  let html = ensureBuildMeta(value, buildId);
  html = rewriteLocalAppAssets(html, buildId);
  return html;
}

function ensureBuildMeta(value, buildId) {
  const pattern = /<meta\s+name=["']dtl-build["']\s+content=["'][^"']*["']\s*\/?>/i;
  const tag = `<meta name="dtl-build" content="${buildId}">`;
  if (pattern.test(value)) return value.replace(pattern, tag);
  return value.replace(/(<meta\s+name=["']theme-color["'][^>]*>)/i, `$1\n  ${tag}`);
}

function rewriteLocalAppAssets(value, buildId) {
  return value.replace(/((?:src|href)=["'])(\/app\/[^"']+)(["'])/g, (match, prefix, assetUrl, suffix) => {
    try {
      const parsed = new URL(assetUrl, 'https://dollartl.invalid');
      parsed.searchParams.delete(BUILD_PARAM);
      parsed.searchParams.append(BUILD_PARAM, buildId);
      return `${prefix}${parsed.pathname}${parsed.search}${parsed.hash}${suffix}`;
    } catch {
      return match;
    }
  });
}
