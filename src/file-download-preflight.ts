import { scannerHealth } from './asset-security';
import { runtimeFlag } from './runtime-settings';
import type { TelegramClient, TelegramUpdate } from './telegram';

const DOWNLOAD_START_PREFIX = 'dl_';
const TOKEN_RE = /^[A-Za-z0-9_-]{20,48}$/;

type AssetSecurityRow = {
  scan_status: string;
  quarantined_at: string | null;
  quarantine_reason: string | null;
};

export async function handleFileDownloadPreflight(
  update: TelegramUpdate,
  env: Env,
  telegram: TelegramClient,
): Promise<boolean> {
  const message = update.message;
  if (!message || message.chat.type !== 'private' || !message.from || !message.text?.startsWith('/start')) return false;
  const payload = message.text.trim().split(/\s+/, 2)[1] || '';
  if (!payload.startsWith(DOWNLOAD_START_PREFIX)) return false;
  const token = payload.slice(DOWNLOAD_START_PREFIX.length);
  if (!TOKEN_RE.test(token)) return false;

  const publication = await env.DB.prepare(`
    SELECT p.id
    FROM publication_download_tokens t
    JOIN publications p ON p.id=t.publication_id
    WHERE t.token=? AND t.revoked_at IS NULL
      AND p.status='published' AND p.telegram_deleted_at IS NULL
    LIMIT 1
  `).bind(token).first<{ id: number }>();
  if (!publication) return false;

  const assets = await env.DB.prepare(`
    SELECT scan_status,quarantined_at,quarantine_reason
    FROM publication_assets
    WHERE publication_id=?
    ORDER BY sort_order,id
  `).bind(publication.id).all<AssetSecurityRow>();
  if (!assets.results.length) return false;

  const quarantined = assets.results.find((asset) =>
    Boolean(asset.quarantined_at)
    || Boolean(asset.quarantine_reason)
    || asset.scan_status === 'infected'
    || asset.scan_status === 'suspicious',
  );
  if (quarantined) {
    await telegram.sendMessage(
      message.from.id,
      '<b>This file is unavailable for security reasons.</b>\n\nA security scan blocked one or more release files. The files will not be delivered.',
    ).catch(() => undefined);
    return true;
  }

  if (!(await runtimeFlag(env, 'asset_scan_enforcement', false))) return false;

  const health = await scannerHealth(env);
  if (!health.ready) {
    await telegram.sendMessage(
      message.from.id,
      '<b>File security check is temporarily unavailable.</b>\n\nDownloads are paused until the scanner is healthy again. Please try later.',
    ).catch(() => undefined);
    return true;
  }

  if (assets.results.some((asset) => asset.scan_status !== 'clean')) {
    await telegram.sendMessage(
      message.from.id,
      '<b>The file is still being checked.</b>\n\nDelivery will be available after the security scan finishes successfully.',
    ).catch(() => undefined);
    return true;
  }

  return false;
}
