PRAGMA foreign_keys=ON;

ALTER TABLE publication_assets ADD COLUMN sha256 TEXT;
ALTER TABLE publication_assets ADD COLUMN detected_mime TEXT;
ALTER TABLE publication_assets ADD COLUMN scan_status TEXT NOT NULL DEFAULT 'legacy_unscanned';
ALTER TABLE publication_assets ADD COLUMN scan_engine TEXT;
ALTER TABLE publication_assets ADD COLUMN scan_engine_version TEXT;
ALTER TABLE publication_assets ADD COLUMN scan_signatures_version TEXT;
ALTER TABLE publication_assets ADD COLUMN scan_threat_name TEXT;
ALTER TABLE publication_assets ADD COLUMN scanned_at TEXT;
ALTER TABLE publication_assets ADD COLUMN scan_error TEXT;

CREATE INDEX IF NOT EXISTS idx_publication_assets_scan_status
  ON publication_assets(scan_status, publication_id);
CREATE INDEX IF NOT EXISTS idx_publication_assets_sha256
  ON publication_assets(sha256)
  WHERE sha256 IS NOT NULL;

CREATE TABLE IF NOT EXISTS file_scan_cache (
  sha256 TEXT PRIMARY KEY,
  verdict TEXT NOT NULL,
  detected_mime TEXT,
  engine TEXT NOT NULL,
  engine_version TEXT,
  signatures_version TEXT,
  threat_name TEXT,
  scanned_at TEXT NOT NULL,
  expires_at TEXT,
  metadata_json TEXT
);
CREATE INDEX IF NOT EXISTS idx_file_scan_cache_expiry
  ON file_scan_cache(expires_at)
  WHERE expires_at IS NOT NULL;

INSERT OR IGNORE INTO app_settings(key,value) VALUES ('asset_scan_enforcement','0');
INSERT OR IGNORE INTO app_settings(key,value) VALUES ('asset_scan_cache_ttl_days','7');
