PRAGMA foreign_keys=ON;

ALTER TABLE submissions ADD COLUMN cover_version TEXT;

CREATE TABLE IF NOT EXISTS cover_variants (
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  cover_version TEXT NOT NULL,
  width INTEGER NOT NULL,
  format TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY(submission_id, cover_version, width, format)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cover_variants_r2_key
  ON cover_variants(r2_key);
CREATE INDEX IF NOT EXISTS idx_cover_variants_submission_version
  ON cover_variants(submission_id, cover_version);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('cover_variants_enabled','0',datetime('now'));
