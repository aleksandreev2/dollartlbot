PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS dr_backup_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  trigger_source TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_source IN ('manual','scheduled')),
  created_by INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  error_text TEXT,
  table_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  byte_count INTEGER NOT NULL DEFAULT 0,
  manifest_key TEXT,
  manifest_sha256 TEXT,
  r2_object_count INTEGER NOT NULL DEFAULT 0,
  r2_total_bytes INTEGER NOT NULL DEFAULT 0,
  verify_status TEXT NOT NULL DEFAULT 'not_verified' CHECK (verify_status IN ('not_verified','verified','failed')),
  verified_at TEXT,
  verification_error TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dr_backup_single_running
  ON dr_backup_runs(status) WHERE status='running';
CREATE INDEX IF NOT EXISTS idx_dr_backup_runs_started
  ON dr_backup_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS dr_backup_chunks (
  backup_id TEXT NOT NULL REFERENCES dr_backup_runs(id) ON DELETE CASCADE,
  r2_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('table','r2_inventory')),
  table_name TEXT,
  chunk_index INTEGER NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  byte_count INTEGER NOT NULL DEFAULT 0,
  sha256 TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (backup_id, r2_key)
);
CREATE INDEX IF NOT EXISTS idx_dr_backup_chunks_backup
  ON dr_backup_chunks(backup_id, kind, table_name, chunk_index);

CREATE TABLE IF NOT EXISTS dr_backup_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_id TEXT NOT NULL REFERENCES dr_backup_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('verified','failed')),
  chunks_checked INTEGER NOT NULL DEFAULT 0,
  rows_checked INTEGER NOT NULL DEFAULT 0,
  bytes_checked INTEGER NOT NULL DEFAULT 0,
  error_text TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dr_backup_verifications_backup
  ON dr_backup_verifications(backup_id, created_at DESC);

CREATE TABLE IF NOT EXISTS production_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_key TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('warning','critical')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  opened_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT,
  last_value TEXT,
  occurrences INTEGER NOT NULL DEFAULT 1,
  details_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_production_incidents_open
  ON production_incidents(incident_key) WHERE status='open';
CREATE INDEX IF NOT EXISTS idx_production_incidents_time
  ON production_incidents(opened_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS legacy_publication_cleanup (
  publication_id INTEGER PRIMARY KEY REFERENCES publications(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','converted','needs_manual_cleanup','failed')),
  public_messages_found INTEGER NOT NULL DEFAULT 0,
  deleted_messages INTEGER NOT NULL DEFAULT 0,
  failed_messages INTEGER NOT NULL DEFAULT 0,
  details_json TEXT,
  last_error TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legacy_cleanup_status
  ON legacy_publication_cleanup(status, updated_at DESC);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES
  ('dr_backup_enabled','1',CURRENT_TIMESTAMP),
  ('dr_backup_interval_hours','24',CURRENT_TIMESTAMP),
  ('dr_backup_retry_hours','6',CURRENT_TIMESTAMP),
  ('dr_backup_retention_days','30',CURRENT_TIMESTAMP),
  ('dr_backup_chunk_rows','500',CURRENT_TIMESTAMP);
