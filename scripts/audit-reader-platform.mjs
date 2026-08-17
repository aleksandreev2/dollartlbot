import { readFileSync } from 'node:fs';

const requiredFiles = [
  'migrations/0042_reader_library.sql',
  'migrations/0043_reader_download_policy.sql',
  'migrations/0044_distribution_fingerprints.sql',
  'migrations/0045_leak_incidents.sql',
  'src/download-gate.ts',
  'src/reader-library.ts',
  'src/reader-quota.ts',
  'src/reader-personalization.ts',
  'src/fingerprint/identity.ts',
  'src/fingerprint/epub.ts',
  'src/leak-checker.ts',
  'public/app/home-v2.js',
  'public/app/reader-title-ui.js',
];

const contents = new Map(requiredFiles.map(file => [file, readFileSync(file, 'utf8')]));

assertIncludes('migrations/0043_reader_download_policy.sql', 'PRIMARY KEY (day_key, user_id, submission_id)', 'daily quota must count unique titles');
assertIncludes('migrations/0043_reader_download_policy.sql', 'reader_daily_reservations', 'quota needs pre-delivery reservations');
assertIncludes('migrations/0044_distribution_fingerprints.sql', 'UNIQUE REFERENCES users(telegram_id)', 'distribution identity must map one-to-one to a reader');
assertIncludes('src/download-gate.ts', 'getSubscriptionState(user.id, env, telegram)', 'Boosty entitlement must be checked in delivery');
assertIncludes('src/download-gate.ts', 'reserveDailyNovel(env, user.id, submissionId)', 'private delivery must enforce reader quota');
assertIncludes('src/download-gate.ts', 'sendPersonalizedReaderAsset(userId, asset, env, telegram)', 'EPUB personalization must happen inside the canonical delivery path');
assertIncludes('src/reader-personalization.ts', "reader_personalized_epub_enabled', false", 'personalization rollout must default safe/off');
assertIncludes('src/reader-personalization.ts', "reader_fingerprint_fail_closed', false", 'fingerprint rollout must default fail-open');
assertIncludes('src/fingerprint/epub.ts', 'META-INF/dollartl.xml', 'EPUB must carry a machine-readable fingerprint');
assertIncludes('src/fingerprint/epub.ts', 'dollartl-notice.xhtml', 'EPUB must carry a visible distribution notice');
assertNotIncludes('src/fingerprint/epub.ts', 'telegram_id', 'raw Telegram IDs must never be embedded in EPUBs');
assertNotIncludes('src/fingerprint/epub.ts', 'username', 'usernames must never be embedded in EPUBs');
assertIncludes('public/app/home-v2.js', 'data-reader-title', 'home cards must open title details instead of Telegram posts');
assertNotIncludes('public/app/home-v2.js', 'openTelegramLink(link.href)', 'home cards must not route directly to Telegram releases');

console.log('Reader platform audit passed.');

function assertIncludes(file, needle, message) {
  if (!contents.get(file)?.includes(needle)) throw new Error(`${message}: ${file} missing ${needle}`);
}
function assertNotIncludes(file, needle, message) {
  if (contents.get(file)?.includes(needle)) throw new Error(`${message}: ${file} contains ${needle}`);
}
