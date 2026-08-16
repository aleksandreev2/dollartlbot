PRAGMA foreign_keys=ON;

ALTER TABLE publications ADD COLUMN download_gate_status TEXT NOT NULL DEFAULT 'disabled';
ALTER TABLE publications ADD COLUMN download_gate_message_id INTEGER;
ALTER TABLE publications ADD COLUMN download_gate_error TEXT;

CREATE TABLE IF NOT EXISTS publication_download_tokens (
  token TEXT PRIMARY KEY,
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_publication_download_tokens_active
  ON publication_download_tokens(publication_id)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS publication_reader_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  asset_id INTEGER REFERENCES publication_assets(id) ON DELETE SET NULL,
  user_id INTEGER NOT NULL,
  username_snapshot TEXT,
  first_name_snapshot TEXT,
  last_name_snapshot TEXT,
  event_type TEXT NOT NULL,
  source_chat_id TEXT,
  source_message_id INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reader_events_publication_time
  ON publication_reader_events(publication_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reader_events_user_time
  ON publication_reader_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reader_events_publication_user_time
  ON publication_reader_events(publication_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reader_events_type_time
  ON publication_reader_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS publication_deliveries (
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  asset_id INTEGER NOT NULL REFERENCES publication_assets(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  first_requested_at TEXT NOT NULL,
  last_requested_at TEXT NOT NULL,
  delivered_at TEXT,
  telegram_message_id INTEGER,
  last_error TEXT,
  PRIMARY KEY(publication_id, asset_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_publication_deliveries_user_time
  ON publication_deliveries(user_id, last_requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_publication_deliveries_publication_status
  ON publication_deliveries(publication_id, status, last_requested_at DESC);

CREATE TABLE IF NOT EXISTS publication_reader_stats (
  publication_id INTEGER PRIMARY KEY REFERENCES publications(id) ON DELETE CASCADE,
  thank_you_clicks INTEGER NOT NULL DEFAULT 0,
  unique_clickers INTEGER NOT NULL DEFAULT 0,
  delivery_successes INTEGER NOT NULL DEFAULT 0,
  unique_readers INTEGER NOT NULL DEFAULT 0,
  repeat_deliveries INTEGER NOT NULL DEFAULT 0,
  delivery_failures INTEGER NOT NULL DEFAULT 0,
  access_denied INTEGER NOT NULL DEFAULT 0,
  rate_limited INTEGER NOT NULL DEFAULT 0,
  donate_clicks INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publication_user_stats (
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  username_snapshot TEXT,
  first_name_snapshot TEXT,
  last_name_snapshot TEXT,
  thank_you_clicks INTEGER NOT NULL DEFAULT 0,
  delivery_successes INTEGER NOT NULL DEFAULT 0,
  delivery_failures INTEGER NOT NULL DEFAULT 0,
  repeat_deliveries INTEGER NOT NULL DEFAULT 0,
  donate_clicks INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY(publication_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_publication_user_stats_user
  ON publication_user_stats(user_id, last_seen_at DESC);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('download_gate_enabled','0',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('donate_tracking_enabled','1',datetime('now'));
