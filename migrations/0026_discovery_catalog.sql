CREATE TABLE IF NOT EXISTS discovery_catalog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  original_title TEXT,
  author TEXT,
  original_language TEXT NOT NULL DEFAULT 'Korean',
  chapter_count INTEGER,
  publication_status TEXT,
  genres_tags TEXT NOT NULL DEFAULT '',
  synopsis TEXT,
  source_url TEXT NOT NULL,
  cover_url TEXT,
  source_tier TEXT,
  age_rating TEXT,
  views_count INTEGER NOT NULL DEFAULT 0,
  favorites_count INTEGER NOT NULL DEFAULT 0,
  recommendations_count INTEGER NOT NULL DEFAULT 0,
  raw_available INTEGER NOT NULL DEFAULT 0 CHECK (raw_available IN (0, 1)),
  linked_submission_id INTEGER,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_enriched_at TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, external_id),
  FOREIGN KEY (linked_submission_id) REFERENCES submissions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_discovery_catalog_recent
  ON discovery_catalog(provider, first_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_catalog_link
  ON discovery_catalog(linked_submission_id);

CREATE TABLE IF NOT EXISTS discovery_catalog_signals (
  catalog_id INTEGER NOT NULL,
  signal TEXT NOT NULL,
  rank_position INTEGER,
  metadata_json TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (catalog_id, signal),
  FOREIGN KEY (catalog_id) REFERENCES discovery_catalog(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discovery_catalog_signals_signal
  ON discovery_catalog_signals(signal, rank_position, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS discovery_catalog_interests (
  catalog_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (catalog_id, user_id),
  FOREIGN KEY (catalog_id) REFERENCES discovery_catalog(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discovery_catalog_interests_catalog
  ON discovery_catalog_interests(catalog_id, created_at);

CREATE TABLE IF NOT EXISTS discovery_ingest_state (
  provider TEXT PRIMARY KEY,
  last_attempt_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  last_item_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
