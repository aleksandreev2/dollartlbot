import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const need = (source, token, label = token) => { if (!source.includes(token)) throw new Error(`Core reliability audit: ${label}`); };
const forbid = (source, token, label = token) => { if (source.includes(token)) throw new Error(`Core reliability audit forbidden: ${label}`); };

const migration = read('migrations/0040_core_reliability.sql');
const subscription = read('src/subscription.ts');
const policy = read('src/access-policy.ts');
const auth = read('src/miniapp-auth.ts');
const regionalDownload = read('src/regional-download-preflight.ts');
const alerts = read('src/production-alerts.ts');
const admin = read('src/admin-core-reliability.ts');
const autoBanAdmin = read('src/admin-channel-autoban.ts');
const configValidator = read('src/security-config-validator.ts');
const events = read('src/security-events.ts');
const entry = read('src/entry.ts');
const ui = read('public/app/admin-core-reliability.js');
const html = read('public/app/index.html');

for (const token of [
  'CREATE TABLE IF NOT EXISTS subscription_entitlement_cache',
  'CREATE TABLE IF NOT EXISTS security_events',
  'CREATE TABLE IF NOT EXISTS incident_alert_state',
  "('security_alerts_enabled','1'",
  "('subscription_stale_positive_minutes','30'",
]) need(migration, token, 'migration state');

for (const token of [
  'memoryCache',
  'subscription_entitlement_cache',
  'stale_until',
  'durableBeforeCheck?.subscriber === 1',
  'getChatMember(env.BOOSTY_GROUP_ID, userId)',
  'invalidateSubscriptionCache',
]) need(subscription, token, 'shared Boosty entitlement cache');

for (const token of [
  "export type Capability = 'use_bot' | 'miniapp' | 'suggest_title' | 'download'",
  "'manual_block'",
  "'channel_leave_banned'",
  "'regional_restricted'",
  "'regional_verification_required'",
  "'membership_required'",
  'checkRegionalDownloadAccess(userId, env, telegram)',
  'checkBotAccess(userId, env, telegram',
  "make(userId, 'regional_restricted', true, false, true, false",
  "make(userId, 'regional_verification_required', true, false, true, false",
  "make(userId, 'allowed', true, true, true, true",
]) need(policy, token, 'capability policy matrix');

need(auth, 'evaluateAccessPolicy(telegramUser.id, env, telegram', 'Mini App canonical policy');
need(auth, 'policy.capabilities.miniapp', 'Mini App capability enforcement');
need(regionalDownload, 'evaluateAccessPolicy(message.from.id, env, telegram', 'download canonical policy');
need(regionalDownload, 'policy.capabilities.download', 'download capability enforcement');

for (const token of [
  'runProductionSecurityAlerts',
  'incident_alert_state',
  'security_alert_cooldown_minutes',
  "key: 'scanner_unhealthy'",
  "key: 'regional_without_private_delivery'",
  "key: 'autoban_failures'",
  'pruneSecurityEvents(env)',
  'SELECT id FROM security_events WHERE created_at<? ORDER BY id LIMIT 500',
]) need(alerts, token, 'production alerts and bounded retention');
need(entry, 'runProductionSecurityAlerts(env, telegram)', 'scheduled production alerts');

for (const token of [
  'guardSecurityConfiguration',
  'regional_requires_private_delivery',
  "runtimeFlag(env, 'regional_routing_enabled', true)",
]) need(configValidator + entry, token, 'security configuration validator');
for (const token of [
  "body.enabled === true",
  'botRestrictionReadiness(env, telegram)',
  'autoban_permission_missing',
  'bot_can_restrict_members',
]) need(autoBanAdmin, token, 'channel auto-ban configuration validator');

for (const token of [
  '/api/app/admin/security/core-reliability',
  '/security-timeline',
  'evaluateAccessPolicy(userId, env, telegram)',
  'recentUserSecurityEvents',
]) need(admin, token, 'admin reliability APIs');
need(events, 'INSERT INTO security_events', 'security event ledger');
need(ui, '/api/app/admin/security/core-reliability', 'admin health panel');
need(ui, '/security-timeline', 'user security snapshot');
need(ui, 'waitForUserProfile', 'deterministic user snapshot rendering');
need(html, '/app/admin-core-reliability.js?v=20260816-core1', 'admin health asset');

forbid(subscription, 'BOOSTY_SUBSCRIPTION_URL', 'entitlement checks must use group membership, not purchase URL');
new Function(ui);

const expectedMatrix = [
  ['normal', true, true, true],
  ['regional', false, true, false],
  ['regional+boosty', true, true, true],
  ['admin', true, true, true],
  ['manual-block', false, false, false],
  ['leave-ban', false, false, false],
  ['unknown-region', false, true, false],
];
if (expectedMatrix.length !== 7) throw new Error('Core reliability audit: policy matrix incomplete');

console.log('Core Reliability v1 audit passed: centralized capabilities, shared Boosty cache, fail-safe policy matrix, pre-save config validation, incident alerts, bounded security ledger and admin health visibility are wired.');
