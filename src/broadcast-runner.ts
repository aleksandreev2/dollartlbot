import { runBroadcastMaintenance } from './notifications';
import type { TelegramClient } from './telegram';

const LEASE_NAME = 'release_broadcast_runner';
const LEASE_MS = 5 * 60 * 1000;

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

export async function runBroadcastMaintenanceWithLease(
  env: Env,
  telegram: TelegramClient,
  maxBatches = 1,
): Promise<boolean> {
  const owner = crypto.randomUUID();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresIso = new Date(now.getTime() + LEASE_MS).toISOString();

  const claimed = await env.DB.prepare(`
    INSERT INTO runtime_leases (name, owner_token, expires_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET
      owner_token = excluded.owner_token,
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
    WHERE runtime_leases.expires_at <= excluded.updated_at
  `).bind(LEASE_NAME, owner, expiresIso, nowIso).run();

  if ((claimed.meta.changes ?? 0) === 0) return false;

  try {
    await runBroadcastMaintenance(env, telegram, maxBatches);
    return true;
  } finally {
    await env.DB.prepare(
      'DELETE FROM runtime_leases WHERE name = ? AND owner_token = ?',
    ).bind(LEASE_NAME, owner).run().catch(() => undefined);
  }
}
