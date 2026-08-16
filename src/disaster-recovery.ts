import { errorText } from './db';
import { getRuntimeSetting, runtimeFlag } from './runtime-settings';

const BACKUP_PREFIX = 'backups/';
const FORMAT = 'dollartl-portable-backup';
const FORMAT_VERSION = 1;
const MAX_VERIFY_CHUNKS = 5000;
const MAX_TABLES = 256;
const MAX_BACKUP_ROWS = 2_000_000;
const EXCLUDED_TABLES = new Set(['d1_migrations','dr_backup_runs','dr_backup_chunks','dr_backup_verifications']);

type BackupTrigger = 'manual' | 'scheduled';
type BackupChunk = {
  key: string;
  kind: 'table' | 'r2_inventory';
  table?: string;
  index: number;
  rows: number;
  bytes: number;
  sha256: string;
};
type BackupTable = {
  name: string;
  schema: string | null;
  row_count: number;
  chunks: BackupChunk[];
};
type BackupManifest = {
  format: typeof FORMAT;
  version: number;
  backup_id: string;
  started_at: string;
  completed_at: string;
  consistency: 'application-logical-nontransactional';
  tables: BackupTable[];
  excluded_tables: string[];
  totals: { tables: number; chunks: number; rows: number; bytes: number };
  r2_inventory: { object_count: number; total_bytes: number; chunks: BackupChunk[] };
  restore_notes: string[];
};

export async function createPortableBackup(
  env: Env,
  createdBy: number | null,
  trigger: BackupTrigger = 'manual',
): Promise<Record<string, unknown>> {
  const startedAt = new Date().toISOString();
  const id = `${startedAt.replace(/[-:.TZ]/g, '')}-${crypto.randomUUID().slice(0, 8)}`;
  try {
    await env.DB.prepare(`
      INSERT INTO dr_backup_runs(id,status,trigger_source,created_by,started_at,updated_at)
      VALUES (?,'running',?,?,?,?)
    `).bind(id, trigger, createdBy, startedAt, startedAt).run();
  } catch (error) {
    const running = await env.DB.prepare(`
      SELECT id,started_at FROM dr_backup_runs WHERE status='running' ORDER BY started_at DESC LIMIT 1
    `).first<Record<string, unknown>>().catch(() => null);
    if (running) throw new Error(`Backup ${String(running.id)} is already running.`);
    throw error;
  }

  try {
    const chunkRows = bounded(await getRuntimeSetting(env, 'dr_backup_chunk_rows', '500'), 500, 50, 2000);
    const schemaRows = await env.DB.prepare(`
      SELECT name,sql FROM sqlite_schema
      WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'
      ORDER BY name
    `).all<{ name: string; sql: string | null }>();
    const tables = schemaRows.results
      .filter((row) => safeIdentifier(row.name) && !EXCLUDED_TABLES.has(row.name));
    if (tables.length > MAX_TABLES) throw new Error(`Too many D1 application tables for portable backup: ${tables.length}.`);

    const manifestTables: BackupTable[] = [];
    let totalRows = 0;
    let totalChunks = 0;
    let totalBytes = 0;

    for (const table of tables) {
      const quoted = quoteIdentifier(table.name);
      const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${quoted}`).first<{ n: number }>();
      const rowCount = Number(countRow?.n || 0);
      totalRows += rowCount;
      if (totalRows > MAX_BACKUP_ROWS) throw new Error(`Portable backup row safety limit exceeded (${MAX_BACKUP_ROWS}).`);

      const chunks: BackupChunk[] = [];
      for (let offset = 0, index = 0; offset < rowCount; offset += chunkRows, index += 1) {
        const rows = await readTablePage(env, quoted, chunkRows, offset);
        const body = rows.map((row) => JSON.stringify(jsonSafe(row))).join('\n') + (rows.length ? '\n' : '');
        const bytes = new TextEncoder().encode(body).byteLength;
        const sha256 = await sha256Hex(body);
        const key = `${BACKUP_PREFIX}${id}/tables/${encodeURIComponent(table.name)}/${String(index).padStart(6, '0')}.jsonl`;
        await env.COVERS.put(key, body, {
          httpMetadata: { contentType: 'application/x-ndjson; charset=utf-8' },
          customMetadata: { backup_id: id, table: table.name, sha256 },
        });
        const chunk: BackupChunk = { key, kind: 'table', table: table.name, index, rows: rows.length, bytes, sha256 };
        chunks.push(chunk);
        totalChunks += 1;
        totalBytes += bytes;
        await recordChunk(env, id, chunk, startedAt);
      }
      manifestTables.push({ name: table.name, schema: table.sql, row_count: rowCount, chunks });
    }

    const inventory = await snapshotR2Inventory(env, id, startedAt);
    totalChunks += inventory.chunks.length;
    totalBytes += inventory.chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);

    const completedAt = new Date().toISOString();
    const manifest: BackupManifest = {
      format: FORMAT,
      version: FORMAT_VERSION,
      backup_id: id,
      started_at: startedAt,
      completed_at: completedAt,
      consistency: 'application-logical-nontransactional',
      tables: manifestTables,
      excluded_tables: [...EXCLUDED_TABLES],
      totals: { tables: manifestTables.length, chunks: totalChunks, rows: totalRows, bytes: totalBytes },
      r2_inventory: inventory,
      restore_notes: [
        'This is a portable application-level logical backup, not a transactionally frozen D1 snapshot.',
        'Use Cloudflare D1 Time Travel for exact point-in-time database recovery when available.',
        'Restore into a staging database first, apply migrations, then import table chunks after verification.',
        'R2 inventory records object metadata; original R2 objects remain in the private bucket and are not duplicated.',
      ],
    };
    const manifestBody = JSON.stringify(manifest, null, 2);
    const manifestSha = await sha256Hex(manifestBody);
    const manifestKey = `${BACKUP_PREFIX}${id}/manifest.json`;
    await env.COVERS.put(manifestKey, manifestBody, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
      customMetadata: { backup_id: id, sha256: manifestSha },
    });

    await env.DB.prepare(`
      UPDATE dr_backup_runs SET
        status='completed',completed_at=?,updated_at=?,table_count=?,chunk_count=?,row_count=?,byte_count=?,
        manifest_key=?,manifest_sha256=?,r2_object_count=?,r2_total_bytes=?,error_text=NULL
      WHERE id=?
    `).bind(
      completedAt, completedAt, manifestTables.length, totalChunks, totalRows, totalBytes,
      manifestKey, manifestSha, inventory.object_count, inventory.total_bytes, id,
    ).run();
    return backupSummary(env, id);
  } catch (error) {
    const message = errorText(error).slice(0, 1500);
    const failedAt = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE dr_backup_runs SET status='failed',error_text=?,completed_at=?,updated_at=? WHERE id=?
    `).bind(message, failedAt, failedAt, id).run().catch(() => undefined);
    throw error;
  }
}

export async function verifyPortableBackup(
  env: Env,
  backupId: string,
  createdBy: number | null,
): Promise<Record<string, unknown>> {
  const run = await env.DB.prepare(`
    SELECT id,status,manifest_key,manifest_sha256 FROM dr_backup_runs WHERE id=?
  `).bind(backupId).first<Record<string, unknown>>();
  if (!run) throw new Error('Backup not found.');
  if (String(run.status) !== 'completed') throw new Error('Only completed backups can be verified.');
  const manifestKey = String(run.manifest_key || '');
  if (!manifestKey) throw new Error('Backup manifest is missing.');

  let chunksChecked = 0;
  let rowsChecked = 0;
  let bytesChecked = 0;
  const now = new Date().toISOString();
  try {
    const object = await env.COVERS.get(manifestKey);
    if (!object) throw new Error('Backup manifest object is missing from R2.');
    const body = await object.text();
    const actualManifestSha = await sha256Hex(body);
    if (String(run.manifest_sha256 || '') !== actualManifestSha) throw new Error('Backup manifest SHA-256 mismatch.');
    const manifest = JSON.parse(body) as BackupManifest;
    if (manifest.format !== FORMAT || manifest.version !== FORMAT_VERSION || manifest.backup_id !== backupId) {
      throw new Error('Backup manifest format or identity is invalid.');
    }
    const chunks = [
      ...manifest.tables.flatMap((table) => table.chunks),
      ...manifest.r2_inventory.chunks,
    ];
    if (chunks.length > MAX_VERIFY_CHUNKS) throw new Error(`Backup has too many chunks to verify safely (${chunks.length}).`);

    for (const chunk of chunks) {
      const item = await env.COVERS.get(chunk.key);
      if (!item) throw new Error(`Backup chunk missing: ${chunk.key}`);
      const chunkBody = await item.text();
      const sha = await sha256Hex(chunkBody);
      if (sha !== chunk.sha256) throw new Error(`SHA-256 mismatch: ${chunk.key}`);
      const lines = chunkBody.split('\n').filter(Boolean);
      if (lines.length !== chunk.rows) throw new Error(`Row count mismatch: ${chunk.key}`);
      for (const line of lines) JSON.parse(line);
      chunksChecked += 1;
      rowsChecked += lines.length;
      bytesChecked += new TextEncoder().encode(chunkBody).byteLength;
    }

    const expectedRows = manifest.tables.reduce((sum, table) => sum + table.row_count, 0)
      + manifest.r2_inventory.object_count;
    if (rowsChecked !== expectedRows) throw new Error(`Manifest row total mismatch: expected ${expectedRows}, verified ${rowsChecked}.`);

    await env.DB.batch([
      env.DB.prepare(`
        UPDATE dr_backup_runs SET verify_status='verified',verified_at=?,verification_error=NULL,updated_at=? WHERE id=?
      `).bind(now, now, backupId),
      env.DB.prepare(`
        INSERT INTO dr_backup_verifications(backup_id,status,chunks_checked,rows_checked,bytes_checked,created_by,created_at)
        VALUES (?,'verified',?,?,?,?,?)
      `).bind(backupId, chunksChecked, rowsChecked, bytesChecked, createdBy, now),
    ]);
    return { backup_id: backupId, status: 'verified', chunks_checked: chunksChecked, rows_checked: rowsChecked, bytes_checked: bytesChecked };
  } catch (error) {
    const message = errorText(error).slice(0, 1500);
    await env.DB.batch([
      env.DB.prepare(`
        UPDATE dr_backup_runs SET verify_status='failed',verified_at=?,verification_error=?,updated_at=? WHERE id=?
      `).bind(now, message, now, backupId),
      env.DB.prepare(`
        INSERT INTO dr_backup_verifications(backup_id,status,chunks_checked,rows_checked,bytes_checked,error_text,created_by,created_at)
        VALUES (?,'failed',?,?,?,?,?,?,?)
      `).bind(backupId, chunksChecked, rowsChecked, bytesChecked, message, createdBy, now),
    ]).catch(() => undefined);
    throw error;
  }
}

export async function runDisasterRecoveryMaintenance(env: Env): Promise<void> {
  await markStaleRunsFailed(env);
  await pruneBackupRetention(env, 3);
  if (!(await runtimeFlag(env, 'dr_backup_enabled', true))) return;

  const intervalHours = bounded(await getRuntimeSetting(env, 'dr_backup_interval_hours', '24'), 24, 1, 168);
  const retryHours = bounded(await getRuntimeSetting(env, 'dr_backup_retry_hours', '6'), 6, 1, 48);
  const latest = await env.DB.prepare(`
    SELECT status,started_at,completed_at FROM dr_backup_runs ORDER BY started_at DESC LIMIT 1
  `).first<{ status: string; started_at: string; completed_at: string | null }>().catch(() => null);
  if (latest?.status === 'running') return;
  const lastAttempt = latest?.started_at ? Date.parse(latest.started_at) : 0;
  if (lastAttempt && lastAttempt > Date.now() - retryHours * 60 * 60_000 && latest?.status === 'failed') return;
  const completed = await env.DB.prepare(`
    SELECT completed_at FROM dr_backup_runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1
  `).first<{ completed_at: string }>().catch(() => null);
  const lastCompleted = completed?.completed_at ? Date.parse(completed.completed_at) : 0;
  if (lastCompleted && lastCompleted > Date.now() - intervalHours * 60 * 60_000) return;

  const created = await createPortableBackup(env, null, 'scheduled');
  const backupId = String(created.id || '');
  if (!backupId) throw new Error('Scheduled backup completed without an ID.');
  await verifyPortableBackup(env, backupId, null);
}

export async function pruneBackupRetention(env: Env, limit = 10): Promise<number> {
  const days = bounded(await getRuntimeSetting(env, 'dr_backup_retention_days', '30'), 30, 3, 365);
  const before = new Date(Date.now() - days * 24 * 60 * 60_000).toISOString();
  const rows = await env.DB.prepare(`
    SELECT id FROM dr_backup_runs
    WHERE status<>'running' AND started_at<?
    ORDER BY started_at ASC LIMIT ?
  `).bind(before, Math.max(1, Math.min(20, limit))).all<{ id: string }>();
  for (const row of rows.results) {
    await deleteR2Prefix(env.COVERS, `${BACKUP_PREFIX}${row.id}/`);
    await env.DB.prepare(`DELETE FROM dr_backup_runs WHERE id=?`).bind(row.id).run();
  }
  return rows.results.length;
}

export async function disasterRecoverySnapshot(env: Env): Promise<Record<string, unknown>> {
  const [runs, verifications, settings, incidents] = await Promise.all([
    env.DB.prepare(`
      SELECT id,status,trigger_source,created_by,started_at,completed_at,error_text,table_count,chunk_count,row_count,
             byte_count,manifest_key,r2_object_count,r2_total_bytes,verify_status,verified_at,verification_error
      FROM dr_backup_runs ORDER BY started_at DESC LIMIT 20
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT id,backup_id,status,chunks_checked,rows_checked,bytes_checked,error_text,created_by,created_at
      FROM dr_backup_verifications ORDER BY id DESC LIMIT 20
    `).all<Record<string, unknown>>(),
    env.DB.prepare(`
      SELECT key,value FROM app_settings
      WHERE key IN ('dr_backup_enabled','dr_backup_interval_hours','dr_backup_retry_hours','dr_backup_retention_days','dr_backup_chunk_rows')
    `).all<{ key: string; value: string }>(),
    env.DB.prepare(`
      SELECT id,incident_key,severity,title,status,opened_at,last_seen_at,resolved_at,last_value,occurrences,details_json
      FROM production_incidents ORDER BY opened_at DESC,id DESC LIMIT 50
    `).all<Record<string, unknown>>(),
  ]);
  return {
    generated_at: new Date().toISOString(),
    config: Object.fromEntries(settings.results.map((row) => [row.key, row.value])),
    backups: runs.results,
    verifications: verifications.results,
    incidents: incidents.results,
  };
}

async function snapshotR2Inventory(
  env: Env,
  backupId: string,
  createdAt: string,
): Promise<{ object_count: number; total_bytes: number; chunks: BackupChunk[] }> {
  let cursor: string | undefined;
  let index = 0;
  let objectCount = 0;
  let totalBytes = 0;
  const chunks: BackupChunk[] = [];
  do {
    const page = await env.COVERS.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
    const records = page.objects
      .filter((object) => !object.key.startsWith(BACKUP_PREFIX))
      .map((object) => ({
        key: object.key,
        size: object.size,
        etag: object.etag,
        uploaded: object.uploaded instanceof Date ? object.uploaded.toISOString() : String(object.uploaded || ''),
      }));
    objectCount += records.length;
    totalBytes += records.reduce((sum, object) => sum + Number(object.size || 0), 0);
    if (records.length) {
      const body = records.map((row) => JSON.stringify(row)).join('\n') + '\n';
      const bytes = new TextEncoder().encode(body).byteLength;
      const sha256 = await sha256Hex(body);
      const key = `${BACKUP_PREFIX}${backupId}/r2/inventory-${String(index).padStart(6, '0')}.jsonl`;
      await env.COVERS.put(key, body, {
        httpMetadata: { contentType: 'application/x-ndjson; charset=utf-8' },
        customMetadata: { backup_id: backupId, kind: 'r2_inventory', sha256 },
      });
      const chunk: BackupChunk = { key, kind: 'r2_inventory', index, rows: records.length, bytes, sha256 };
      chunks.push(chunk);
      await recordChunk(env, backupId, chunk, createdAt);
      index += 1;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return { object_count: objectCount, total_bytes: totalBytes, chunks };
}

async function recordChunk(env: Env, backupId: string, chunk: BackupChunk, createdAt: string): Promise<void> {
  await env.DB.prepare(`
    INSERT INTO dr_backup_chunks(backup_id,r2_key,kind,table_name,chunk_index,row_count,byte_count,sha256,created_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(
    backupId, chunk.key, chunk.kind, chunk.table || null, chunk.index, chunk.rows, chunk.bytes, chunk.sha256, createdAt,
  ).run();
}

async function readTablePage(
  env: Env,
  quotedTable: string,
  limit: number,
  offset: number,
): Promise<Record<string, unknown>[]> {
  try {
    return (await env.DB.prepare(`SELECT * FROM ${quotedTable} ORDER BY rowid LIMIT ? OFFSET ?`)
      .bind(limit, offset).all<Record<string, unknown>>()).results;
  } catch {
    return (await env.DB.prepare(`SELECT * FROM ${quotedTable} LIMIT ? OFFSET ?`)
      .bind(limit, offset).all<Record<string, unknown>>()).results;
  }
}

async function backupSummary(env: Env, id: string): Promise<Record<string, unknown>> {
  return (await env.DB.prepare(`
    SELECT id,status,trigger_source,started_at,completed_at,table_count,chunk_count,row_count,byte_count,
           manifest_key,r2_object_count,r2_total_bytes,verify_status,verified_at,error_text,verification_error
    FROM dr_backup_runs WHERE id=?
  `).bind(id).first<Record<string, unknown>>()) || { id };
}

async function markStaleRunsFailed(env: Env): Promise<void> {
  const before = new Date(Date.now() - 60 * 60_000).toISOString();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE dr_backup_runs SET status='failed',error_text='Backup run exceeded the one-hour recovery lease.',completed_at=?,updated_at=?
    WHERE status='running' AND started_at<?
  `).bind(now, now, before).run();
}

async function deleteR2Prefix(bucket: R2Bucket, prefix: string): Promise<void> {
  for (;;) {
    const page = await bucket.list({ prefix, limit: 1000 });
    const keys = page.objects.map((object) => object.key);
    if (!keys.length) return;
    await bucket.delete(keys);
  }
}

function jsonSafe(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, jsonSafeValue(value)]));
}

function jsonSafeValue(value: unknown): unknown {
  if (value instanceof ArrayBuffer) return { __dollartl_binary_base64: bytesToBase64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) {
    const view = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return { __dollartl_binary_base64: bytesToBase64(view) };
  }
  if (typeof value === 'bigint') return { __dollartl_bigint: value.toString() };
  return value;
}

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 0x8000)));
  }
  return btoa(out);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeIdentifier(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
}

function quoteIdentifier(value: string): string {
  if (!safeIdentifier(value)) throw new Error(`Unsafe SQLite identifier: ${value}`);
  return `"${value.replaceAll('"', '""')}"`;
}

function bounded(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
}
