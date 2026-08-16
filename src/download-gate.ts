import { checkBotAccess, sendAccessGate } from './access-gate';
import { getUser, upsertUser } from './db';
import { normalizeLocale } from './i18n/index';
import { getRuntimeSetting, runtimeFlag } from './runtime-settings';
import { isUserAdministrativelyBlocked } from './user-controls';
import { escapeHtml, type TelegramClient, type TelegramMessage, type TelegramUpdate, type TelegramUser } from './telegram';

type GatePublication = {
  id: number;
  status: string;
  internal_title: string;
  submission_id: number | null;
  add_donate: number;
  download_gate_message_id: number | null;
  telegram_deleted_at: string | null;
  submission_title: string | null;
  genres_tags: string | null;
};

type GateAsset = {
  id: number;
  file_name: string;
  mime_type: string | null;
  r2_key: string;
  telegram_file_id: string | null;
  scan_status: string;
};

type DeliveryClaim = { attempts: number; delivered_at: string | null };

const DOWNLOAD_PREFIX = 'dl:';
const DONATE_PREFIX = 'dn:';
const DOWNLOAD_START_PREFIX = 'dl_';
const DONATE_START_PREFIX = 'dn_';
const RESEND_COOLDOWN_MS = 60_000;
const SENDING_STALE_MS = 2 * 60_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,48}$/;

export async function handleDownloadGateUpdate(
  update: TelegramUpdate,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<boolean> {
  const callback = update.callback_query;
  if (callback?.data?.startsWith(DOWNLOAD_PREFIX)) {
    await handleGateCallback('download', callback.data.slice(DOWNLOAD_PREFIX.length), update, env, telegram, ctx);
    return true;
  }
  if (callback?.data?.startsWith(DONATE_PREFIX)) {
    await handleGateCallback('donate', callback.data.slice(DONATE_PREFIX.length), update, env, telegram, ctx);
    return true;
  }

  const message = update.message;
  if (!message || message.chat.type !== 'private' || !message.from || !message.text?.startsWith('/start')) return false;
  const payload = message.text.trim().split(/\s+/, 2)[1] || '';
  if (payload.startsWith(DOWNLOAD_START_PREFIX)) {
    await handleDownloadStart(payload.slice(DOWNLOAD_START_PREFIX.length), message.from, env, telegram, ctx);
    return true;
  }
  if (payload.startsWith(DONATE_START_PREFIX)) {
    await handleDonateStart(payload.slice(DONATE_START_PREFIX.length), message.from, env, telegram, ctx);
    return true;
  }
  return false;
}

export async function ensurePublicationGateToken(env: Env, publicationId: number): Promise<string> {
  const existing = await env.DB.prepare(`
    SELECT token FROM publication_download_tokens
    WHERE publication_id=? AND revoked_at IS NULL
    LIMIT 1
  `).bind(publicationId).first<{ token: string }>();
  if (existing?.token) return existing.token;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomToken();
    try {
      await env.DB.prepare(`
        INSERT INTO publication_download_tokens(token,publication_id,created_at,revoked_at)
        VALUES (?,?,?,NULL)
      `).bind(token, publicationId, new Date().toISOString()).run();
      return token;
    } catch {
      const raced = await env.DB.prepare(`
        SELECT token FROM publication_download_tokens
        WHERE publication_id=? AND revoked_at IS NULL
        LIMIT 1
      `).bind(publicationId).first<{ token: string }>();
      if (raced?.token) return raced.token;
    }
  }
  throw new Error('Could not create publication download token');
}

export async function buildPublicationGateMessage(
  env: Env,
  publicationId: number,
): Promise<{ text: string; token: string; donate: boolean } | null> {
  const publication = await getGatePublication(env, publicationId);
  if (!publication || publication.status !== 'published' || publication.telegram_deleted_at) return null;
  const token = await ensurePublicationGateToken(env, publicationId);
  const title = publication.submission_title?.trim() || publication.internal_title.trim() || `Release #${publicationId}`;
  const genres = compactGenres(publication.genres_tags);
  const donate = publication.add_donate === 1 && Boolean(await getRuntimeSetting(env, 'donation_url'));
  const lines = [
    `<b>${escapeHtml(title)}</b>`,
    genres ? escapeHtml(genres) : '',
    '',
    'Thanks for reading Dollar TL.',
    'Tap <b>Thank you.</b> and I’ll send the release files in a private chat.',
  ].filter((line, index, all) => line || (index > 0 && all[index - 1] !== ''));
  return { text: lines.join('\n'), token, donate };
}

async function handleGateCallback(
  kind: 'download' | 'donate',
  token: string,
  update: TelegramUpdate,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<void> {
  const callback = update.callback_query;
  if (!callback) return;
  if (!validToken(token)) {
    await telegram.answerCallbackQuery(callback.id, 'This release link is invalid.').catch(() => undefined);
    return;
  }

  const resolved = await resolveToken(env, token);
  if (!resolved) {
    await telegram.answerCallbackQuery(callback.id, 'This release link has expired.').catch(() => undefined);
    return;
  }
  const publication = resolved.publication;
  if (
    publication.status !== 'published'
    || publication.telegram_deleted_at
    || !callback.message
    || Number(callback.message.message_id) !== Number(publication.download_gate_message_id)
  ) {
    await telegram.answerCallbackQuery(callback.id, 'This release link is no longer active.').catch(() => undefined);
    return;
  }

  if (await isUserAdministrativelyBlocked(env, callback.from.id)) {
    await telegram.answerCallbackQuery(callback.id, 'Access is restricted.').catch(() => undefined);
    return;
  }

  if (kind === 'download') {
    if (!(await runtimeFlag(env, 'download_gate_enabled', false))) {
      await telegram.answerCallbackQuery(callback.id, 'Downloads are temporarily unavailable.').catch(() => undefined);
      return;
    }
    ctx.waitUntil(recordReaderEvent(env, publication.id, callback.from, 'thank_you_click', {
      sourceChatId: String(callback.message.chat.id),
      sourceMessageId: callback.message.message_id,
    }));
  } else {
    if (!(await runtimeFlag(env, 'donate_tracking_enabled', true))) {
      await telegram.answerCallbackQuery(callback.id, 'Donate tracking is temporarily unavailable.').catch(() => undefined);
      return;
    }
    ctx.waitUntil(recordReaderEvent(env, publication.id, callback.from, 'donate_click', {
      sourceChatId: String(callback.message.chat.id),
      sourceMessageId: callback.message.message_id,
    }));
  }

  const username = (await getRuntimeSetting(env, 'bot_username', 'dollartlbot')) || 'dollartlbot';
  const payload = `${kind === 'download' ? DOWNLOAD_START_PREFIX : DONATE_START_PREFIX}${token}`;
  const url = `https://t.me/${encodeURIComponent(username.replace(/^@/, ''))}?start=${encodeURIComponent(payload)}`;
  await telegram.call<boolean>('answerCallbackQuery', {
    callback_query_id: callback.id,
    url,
  }).catch(async () => {
    await telegram.answerCallbackQuery(callback.id, 'Open Dollar TL Bot to continue.').catch(() => undefined);
  });
}

async function handleDownloadStart(
  token: string,
  user: TelegramUser,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<void> {
  if (!validToken(token)) {
    await telegram.sendMessage(user.id, '<b>Invalid download link.</b>').catch(() => undefined);
    return;
  }
  if (!(await runtimeFlag(env, 'download_gate_enabled', false))) {
    await telegram.sendMessage(user.id, '<b>Downloads are temporarily unavailable.</b>').catch(() => undefined);
    return;
  }
  const resolved = await resolveToken(env, token);
  if (!resolved || resolved.publication.status !== 'published' || resolved.publication.telegram_deleted_at) {
    await telegram.sendMessage(user.id, '<b>This release link has expired.</b>').catch(() => undefined);
    return;
  }

  await upsertUser(env, user);
  ctx.waitUntil(recordReaderEvent(env, resolved.publication.id, user, 'download_open'));

  const access = await checkBotAccess(user.id, env, telegram, { activationSource: 'bot' });
  if (!access.allowed) {
    ctx.waitUntil(recordReaderEvent(env, resolved.publication.id, user, 'access_denied', {
      metadata: { reason: access.reason },
    }));
    const account = await getUser(env, user.id).catch(() => null);
    await sendAccessGate(user.id, normalizeLocale(account?.language), access, telegram);
    return;
  }

  const assets = await env.DB.prepare(`
    SELECT id,file_name,mime_type,r2_key,telegram_file_id,scan_status
    FROM publication_assets
    WHERE publication_id=?
    ORDER BY sort_order,id
  `).bind(resolved.publication.id).all<GateAsset>();
  if (!assets.results.length) {
    await telegram.sendMessage(user.id, '<b>No downloadable files are attached to this release.</b>');
    return;
  }

  const enforceScan = await runtimeFlag(env, 'asset_scan_enforcement', false);
  if (enforceScan && assets.results.some((asset) => asset.scan_status !== 'clean')) {
    ctx.waitUntil(recordReaderEvent(env, resolved.publication.id, user, 'delivery_blocked_security'));
    await telegram.sendMessage(user.id,
      '<b>The file is temporarily unavailable.</b>\n\nIts security scan has not completed successfully yet.',
    );
    return;
  }

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  for (const asset of assets.results) {
    const claim = await claimDelivery(env, resolved.publication.id, asset.id, user.id);
    if (!claim) {
      skippedCount += 1;
      continue;
    }
    ctx.waitUntil(recordReaderEvent(env, resolved.publication.id, user, 'delivery_started', { assetId: asset.id }));
    try {
      const sent = await sendAsset(user.id, asset, env, telegram);
      const deliveredAt = new Date().toISOString();
      await env.DB.batch([
        env.DB.prepare(`
          UPDATE publication_deliveries
          SET status='delivered',delivered_at=?,telegram_message_id=?,last_error=NULL
          WHERE publication_id=? AND asset_id=? AND user_id=?
        `).bind(deliveredAt, sent.message_id, resolved.publication.id, asset.id, user.id),
        env.DB.prepare(`
          UPDATE publication_assets
          SET telegram_file_id=COALESCE(?,telegram_file_id)
          WHERE id=?
        `).bind(sent.document?.file_id || null, asset.id),
      ]);
      sentCount += 1;
      ctx.waitUntil(recordReaderEvent(env, resolved.publication.id, user, 'delivery_success', {
        assetId: asset.id,
        metadata: { repeat: Boolean(claim.delivered_at) },
      }));
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      await env.DB.prepare(`
        UPDATE publication_deliveries
        SET status='failed',last_error=?
        WHERE publication_id=? AND asset_id=? AND user_id=?
      `).bind(message.slice(0, 1000), resolved.publication.id, asset.id, user.id).run().catch(() => undefined);
      ctx.waitUntil(recordReaderEvent(env, resolved.publication.id, user, 'delivery_failed', {
        assetId: asset.id,
        metadata: { error: message.slice(0, 300) },
      }));
    }
  }

  if (sentCount === 0 && skippedCount > 0 && failedCount === 0) {
    await telegram.sendMessage(user.id, 'The files were sent recently. Check the messages above.').catch(() => undefined);
  } else if (failedCount > 0) {
    await telegram.sendMessage(user.id,
      `<b>Delivery issue.</b>\n\nSent: ${sentCount}. Failed: ${failedCount}. You can retry shortly.`,
    ).catch(() => undefined);
  }

  const donation = resolved.publication.add_donate === 1 ? await getRuntimeSetting(env, 'donation_url') : '';
  if (sentCount > 0 && donation) {
    await telegram.sendMessage(user.id, 'Enjoy the release. If you want to support Dollar TL:', {
      reply_markup: { inline_keyboard: [[{ text: '❤️ Donate', url: donation }]] },
    }).catch(() => undefined);
  }
}

async function handleDonateStart(
  token: string,
  user: TelegramUser,
  env: Env,
  telegram: TelegramClient,
  ctx: ExecutionContext,
): Promise<void> {
  if (!validToken(token)) return;
  const resolved = await resolveToken(env, token);
  if (!resolved || resolved.publication.status !== 'published' || resolved.publication.telegram_deleted_at) {
    await telegram.sendMessage(user.id, '<b>This donation link has expired.</b>').catch(() => undefined);
    return;
  }
  await upsertUser(env, user);
  ctx.waitUntil(recordReaderEvent(env, resolved.publication.id, user, 'donate_open'));
  const donation = await getRuntimeSetting(env, 'donation_url');
  if (!donation) {
    await telegram.sendMessage(user.id, '<b>Donations are temporarily unavailable.</b>').catch(() => undefined);
    return;
  }
  await telegram.sendMessage(user.id, 'Thank you for supporting Dollar TL.', {
    reply_markup: { inline_keyboard: [[{ text: '❤️ Continue to Donate', url: donation }]] },
  });
}

async function sendAsset(
  userId: number,
  asset: GateAsset,
  env: Env,
  telegram: TelegramClient,
): Promise<TelegramMessage> {
  if (asset.telegram_file_id) return telegram.sendDocument(userId, asset.telegram_file_id);
  const object = await env.COVERS.get(asset.r2_key);
  if (!object) throw new Error(`R2 object missing: ${asset.r2_key}`);
  const file = new File([await object.arrayBuffer()], asset.file_name, {
    type: asset.mime_type || 'application/octet-stream',
  });
  return telegram.sendDocumentUpload(userId, file);
}

async function claimDelivery(
  env: Env,
  publicationId: number,
  assetId: number,
  userId: number,
): Promise<DeliveryClaim | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const cooldownCutoff = new Date(now.getTime() - RESEND_COOLDOWN_MS).toISOString();
  const staleCutoff = new Date(now.getTime() - SENDING_STALE_MS).toISOString();
  return env.DB.prepare(`
    INSERT INTO publication_deliveries(
      publication_id,asset_id,user_id,status,attempts,first_requested_at,last_requested_at
    ) VALUES (?,?,?,'sending',1,?,?)
    ON CONFLICT(publication_id,asset_id,user_id) DO UPDATE SET
      status='sending',
      attempts=publication_deliveries.attempts+1,
      last_requested_at=excluded.last_requested_at,
      last_error=NULL
    WHERE
      (publication_deliveries.status<>'sending' AND publication_deliveries.last_requested_at<=?)
      OR (publication_deliveries.status='sending' AND publication_deliveries.last_requested_at<=?)
    RETURNING attempts,delivered_at
  `).bind(publicationId, assetId, userId, nowIso, nowIso, cooldownCutoff, staleCutoff).first<DeliveryClaim>();
}

async function resolveToken(env: Env, token: string): Promise<{ publication: GatePublication } | null> {
  const publication = await env.DB.prepare(`
    SELECT
      p.id,p.status,p.internal_title,p.submission_id,p.add_donate,p.download_gate_message_id,p.telegram_deleted_at,
      s.title AS submission_title,s.genres_tags
    FROM publication_download_tokens t
    JOIN publications p ON p.id=t.publication_id
    LEFT JOIN submissions s ON s.id=p.submission_id
    WHERE t.token=? AND t.revoked_at IS NULL
    LIMIT 1
  `).bind(token).first<GatePublication>();
  return publication ? { publication } : null;
}

async function getGatePublication(env: Env, publicationId: number): Promise<GatePublication | null> {
  return env.DB.prepare(`
    SELECT
      p.id,p.status,p.internal_title,p.submission_id,p.add_donate,p.download_gate_message_id,p.telegram_deleted_at,
      s.title AS submission_title,s.genres_tags
    FROM publications p
    LEFT JOIN submissions s ON s.id=p.submission_id
    WHERE p.id=?
  `).bind(publicationId).first<GatePublication>();
}

type ReaderEventOptions = {
  assetId?: number;
  sourceChatId?: string;
  sourceMessageId?: number;
  metadata?: Record<string, unknown>;
};

export async function recordReaderEvent(
  env: Env,
  publicationId: number,
  user: TelegramUser,
  eventType: string,
  options: ReaderEventOptions = {},
): Promise<void> {
  const now = new Date().toISOString();
  const metadataJson = options.metadata ? JSON.stringify(options.metadata).slice(0, 1200) : null;
  const isThankYou = eventType === 'thank_you_click';
  const isSuccess = eventType === 'delivery_success';
  const isFailure = eventType === 'delivery_failed';
  const isAccessDenied = eventType === 'access_denied';
  const isRateLimited = eventType === 'rate_limited';
  const isDonate = eventType === 'donate_click';
  const isRepeat = isSuccess && Boolean(options.metadata?.repeat);

  await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO publication_user_stats(
        publication_id,user_id,username_snapshot,first_name_snapshot,last_name_snapshot,first_seen_at,last_seen_at
      ) VALUES (?,?,?,?,?,?,?)
    `).bind(
      publicationId,user.id,user.username || null,user.first_name || null,user.last_name || null,now,now,
    ),
    env.DB.prepare(`
      INSERT INTO publication_reader_events(
        publication_id,asset_id,user_id,username_snapshot,first_name_snapshot,last_name_snapshot,
        event_type,source_chat_id,source_message_id,metadata_json,created_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      publicationId,options.assetId || null,user.id,user.username || null,user.first_name || null,user.last_name || null,
      eventType,options.sourceChatId || null,options.sourceMessageId || null,metadataJson,now,
    ),
    env.DB.prepare(`
      INSERT INTO publication_reader_stats(
        publication_id,thank_you_clicks,unique_clickers,delivery_successes,unique_readers,
        repeat_deliveries,delivery_failures,access_denied,rate_limited,donate_clicks,updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(publication_id) DO UPDATE SET
        thank_you_clicks=publication_reader_stats.thank_you_clicks+excluded.thank_you_clicks,
        unique_clickers=publication_reader_stats.unique_clickers+excluded.unique_clickers,
        delivery_successes=publication_reader_stats.delivery_successes+excluded.delivery_successes,
        unique_readers=publication_reader_stats.unique_readers+excluded.unique_readers,
        repeat_deliveries=publication_reader_stats.repeat_deliveries+excluded.repeat_deliveries,
        delivery_failures=publication_reader_stats.delivery_failures+excluded.delivery_failures,
        access_denied=publication_reader_stats.access_denied+excluded.access_denied,
        rate_limited=publication_reader_stats.rate_limited+excluded.rate_limited,
        donate_clicks=publication_reader_stats.donate_clicks+excluded.donate_clicks,
        updated_at=excluded.updated_at
    `).bind(
      publicationId,
      isThankYou ? 1 : 0,
      isThankYou ? 1 : 0,
      isSuccess ? 1 : 0,
      isSuccess && !isRepeat ? 1 : 0,
      isRepeat ? 1 : 0,
      isFailure ? 1 : 0,
      isAccessDenied ? 1 : 0,
      isRateLimited ? 1 : 0,
      isDonate ? 1 : 0,
      now,
    ),
    env.DB.prepare(`
      UPDATE publication_user_stats SET
        username_snapshot=?,first_name_snapshot=?,last_name_snapshot=?,
        thank_you_clicks=thank_you_clicks+?,
        delivery_successes=delivery_successes+?,
        delivery_failures=delivery_failures+?,
        repeat_deliveries=repeat_deliveries+?,
        donate_clicks=donate_clicks+?,
        last_seen_at=?
      WHERE publication_id=? AND user_id=?
    `).bind(
      user.username || null,user.first_name || null,user.last_name || null,
      isThankYou ? 1 : 0,isSuccess ? 1 : 0,isFailure ? 1 : 0,isRepeat ? 1 : 0,isDonate ? 1 : 0,
      now,publicationId,user.id,
    ),
  ]);
}

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '');
}

function validToken(value: string): boolean {
  return TOKEN_RE.test(value);
}

function compactGenres(value: string | null): string {
  if (!value) return '';
  return value
    .split(/[,;|\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 6)
    .join(' · ')
    .slice(0, 240);
}
