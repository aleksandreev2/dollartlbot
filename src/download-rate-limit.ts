import { recordReaderEvent } from './download-gate';
import type { TelegramUpdate } from './telegram';

const TOKEN_RE = /^[A-Za-z0-9_-]{20,48}$/;

export function recordPublicationRateLimit(update: TelegramUpdate, env: Env, ctx: ExecutionContext): void {
  const user = update.callback_query?.from
    || (update.message?.chat.type === 'private' ? update.message.from : undefined);
  if (!user) return;

  const token = tokenFromUpdate(update);
  if (!token) return;
  ctx.waitUntil((async () => {
    const row = await env.DB.prepare(`
      SELECT publication_id FROM publication_download_tokens
      WHERE token=? AND revoked_at IS NULL LIMIT 1
    `).bind(token).first<{ publication_id: number }>();
    if (!row?.publication_id) return;
    await recordReaderEvent(env, row.publication_id, user, 'rate_limited', {
      sourceChatId: update.callback_query?.message ? String(update.callback_query.message.chat.id) : undefined,
      sourceMessageId: update.callback_query?.message?.message_id,
    });
  })().catch(() => undefined));
}

function tokenFromUpdate(update: TelegramUpdate): string | null {
  const callback = String(update.callback_query?.data || '');
  if (callback.startsWith('dl:') || callback.startsWith('dn:')) {
    const token = callback.slice(3);
    return TOKEN_RE.test(token) ? token : null;
  }
  const text = update.message?.text?.trim() || '';
  const start = /^\/start(?:@\w+)?\s+(?:dl_|dn_)([A-Za-z0-9_-]{20,48})$/.exec(text);
  return start?.[1] || null;
}
