import { errorText } from './db';
import { buildPublicationGateMessage } from './download-gate';
import { getRuntimeSetting, runtimeFlag } from './runtime-settings';
import type { TelegramClient } from './telegram';

const SAFE_BOT_DELETE_WINDOW_MS = 46 * 60 * 60_000;

type LegacyPublication = {
  id: number;
  internal_title: string;
  published_at: string | null;
  discussion_message_id: number | null;
  download_gate_status: string;
  telegram_deleted_at: string | null;
  add_bot_comment: number;
};
type LegacyAsset = {
  id: number;
  file_name: string;
  delivery_status: string;
  delivered_message_id: number | null;
};

export async function legacyCleanupSnapshot(env: Env): Promise<Record<string, unknown>> {
  const cutoff = new Date(Date.now() - SAFE_BOT_DELETE_WINDOW_MS).toISOString();
  const [summary, rows] = await Promise.all([
    env.DB.prepare(`
      SELECT
        SUM(CASE WHEN p.download_gate_status='legacy' THEN 1 ELSE 0 END) AS legacy_releases,
        SUM(CASE WHEN p.download_gate_status='legacy' AND p.published_at>=? THEN 1 ELSE 0 END) AS recent_auto_candidates,
        SUM(CASE WHEN p.download_gate_status='legacy' AND (p.published_at IS NULL OR p.published_at<?) THEN 1 ELSE 0 END) AS old_manual_candidates,
        SUM(CASE WHEN lc.status='converted' THEN 1 ELSE 0 END) AS converted,
        SUM(CASE WHEN lc.status='needs_manual_cleanup' THEN 1 ELSE 0 END) AS needs_manual_cleanup,
        SUM(CASE WHEN lc.status='failed' THEN 1 ELSE 0 END) AS failed
      FROM publications p
      LEFT JOIN legacy_publication_cleanup lc ON lc.publication_id=p.id
      WHERE p.status='published' AND p.telegram_deleted_at IS NULL
    `).bind(cutoff, cutoff).first<Record<string, number | null>>(),
    env.DB.prepare(`
      SELECT p.id,p.internal_title,p.published_at,p.discussion_message_id,p.download_gate_status,p.download_gate_message_id,
             COUNT(a.id) AS asset_count,
             SUM(CASE WHEN a.delivery_status='sent' THEN 1 ELSE 0 END) AS sent_assets,
             SUM(CASE WHEN a.delivered_message_id IS NOT NULL THEN 1 ELSE 0 END) AS public_message_ids,
             SUM(CASE WHEN a.delivery_status='sent' AND a.delivered_message_id IS NULL THEN 1 ELSE 0 END) AS missing_message_ids,
             lc.status AS cleanup_status,lc.public_messages_found,lc.deleted_messages,lc.failed_messages,
             lc.details_json,lc.last_error,lc.started_at,lc.completed_at,lc.updated_at AS cleanup_updated_at
      FROM publications p
      LEFT JOIN publication_assets a ON a.publication_id=p.id
      LEFT JOIN legacy_publication_cleanup lc ON lc.publication_id=p.id
      WHERE p.status='published' AND p.telegram_deleted_at IS NULL
        AND (p.download_gate_status='legacy' OR lc.status IN ('needs_manual_cleanup','failed','running'))
      GROUP BY p.id
      ORDER BY COALESCE(lc.updated_at,p.published_at,p.created_at) DESC,p.id DESC
      LIMIT 100
    `).all<Record<string, unknown>>(),
  ]);
  return {
    summary: {
      legacy_releases: Number(summary?.legacy_releases || 0),
      recent_auto_candidates: Number(summary?.recent_auto_candidates || 0),
      old_manual_candidates: Number(summary?.old_manual_candidates || 0),
      converted: Number(summary?.converted || 0),
      needs_manual_cleanup: Number(summary?.needs_manual_cleanup || 0),
      failed: Number(summary?.failed || 0),
      bot_delete_window_hours: 46,
    },
    publications: rows.results,
  };
}

export async function convertLegacyPublication(
  publicationId: number,
  env: Env,
  telegram: TelegramClient,
  adminId: number,
): Promise<Record<string, unknown>> {
  if (!(await runtimeFlag(env, 'download_gate_enabled', false))) {
    throw new Error('Private download gate must be enabled before legacy conversion.');
  }
  const publication = await env.DB.prepare(`
    SELECT id,internal_title,published_at,discussion_message_id,download_gate_status,telegram_deleted_at,add_bot_comment
    FROM publications WHERE id=? AND status='published'
  `).bind(publicationId).first<LegacyPublication>();
  if (!publication || publication.telegram_deleted_at) throw new Error('Published legacy release not found.');
  if (publication.download_gate_status !== 'legacy') {
    const existing = await env.DB.prepare(`SELECT * FROM legacy_publication_cleanup WHERE publication_id=?`)
      .bind(publicationId).first<Record<string, unknown>>();
    return { publication_id: publicationId, already_protected: true, cleanup: existing || null };
  }
  if (!publication.discussion_message_id) throw new Error('Legacy release has no recorded discussion message.');

  const assets = (await env.DB.prepare(`
    SELECT id,file_name,delivery_status,delivered_message_id
    FROM publication_assets WHERE publication_id=? ORDER BY sort_order,id
  `).bind(publicationId).all<LegacyAsset>()).results;
  if (!assets.length) throw new Error('Legacy release has no file assets to protect.');

  const startedAt = new Date().toISOString();
  const knownPublicMessages = assets
    .filter((asset) => asset.delivery_status === 'sent' && Number(asset.delivered_message_id || 0) > 0)
    .map((asset) => Number(asset.delivered_message_id));
  const missingIds = assets
    .filter((asset) => asset.delivery_status === 'sent' && !asset.delivered_message_id)
    .map((asset) => ({ asset_id: asset.id, file_name: asset.file_name }));

  await env.DB.prepare(`
    INSERT INTO legacy_publication_cleanup(publication_id,status,public_messages_found,deleted_messages,failed_messages,details_json,last_error,started_at,completed_at,updated_at)
    VALUES (?,'running',?,0,0,NULL,NULL,?,NULL,?)
    ON CONFLICT(publication_id) DO UPDATE SET
      status='running',public_messages_found=excluded.public_messages_found,deleted_messages=0,failed_messages=0,
      details_json=NULL,last_error=NULL,started_at=excluded.started_at,completed_at=NULL,updated_at=excluded.updated_at
  `).bind(publicationId, knownPublicMessages.length, startedAt, startedAt).run();

  try {
    const discussionId = await linkedDiscussionId(env, telegram);
    if (!discussionId) throw new Error('Linked Telegram discussion group could not be resolved.');

    const gateMessageId = await activateProtectedGate(publication, discussionId, env, telegram);

    const publishedAt = publication.published_at ? Date.parse(publication.published_at) : 0;
    const withinDeleteWindow = publishedAt > 0 && publishedAt >= Date.now() - SAFE_BOT_DELETE_WINDOW_MS;
    const deleted: number[] = [];
    const failed: Array<{ message_id: number; error: string }> = [];
    const manualReasons: string[] = [];

    if (!withinDeleteWindow && knownPublicMessages.length) {
      manualReasons.push('Telegram Bot API delete window is no longer considered safe for this old release.');
      for (const messageId of knownPublicMessages) {
        failed.push({ message_id: messageId, error: 'manual_delete_required_old_message' });
      }
    } else {
      for (const messageId of knownPublicMessages) {
        try {
          const ok = await telegram.call<boolean>('deleteMessage', { chat_id: discussionId, message_id: messageId });
          if (ok) deleted.push(messageId);
          else failed.push({ message_id: messageId, error: 'Telegram returned false.' });
        } catch (error) {
          failed.push({ message_id: messageId, error: errorText(error).slice(0, 500) });
        }
      }
    }
    if (missingIds.length) manualReasons.push(`${missingIds.length} sent asset(s) have no recorded Telegram message ID.`);
    if (failed.length) manualReasons.push(`${failed.length} legacy file message(s) still require manual deletion.`);

    const status = manualReasons.length ? 'needs_manual_cleanup' : 'converted';
    const completedAt = new Date().toISOString();
    const details = {
      protected_gate_message_id: gateMessageId,
      discussion_chat_id: discussionId,
      deleted_message_ids: deleted,
      remaining_messages: failed,
      missing_asset_message_ids: missingIds,
      manual_reasons: manualReasons,
    };
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE legacy_publication_cleanup
        SET status=?,deleted_messages=?,failed_messages=?,details_json=?,last_error=NULL,completed_at=?,updated_at=?
        WHERE publication_id=?
      `).bind(status, deleted.length, failed.length + missingIds.length, JSON.stringify(details), completedAt, completedAt, publicationId),
      env.DB.prepare(`
        INSERT INTO admin_audit_log(admin_user_id,action,target_type,target_id,details,created_at)
        VALUES (?,'legacy_release_protected','publication',?,?,?)
      `).bind(adminId, String(publicationId), JSON.stringify({ status, ...details }), completedAt),
    ]);
    return { publication_id: publicationId, status, ...details };
  } catch (error) {
    const message = errorText(error).slice(0, 1500);
    const now = new Date().toISOString();
    const gate = await env.DB.prepare(`SELECT download_gate_status FROM publications WHERE id=?`)
      .bind(publicationId).first<{ download_gate_status: string }>().catch(() => null);
    if (gate?.download_gate_status !== 'sent') {
      await env.DB.prepare(`
        UPDATE publications SET download_gate_status='legacy',download_gate_message_id=NULL,updated_at=? WHERE id=?
      `).bind(now, publicationId).run().catch(() => undefined);
    }
    await env.DB.prepare(`
      UPDATE legacy_publication_cleanup
      SET status='failed',last_error=?,completed_at=?,updated_at=? WHERE publication_id=?
    `).bind(message, now, now, publicationId).run().catch(() => undefined);
    throw error;
  }
}

export async function convertSafeLegacyBatch(
  env: Env,
  telegram: TelegramClient,
  adminId: number,
  limit = 5,
): Promise<Record<string, unknown>> {
  const recentAfter = new Date(Date.now() - SAFE_BOT_DELETE_WINDOW_MS).toISOString();
  const rows = await env.DB.prepare(`
    SELECT p.id
    FROM publications p
    WHERE p.status='published' AND p.telegram_deleted_at IS NULL AND p.download_gate_status='legacy'
      AND p.published_at>=? AND p.discussion_message_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM publication_assets a WHERE a.publication_id=p.id)
      AND NOT EXISTS (
        SELECT 1 FROM publication_assets a
        WHERE a.publication_id=p.id AND a.delivery_status='sent' AND a.delivered_message_id IS NULL
      )
    ORDER BY p.published_at DESC,p.id DESC LIMIT ?
  `).bind(recentAfter, Math.max(1, Math.min(10, limit))).all<{ id: number }>();
  const results: Record<string, unknown>[] = [];
  for (const row of rows.results) {
    try {
      results.push(await convertLegacyPublication(row.id, env, telegram, adminId));
    } catch (error) {
      results.push({ publication_id: row.id, status: 'failed', error: errorText(error) });
    }
  }
  return { attempted: rows.results.length, results };
}

async function activateProtectedGate(
  publication: LegacyPublication,
  discussionId: number,
  env: Env,
  telegram: TelegramClient,
): Promise<number> {
  const gate = await buildPublicationGateMessage(env, publication.id);
  if (!gate) throw new Error('Could not build protected download gate.');
  const buttons: Array<{ text: string; callback_data: string }> = [
    { text: 'Thank you.', callback_data: `dl:${gate.token}` },
  ];
  if (gate.donate) buttons.push({ text: '❤️ Donate', callback_data: `dn:${gate.token}` });
  const sent = await telegram.sendMessage(discussionId, gate.text, {
    reply_to_message_id: publication.discussion_message_id || undefined,
    reply_markup: { inline_keyboard: [buttons] },
  });
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(`
      UPDATE publications
      SET download_gate_status='sent',download_gate_message_id=?,download_gate_error=NULL,
          comments_check_status='complete',comments_checked_at=?,updated_at=?
      WHERE id=? AND download_gate_status='legacy'
    `).bind(sent.message_id, now, now, publication.id),
  ];
  if (publication.add_bot_comment === 1) {
    statements.push(env.DB.prepare(`
      UPDATE publications SET bot_comment_status='sent',bot_comment_message_id=?,bot_comment_error=NULL WHERE id=?
    `).bind(sent.message_id, publication.id));
  }
  await env.DB.batch(statements);
  await env.DB.prepare(`
    INSERT INTO publication_logs(publication_id,level,event,message,details,created_at)
    VALUES (?,'success','legacy_download_gate_sent','Legacy release converted to protected download gate.',NULL,?)
  `).bind(publication.id, now).run().catch(() => undefined);
  return sent.message_id;
}

async function linkedDiscussionId(env: Env, telegram: TelegramClient): Promise<number | null> {
  const channel = await getRuntimeSetting(env, 'publish_channel_id');
  if (!channel) return null;
  try {
    const chat = await telegram.call<{ linked_chat_id?: number }>('getChat', { chat_id: normalizeChatId(channel) });
    return Number(chat.linked_chat_id) || null;
  } catch {
    return null;
  }
}

function normalizeChatId(value: string): number | string {
  const clean = value.trim();
  if (/^-?\d+$/.test(clean)) {
    const number = Number(clean);
    if (Number.isSafeInteger(number)) return number;
  }
  return clean.startsWith('@') ? clean : `@${clean}`;
}
