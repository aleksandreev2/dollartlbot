import { runBroadcastCenterMaintenanceWithLease } from './broadcast-center';
import type { TelegramClient } from './telegram';

export async function queuePublicationReleaseBroadcast(
  env: Env,
  publicationId: number,
  title: string,
  body: string,
): Promise<number> {
  const dedupeKey = `release:publication:${publicationId}`;
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO broadcasts (
      publication_id, kind, status, title, body, created_at, dedupe_key
    ) VALUES (?, 'release', 'queued', ?, ?, ?, ?)
  `).bind(publicationId, title, body, now, dedupeKey).run();

  const row = await env.DB.prepare(
    'SELECT id FROM broadcasts WHERE dedupe_key = ? LIMIT 1',
  ).bind(dedupeKey).first<{ id: number }>();
  if (!row?.id) throw new Error(`Release broadcast was not created for publication ${publicationId}.`);
  return Number(row.id);
}

export function runBroadcastMaintenanceWithLease(
  env: Env,
  telegram: TelegramClient,
  maxBatches = 1,
): Promise<boolean> {
  return runBroadcastCenterMaintenanceWithLease(env, telegram, maxBatches);
}
