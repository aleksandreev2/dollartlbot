CREATE TABLE IF NOT EXISTS discovery_interests (
  submission_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (submission_id, user_id),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_discovery_interests_submission
  ON discovery_interests(submission_id, created_at);

CREATE TABLE IF NOT EXISTS submission_external_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT,
  page_url TEXT NOT NULL,
  original_url TEXT,
  raw_available INTEGER NOT NULL DEFAULT 0 CHECK (raw_available IN (0, 1)),
  metadata_json TEXT,
  last_checked_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  UNIQUE(submission_id, provider),
  UNIQUE(provider, external_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_external_sources_submission
  ON submission_external_sources(submission_id, provider);
