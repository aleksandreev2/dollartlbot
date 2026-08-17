import fs from 'node:fs';

const indexUrl = new URL('../public/app/index.html', import.meta.url);
const original = fs.readFileSync(indexUrl, 'utf8');
const normalized = original.replace(/((?:src|href)=["'])(\/app\/[^"']+)(["'])/g, (match, prefix, assetUrl, suffix) => {
  try {
    const parsed = new URL(assetUrl, 'https://dollartl.invalid');
    parsed.searchParams.delete('dtl_build');
    return `${prefix}${parsed.pathname}${parsed.search}${parsed.hash}${suffix}`;
  } catch {
    return match;
  }
});

try {
  if (normalized !== original) fs.writeFileSync(indexUrl, normalized);
  await import('./audit-miniapp-i18n-v2.mjs');
} finally {
  if (normalized !== original) fs.writeFileSync(indexUrl, original);
}
