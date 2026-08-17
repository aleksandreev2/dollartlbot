PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS distribution_identities (
  distribution_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(telegram_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS reader_personalized_assets (
  asset_id INTEGER NOT NULL REFERENCES publication_assets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  distribution_id TEXT NOT NULL REFERENCES distribution_identities(distribution_id) ON DELETE RESTRICT,
  fingerprint_version INTEGER NOT NULL DEFAULT 1,
  generator_version TEXT NOT NULL,
  master_sha256 TEXT,
  personalized_sha256 TEXT,
  telegram_file_id TEXT,
  temporary_r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','ready','failed')),
  last_error TEXT,
  generated_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (asset_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reader_personalized_distribution
  ON reader_personalized_assets(distribution_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reader_personalized_status
  ON reader_personalized_assets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_reader_personalized_sha
  ON reader_personalized_assets(personalized_sha256);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES
  ('reader_personalized_epub_enabled','0',CURRENT_TIMESTAMP),
  ('reader_personalized_pdf_enabled','0',CURRENT_TIMESTAMP),
  ('reader_fingerprint_fail_closed','0',CURRENT_TIMESTAMP),
  ('reader_fingerprint_version','1',CURRENT_TIMESTAMP);
