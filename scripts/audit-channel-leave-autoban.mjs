import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const policy = read('src/channel-leave-autoban.ts');
const admin = read('src/admin-channel-autoban.ts');
const adminUi = read('public/app/admin-regional-access.js');
const entry = read('src/entry.ts');
const migration = read('migrations/0038_channel_leave_autoban.sql');
const configureBot = read('scripts/configure-bot.mjs');

function need(source, token, label = token) {
  if (!source.includes(token)) throw new Error(`Channel leave autoban audit: missing ${label}`);
}
function before(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) throw new Error(`Channel leave autoban audit: invalid order ${label}`);
}

need(migration, 'channel_leave_auto_bans', 'durable autoban table');
need(migration, "('channel_leave_autoban_enabled','1')", 'autoban enabled default');
need(migration, "('channel_leave_autoban_boosty_exempt','1')", 'Boosty exemption default');
need(migration, 'next_attempt_at', 'durable retry schedule');

need(policy, "update.new_chat_member.status !== 'left'", 'left-only trigger');
need(policy, 'isActiveChatMember(update.old_chat_member)', 'must have been an active member');
need(policy, 'update.from.id !== user.id', 'self-leave actor verification');
need(policy, "['creator', 'administrator'].includes(update.old_chat_member.status)", 'Telegram administrator exemption');
need(policy, 'user.is_bot || isAdmin(user.id, env)', 'bot/Dollar TL admin exemption');
need(policy, "runtimeFlag(env, 'channel_leave_autoban_boosty_exempt'", 'Boosty exemption flag');
need(policy, 'subscription.verificationError', 'fail-safe entitlement retry');
need(policy, "telegram.call<boolean>('banChatMember'", 'Telegram channel blacklist call');
need(policy, "telegram.call<boolean>('unbanChatMember'", 'manual Telegram unban call');
need(policy, 'only_if_banned: true', 'safe unban semantics');
need(policy, 'runChannelLeaveAutoBanMaintenance', 'durable retry maintenance');
need(policy, "status='banned'", 'successful ban persistence');
need(policy, "status=?,attempts=?,next_attempt_at=?", 'retry persistence');
need(policy, "VALUES (?,?,?,?,?,'pending'", 'pending row persisted before external ban');
need(policy, 'ctx.waitUntil(attempt)', 'slow ban attempt is off webhook critical path');
before(policy, "VALUES (?,?,?,?,?,'pending'", 'ctx.waitUntil(attempt)', 'durable leave must be written before background handoff');

need(entry, 'handleChannelLeaveAutoBan(update.chat_member, env, telegram, ctx)', 'production webhook wiring');
need(entry, 'runChannelLeaveAutoBanMaintenance(env, telegram, 20)', 'production cron retry wiring');
need(entry, 'handleAdminChannelAutoBanRequest(', 'admin route wiring');
need(entry, 'await Promise.all([', 'scheduled work runs concurrently');
before(
  entry,
  'handleAccessChatMemberUpdate(update.chat_member, env)',
  'handleChannelLeaveAutoBan(update.chat_member, env, telegram, ctx)',
  'access revocation must happen before permanent channel ban',
);

need(admin, "'/api/app/admin/security/channel-autobans'", 'admin API route');
need(admin, "body.action === 'unban'", 'manual unban action');
need(admin, "body.action === 'retry'", 'manual retry action');
need(admin, "body.action === 'config'", 'runtime policy configuration');
need(admin, 'bot_can_restrict_members', 'Telegram permission diagnostics');
need(admin, 'delivered_files_before_leave', 'download-before-leave correlation');
need(admin, 'last_download_at', 'last delivery timestamp correlation');

need(adminUi, 'Channel leave auto-ban', 'visible security panel');
need(adminUi, 'data-channel-unban', 'visible manual unban control');
need(adminUi, 'data-channel-retry', 'visible manual retry control');
need(adminUi, 'channelAutoBanBoostyExempt', 'visible Boosty exemption control');
need(adminUi, 'delivered_files_before_leave', 'visible download-before-leave count');

need(configureBot, "'chat_member'", 'chat_member webhook delivery');

console.log('Channel leave autoban audit passed: verified self-leaves are durably recorded then blacklisted, admins/Boosty are protected, retries are durable, download history is correlated, and manual recovery is available.');
