PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS leak_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
  publication_id INTEGER REFERENCES publications(id) ON DELETE SET NULL,
  asset_id INTEGER REFERENCES publication_assets(id) ON DELETE SET NULL,
  distribution_id TEXT REFERENCES distribution_identities(distribution_id) ON DELETE SET NULL,
  matched_user_id INTEGER REFERENCES users(telegram_id) ON DELETE SET NULL,
  source_url TEXT,
  source_domain TEXT,
  evidence_sha256 TEXT,
  confidence TEXT NOT NULL DEFAULT 'unknown' CHECK (confidence IN ('unknown','low','medium','high','very_high')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','false_positive','action_taken','resolved')),
  discovered_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by INTEGER,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_leak_incidents_status
  ON leak_incidents(status, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_leak_incidents_distribution
  ON leak_incidents(distribution_id, discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_leak_incidents_user
  ON leak_incidents(matched_user_id, discovered_at DESC);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES
  ('reader_leak_checker_enabled','0',CURRENT_TIMESTAMP),
  ('reader_leak_monitor_enabled','0',CURRENT_TIMESTAMP);
