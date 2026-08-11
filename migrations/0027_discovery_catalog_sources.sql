CREATE TABLE IF NOT EXISTS discovery_catalog_sources (
  catalog_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT,
  page_url TEXT NOT NULL,
  original_url TEXT,
  available INTEGER NOT NULL DEFAULT 0 CHECK (available IN (0, 1)),
  verification_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (verification_status IN ('unknown', 'verified', 'not_found', 'error')),
  metadata_json TEXT,
  last_checked_at TEXT,
  next_check_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (catalog_id, provider),
  FOREIGN KEY (catalog_id) REFERENCES discovery_catalog(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discovery_catalog_sources_due
  ON discovery_catalog_sources(provider, next_check_at, verification_status);

CREATE INDEX IF NOT EXISTS idx_discovery_catalog_sources_external
  ON discovery_catalog_sources(provider, external_id);
