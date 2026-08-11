import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import { runBroadcastMaintenanceWithLease } from './broadcast-runner';
import { errorText } from './db';
import { runNotificationMaintenance } from './notifications';
import { runPublicationDeliveryMaintenance } from './publication-delivery';
import { normalizeQueuePositions } from './queue';
import { retryPendingAdminDeliveries } from './submissions';
import { isActiveChatMember, type TelegramChatMember, type TelegramClient } from './telegram';

const STUCK_PUBLISHING_MS = 10 * 60 * 1000;
const MANUAL_NOTIFICATION_RETRY_LIMIT = 100;
const MANUAL_BROADCAST_RETRY_LIMIT = 250;

type HealthAction =
  | 'run_maintenance'
  | 'normalize_queue'
  | 'retry_notifications'
  | 'retry_broadcasts'
  | 'retry_publications'
  | 'retry_admin_deliveries';

type TelegramChat = {
  id: number;
  type: string;
  title?: string;
  username?: string;
  linked_chat_id?: number;
};

type BotMember = TelegramChatMember & { can_post_messages?: boolean };

export async function handleAdminHealthRequest(
  request: Request,
  env: Env,
  telegram: TelegramClient,
): Promise<Response | null> {
  const url = new URL(request.url);
  const isHealth = request.method === 'GET' && url.pathname === '/api/app/admin/health';
  const isAction = request.method === 'POST' && url.pathname === '/api/app/admin/health/action';
  if (!isHealth && !isAction) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  try {
    if (isHealth) return miniAppJson(await buildHealthSnapshot(env, telegram));

    const body = await readJson<{ action?: string }>(request);
    const action = String(body.action || '') as HealthAction;
    if (![
      'run_maintenance',
      'normalize_queue',
      'retry_notifications',
      'retry_broadcasts',
      'retry_publications',
      'retry_admin_deliveries',
    ].includes(action)) {
      return miniAppJsonError('invalid_health_action', 'Unknown health action.', 400);
    }

    const result = await runHealthAction(action, auth.telegramUser.id, env, telegram);
    return miniAppJson({ ok: true, action, result, ...(await buildHealthSnapshot(env, telegram)) });
  } catch (error) {
    console.error(JSON.stringify({
      event: 'admin_health_failed',
      path: url.pathname,
      error: errorText(error),
    }));
    return miniAppJsonError('health_action_failed', errorText(error) || 'Health operation failed.', 500);
  }
}

async function buildHealthSnapshot(env: Env, telegram: TelegramClient) {
  const now = new Date();
  const nowIso = now.toISOString();
  const stuckBefore = new Date(now.getTime() - STUCK_PUBLISHING_MS).toISOString();

  const [
    queue,
    adminDelivery,
    publication,
    notification,
    progress,
    lease,
    publicationIssues,
    directFailures,
    broadcastFailures,
    recentLogs,
    settings,
  ] = await Promise.all([
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status='accepted' AND queue_status='queued' THEN 1 ELSE 0 END) AS queued,
        SUM(CASE WHEN status='accepted' AND queue_status='in_progress' THEN 1 ELSE 0 END) AS in_progress,
        SUM(CASE WHEN status='accepted' AND queue_status='completed' THEN 1 ELSE 0 END) AS completed,
        (SELECT COUNT(*) FROM submissions WHERE status='accepted' AND queue_status='queued' AND (queue_position IS NULL OR queue_position < 1)) AS invalid_positions,
        (SELECT COUNT(*) FROM (
          SELECT queue_position FROM submissions
          WHERE status='accepted' AND queue_status='queued' AND queue_position IS NOT NULL
          GROUP BY queue_position HAVING COUNT(*) > 1
        )) AS duplicate_positions,
        (SELECT CASE
          WHEN COUNT(*)=0 THEN 0
          WHEN MIN(queue_position)=1 AND MAX(queue_position)=COUNT(*) AND COUNT(DISTINCT queue_position)=COUNT(*) THEN 0
          ELSE 1 END
         FROM submissions WHERE status='accepted' AND queue_status='queued') AS ordering_issue
      FROM submissions
    `).first<Record<string, number | null>>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS pending
      FROM submissions
      WHERE admin_summary_sent=0 OR admin_file_sent=0
    `).first<{ pending: number }>(),
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed_main,
        SUM(CASE WHEN status='publishing' AND updated_at < ? THEN 1 ELSE 0 END) AS stuck_publishing,
        SUM(CASE WHEN status='published' AND comments_check_status='needs_attention' THEN 1 ELSE 0 END) AS comments_attention,
        SUM(CASE WHEN bot_comment_status='failed' THEN 1 ELSE 0 END) AS bot_comment_failed,
        (SELECT COUNT(*) FROM publication_assets WHERE delivery_status='failed') AS asset_failed
      FROM publications
    `).bind(stuckBefore).first<Record<string, number | null>>(),
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN telegram_status='failed' THEN 1 ELSE 0 END) AS direct_failed,
        SUM(CASE WHEN telegram_status='retry' THEN 1 ELSE 0 END) AS direct_retry,
        SUM(CASE WHEN telegram_status IN ('queued','retry') AND telegram_next_attempt_at IS NOT NULL AND telegram_next_attempt_at <= ? THEN 1 ELSE 0 END) AS direct_due,
        (SELECT COUNT(*) FROM broadcasts WHERE status IN ('queued','running')) AS broadcasts_active,
        (SELECT COUNT(*) FROM broadcasts WHERE failed_count > 0) AS broadcasts_with_failures,
        (SELECT COUNT(*) FROM broadcast_recipients WHERE status='failed') AS broadcast_recipient_failed,
        (SELECT COUNT(*) FROM broadcast_recipients WHERE status IN ('queued','retry') AND next_attempt_at <= ?) AS broadcast_due
      FROM user_notifications
    `).bind(nowIso, nowIso).first<Record<string, number | null>>(),
    env.DB.prepare(`
      SELECT COUNT(*) AS due
      FROM submission_notification_state
      WHERE pending_progress_chapter IS NOT NULL
        AND next_progress_notify_at IS NOT NULL
        AND next_progress_notify_at <= ?
    `).bind(nowIso).first<{ due: number }>(),
    env.DB.prepare(`
      SELECT name, owner_token, expires_at, updated_at
      FROM runtime_leases
      WHERE name='release_broadcast_runner'
      LIMIT 1
    `).first<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT p.id,p.internal_title,p.status,p.error_text,p.comments_check_status,p.bot_comment_status,
             p.updated_at,p.published_at,p.telegram_deleted_at,
             SUM(CASE WHEN a.delivery_status='failed' THEN 1 ELSE 0 END) AS failed_assets
      FROM publications p
      LEFT JOIN publication_assets a ON a.publication_id=p.id
      WHERE p.status='failed'
         OR (p.status='publishing' AND p.updated_at < ?)
         OR p.comments_check_status='needs_attention'
         OR p.bot_comment_status='failed'
         OR EXISTS (SELECT 1 FROM publication_assets x WHERE x.publication_id=p.id AND x.delivery_status='failed')
      GROUP BY p.id
      ORDER BY p.updated_at DESC,p.id DESC
      LIMIT 30
    `).bind(stuckBefore).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id,user_id,type,title,telegram_status,telegram_attempts,telegram_last_error,
             telegram_next_attempt_at,created_at
      FROM user_notifications
      WHERE telegram_status='failed'
      ORDER BY id DESC
      LIMIT 30
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT br.broadcast_id,br.user_id,br.attempts,br.last_error,br.updated_at,
             b.title,b.status AS broadcast_status
      FROM broadcast_recipients br
      JOIN broadcasts b ON b.id=br.broadcast_id
      WHERE br.status='failed'
      ORDER BY br.updated_at DESC,br.broadcast_id DESC
      LIMIT 30
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id,publication_id,level,event,message,details,created_at
      FROM publication_logs
      WHERE level IN ('error','warning')
      ORDER BY id DESC
      LIMIT 40
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT key,value FROM app_settings
      WHERE key IN ('publish_channel_id','discussion_chat_id')
    `).all<{ key: string; value: string }>(),
  ]);

  const settingsMap = Object.fromEntries(settings.results.map((row) => [row.key, row.value]));
  const telegramHealth = await inspectTelegram(
    telegram,
    String(settingsMap.publish_channel_id || ''),
    String(settingsMap.discussion_chat_id || ''),
  );

  const queueHealth = {
    pending: number(queue?.pending),
    queued: number(queue?.queued),
    in_progress: number(queue?.in_progress),
    completed: number(queue?.completed),
    invalid_positions: number(queue?.invalid_positions),
    duplicate_positions: number(queue?.duplicate_positions),
    ordering_issue: number(queue?.ordering_issue),
    admin_delivery_pending: Number(adminDelivery?.pending || 0),
  };
  const publicationHealth = {
    failed_main: number(publication?.failed_main),
    stuck_publishing: number(publication?.stuck_publishing),
    comments_attention: number(publication?.comments_attention),
    bot_comment_failed: number(publication?.bot_comment_failed),
    asset_failed: number(publication?.asset_failed),
  };
  const notificationHealth = {
    direct_failed: number(notification?.direct_failed),
    direct_retry: number(notification?.direct_retry),
    direct_due: number(notification?.direct_due),
    broadcasts_active: number(notification?.broadcasts_active),
    broadcasts_with_failures: number(notification?.broadcasts_with_failures),
    broadcast_recipient_failed: number(notification?.broadcast_recipient_failed),
    broadcast_due: number(notification?.broadcast_due),
    progress_due: Number(progress?.due || 0),
  };

  const critical =
    !telegramHealth.bot.ok
    || publicationHealth.stuck_publishing > 0
    || publicationHealth.failed_main > 0;
  const warning =
    queueHealth.invalid_positions > 0
    || queueHealth.duplicate_positions > 0
    || queueHealth.ordering_issue > 0
    || queueHealth.admin_delivery_pending > 0
    || publicationHealth.comments_attention > 0
    || publicationHealth.bot_comment_failed > 0
    || publicationHealth.asset_failed > 0
    || notificationHealth.direct_failed > 0
    || notificationHealth.broadcast_recipient_failed > 0
    || !telegramHealth.channel.ok
    || (telegramHealth.channel.configured && !telegramHealth.discussion.ok);

  return {
    generated_at: nowIso,
    status: critical ? 'critical' : warning ? 'warning' : 'healthy',
    queue: queueHealth,
    publications: publicationHealth,
    notifications: notificationHealth,
    telegram: telegramHealth,
    lease: lease || null,
    issues: {
      publications: publicationIssues.results,
      direct_notifications: directFailures.results,
      broadcast_recipients: broadcastFailures.results,
      publication_logs: recentLogs.results,
    },
  };
}

async function runHealthAction(
  action: HealthAction,
  adminId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<Record<string, unknown>> {
  const now = new Date().toISOString();
  const result: Record<string, unknown> = {};

  if (action === 'normalize_queue') {
    await normalizeQueuePositions(env);
    result.normalized = true;
  } else if (action === 'retry_notifications') {
    const reset = await env.DB.prepare(`
      UPDATE user_notifications
      SET telegram_status='retry',telegram_next_attempt_at=?
      WHERE id IN (
        SELECT id FROM user_notifications
        WHERE telegram_status='failed'
        ORDER BY id DESC
        LIMIT ?
      )
    `).bind(now, MANUAL_NOTIFICATION_RETRY_LIMIT).run();
    result.requeued = Number(reset.meta.changes || 0);
    await runNotificationMaintenance(env, telegram);
  } else if (action === 'retry_broadcasts') {
    const reset = await env.DB.prepare(`
      UPDATE broadcast_recipients
      SET status='retry',next_attempt_at=?,updated_at=?
      WHERE rowid IN (
        SELECT rowid FROM broadcast_recipients
        WHERE status='failed'
        ORDER BY updated_at DESC
        LIMIT ?
      )
    `).bind(now, now, MANUAL_BROADCAST_RETRY_LIMIT).run();
    result.requeued = Number(reset.meta.changes || 0);
    if (Number(reset.meta.changes || 0) > 0) {
      await env.DB.prepare(`
        UPDATE broadcasts
        SET status='running',completed_at=NULL
        WHERE id IN (
          SELECT DISTINCT broadcast_id FROM broadcast_recipients WHERE status='retry'
        )
      `).run();
    }
    result.runner_claimed = await runBroadcastMaintenanceWithLease(env, telegram, 12);
  } else if (action === 'retry_publications') {
    await runPublicationDeliveryMaintenance(env, telegram, 25);
    result.delivery_maintenance = true;
  } else if (action === 'retry_admin_deliveries') {
    await retryPendingAdminDeliveries(env, telegram);
    result.admin_delivery_maintenance = true;
  } else {
    await normalizeQueuePositions(env);
    await retryPendingAdminDeliveries(env, telegram);
    await runNotificationMaintenance(env, telegram);
    result.broadcast_runner_claimed = await runBroadcastMaintenanceWithLease(env, telegram, 12);
    await runPublicationDeliveryMaintenance(env, telegram, 25);
    result.maintenance = true;
  }

  await env.DB.prepare(`
    INSERT INTO admin_audit_log (admin_user_id,action,target_type,target_id,details,created_at)
    VALUES (?,?,'system','operations_health',?,?)
  `).bind(adminId, `health_${action}`, JSON.stringify(result), new Date().toISOString()).run().catch(() => undefined);
  return result;
}

async function inspectTelegram(
  telegram: TelegramClient,
  channelSetting: string,
  discussionSetting: string,
) {
  const result = {
    bot: { ok: false, message: 'Telegram bot is unavailable.', id: null as number | null, username: null as string | null },
    channel: {
      ok: false,
      configured: Boolean(channelSetting.trim()),
      message: channelSetting.trim() ? 'Channel check failed.' : 'Publication channel is not configured.',
      id: null as number | null,
      title: null as string | null,
      linked_chat_id: null as number | null,
      can_post: false,
    },
    discussion: {
      ok: !channelSetting.trim(),
      configured: Boolean(discussionSetting.trim()),
      message: channelSetting.trim() ? 'Discussion group check is pending.' : 'No publication channel configured.',
      id: null as number | null,
      title: null as string | null,
      matches_linked_chat: false,
      bot_member: false,
    },
  };

  let me: { id: number; username?: string };
  try {
    me = await telegram.call<{ id: number; username?: string }>('getMe', {});
    result.bot = { ok: true, message: 'Telegram API responds.', id: me.id, username: me.username || null };
  } catch (error) {
    result.bot.message = friendly(error);
    return result;
  }

  if (!channelSetting.trim()) return result;

  let channel: TelegramChat;
  try {
    channel = await telegram.call<TelegramChat>('getChat', { chat_id: normalizeChatId(channelSetting) });
  } catch (error) {
    result.channel.message = friendly(error);
    return result;
  }

  if (channel.type !== 'channel') {
    result.channel.message = `Configured publication target is ${channel.type}, not a channel.`;
    result.channel.id = channel.id;
    return result;
  }

  let channelMember: BotMember | null = null;
  try {
    channelMember = await telegram.call<BotMember>('getChatMember', { chat_id: channel.id, user_id: me.id });
  } catch (error) {
    result.channel.message = `Could not verify bot permissions: ${friendly(error)}`;
  }
  const canPost = channelMember?.status === 'creator'
    || (channelMember?.status === 'administrator' && channelMember.can_post_messages !== false);
  result.channel = {
    ok: Boolean(canPost),
    configured: true,
    message: canPost ? 'Channel is reachable and bot can publish.' : result.channel.message || 'Bot cannot publish to the channel.',
    id: channel.id,
    title: channel.title || channel.username || null,
    linked_chat_id: Number(channel.linked_chat_id) || null,
    can_post: Boolean(canPost),
  };

  if (!channel.linked_chat_id) {
    result.discussion = {
      ok: false,
      configured: Boolean(discussionSetting.trim()),
      message: 'Channel has no linked discussion group.',
      id: null,
      title: null,
      matches_linked_chat: false,
      bot_member: false,
    };
    return result;
  }

  try {
    const discussion = await telegram.call<TelegramChat>('getChat', { chat_id: channel.linked_chat_id });
    let member: TelegramChatMember | null = null;
    try {
      member = await telegram.call<TelegramChatMember>('getChatMember', { chat_id: discussion.id, user_id: me.id });
    } catch {}
    const active = Boolean(member && isActiveChatMember(member));
    const configuredId = numericChatId(discussionSetting);
    const matches = configuredId === null || configuredId === discussion.id;
    result.discussion = {
      ok: ['group', 'supergroup'].includes(discussion.type) && active && matches,
      configured: Boolean(discussionSetting.trim()),
      message: !active
        ? 'Bot is not an active member of the linked discussion group.'
        : !matches
          ? 'Saved discussion_chat_id differs from Telegram linked_chat_id.'
          : 'Discussion group is reachable and bot membership is active.',
      id: discussion.id,
      title: discussion.title || discussion.username || null,
      matches_linked_chat: matches,
      bot_member: active,
    };
  } catch (error) {
    result.discussion = {
      ok: false,
      configured: Boolean(discussionSetting.trim()),
      message: friendly(error),
      id: Number(channel.linked_chat_id) || null,
      title: null,
      matches_linked_chat: false,
      bot_member: false,
    };
  }

  return result;
}

function numericChatId(value: string): number | null {
  const text = String(value || '').trim();
  if (!/^-?\d+$/.test(text)) return null;
  const valueNumber = Number(text);
  return Number.isSafeInteger(valueNumber) ? valueNumber : null;
}

function normalizeChatId(value: string): number | string {
  const text = String(value || '').trim();
  if (/^-?\d+$/.test(text)) {
    const valueNumber = Number(text);
    if (Number.isSafeInteger(valueNumber)) return valueNumber;
  }
  return text.startsWith('@') ? text : `@${text}`;
}

function number(value: number | null | undefined): number {
  return Number(value || 0);
}

function friendly(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/^Telegram\s+\w+\s+failed:\s*/i, '')
    .trim() || 'Unknown Telegram error.';
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    return {} as T;
  }
}
