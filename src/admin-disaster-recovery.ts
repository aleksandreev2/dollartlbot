import { authenticateMiniAppRequest, miniAppJson, miniAppJsonError } from './miniapp-auth';
import {
  createPortableBackup,
  disasterRecoverySnapshot,
  pruneBackupRetention,
  verifyPortableBackup,
} from './disaster-recovery';
import { errorText } from './db';
import { convertLegacyPublication, convertSafeLegacyBatch, legacyCleanupSnapshot } from './legacy-cleanup';
import { invalidateRuntimeSetting } from './runtime-settings';
import type { TelegramClient } from './telegram';

const PATH = '/api/app/admin/disaster-recovery';

type ActionBody = {
  action?: string;
  backup_id?: string;
  publication_id?: number;
  limit?: number;
  enabled?: boolean;
  interval_hours?: number;
  retry_hours?: number;
  retention_days?: number;
  chunk_rows?: number;
};

export async function handleAdminDisasterRecoveryRequest(
  request: Request,
  env: Env,
  telegram: TelegramClient,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== PATH || !['GET','POST'].includes(request.method)) return null;

  const auth = await authenticateMiniAppRequest(request, env);
  if (auth instanceof Response) return auth;
  if (!auth.admin) return miniAppJsonError('forbidden', 'Admin access required.', 403);

  try {
    if (request.method === 'GET') return miniAppJson(await snapshot(env));
    const body: ActionBody = await request.json<ActionBody>().catch(() => ({} as ActionBody));
    const action = String(body.action || '');

    if (action === 'create_backup') {
      const backup = await createPortableBackup(env, auth.telegramUser.id, 'manual');
      await audit(env, auth.telegramUser.id, 'dr_backup_created', String(backup.id || ''), backup);
      return miniAppJson({ ok: true, action, backup, ...(await snapshot(env)) });
    }

    if (action === 'verify_backup') {
      const backupId = cleanBackupId(body.backup_id);
      if (!backupId) return miniAppJsonError('invalid_backup', 'Backup ID is required.', 400);
      const verification = await verifyPortableBackup(env, backupId, auth.telegramUser.id);
      await audit(env, auth.telegramUser.id, 'dr_backup_verified', backupId, verification);
      return miniAppJson({ ok: true, action, verification, ...(await snapshot(env)) });
    }

    if (action === 'prune_backups') {
      const pruned = await pruneBackupRetention(env, 20);
      await audit(env, auth.telegramUser.id, 'dr_backup_pruned', 'retention', { pruned });
      return miniAppJson({ ok: true, action, pruned, ...(await snapshot(env)) });
    }

    if (action === 'convert_legacy') {
      const publicationId = positiveInteger(body.publication_id);
      if (!publicationId) return miniAppJsonError('invalid_publication', 'Publication ID is required.', 400);
      const result = await convertLegacyPublication(publicationId, env, telegram, auth.telegramUser.id);
      return miniAppJson({ ok: true, action, result, ...(await snapshot(env)) });
    }

    if (action === 'convert_safe_legacy') {
      const limit = bounded(body.limit, 5, 1, 10);
      const result = await convertSafeLegacyBatch(env, telegram, auth.telegramUser.id, limit);
      return miniAppJson({ ok: true, action, result, ...(await snapshot(env)) });
    }

    if (action === 'save_config') {
      const updates = new Map<string, string>();
      if (typeof body.enabled === 'boolean') updates.set('dr_backup_enabled', body.enabled ? '1' : '0');
      if (body.interval_hours !== undefined) updates.set('dr_backup_interval_hours', String(requiredInteger(body.interval_hours, 1, 168, 'interval_hours')));
      if (body.retry_hours !== undefined) updates.set('dr_backup_retry_hours', String(requiredInteger(body.retry_hours, 1, 48, 'retry_hours')));
      if (body.retention_days !== undefined) updates.set('dr_backup_retention_days', String(requiredInteger(body.retention_days, 3, 365, 'retention_days')));
      if (body.chunk_rows !== undefined) updates.set('dr_backup_chunk_rows', String(requiredInteger(body.chunk_rows, 50, 2000, 'chunk_rows')));
      if (!updates.size) return miniAppJsonError('invalid_config', 'No disaster recovery settings supplied.', 400);
      const now = new Date().toISOString();
      await env.DB.batch([...updates].map(([key, value]) => env.DB.prepare(`
        INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at
      `).bind(key, value, now)));
      for (const key of updates.keys()) invalidateRuntimeSetting(key);
      await audit(env, auth.telegramUser.id, 'dr_config_updated', 'disaster_recovery', Object.fromEntries(updates));
      return miniAppJson({ ok: true, action, ...(await snapshot(env)) });
    }

    return miniAppJsonError('invalid_action', 'Unknown disaster recovery action.', 400);
  } catch (error) {
    console.error(JSON.stringify({ event: 'admin_disaster_recovery_failed', error: errorText(error) }));
    return miniAppJsonError('disaster_recovery_failed', errorText(error) || 'Disaster recovery operation failed.', 500);
  }
}

async function snapshot(env: Env): Promise<Record<string, unknown>> {
  const [recovery, legacy] = await Promise.all([
    disasterRecoverySnapshot(env),
    legacyCleanupSnapshot(env),
  ]);
  return { ...recovery, legacy };
}

async function audit(
  env: Env,
  adminId: number,
  action: string,
  targetId: string,
  details: unknown,
): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO admin_audit_log(admin_user_id,action,target_type,target_id,details,created_at)
    VALUES (?,?,'disaster_recovery',?,?,?)
  `).bind(adminId, action, targetId, JSON.stringify(details), new Date().toISOString()).run().catch(() => undefined);
}

function cleanBackupId(value: unknown): string | null {
  const clean = String(value || '').trim();
  return /^[0-9A-Za-z-]{12,80}$/.test(clean) ? clean : null;
}

function positiveInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function requiredInteger(value: unknown, min: number, max: number, label: string): number {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`${label} must be ${min}-${max}.`);
  return number;
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}
