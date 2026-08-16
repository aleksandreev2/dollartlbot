PRAGMA foreign_keys=ON;

ALTER TABLE publication_assets ADD COLUMN scan_claimed_at TEXT;
ALTER TABLE publication_assets ADD COLUMN scan_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE publication_assets ADD COLUMN scan_last_attempt_at TEXT;
ALTER TABLE publication_assets ADD COLUMN scan_next_attempt_at TEXT;
ALTER TABLE publication_assets ADD COLUMN quarantined_at TEXT;
ALTER TABLE publication_assets ADD COLUMN quarantine_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_publication_assets_scan_queue
  ON publication_assets(scan_status, scan_next_attempt_at, scan_claimed_at, id);
CREATE INDEX IF NOT EXISTS idx_publication_assets_quarantine
  ON publication_assets(quarantined_at, scan_status, id);

CREATE TABLE IF NOT EXISTS asset_scanner_health (
  scanner_id TEXT PRIMARY KEY,
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0,1)),
  engine TEXT,
  engine_version TEXT,
  signatures_version TEXT,
  last_seen_at TEXT NOT NULL,
  last_scan_at TEXT,
  last_error TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_asset_scanner_health_seen
  ON asset_scanner_health(last_seen_at DESC);

DELETE FROM file_scan_cache WHERE verdict='failed';

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('asset_scan_scanner_stale_seconds','900',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('asset_scan_claim_timeout_seconds','900',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('asset_scan_max_attempts','5',datetime('now'));
