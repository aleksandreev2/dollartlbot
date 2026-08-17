PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS reader_daily_titles (
  day_key TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  first_publication_id INTEGER REFERENCES publications(id) ON DELETE SET NULL,
  first_asset_id INTEGER REFERENCES publication_assets(id) ON DELETE SET NULL,
  first_delivered_at TEXT NOT NULL,
  plan_snapshot TEXT NOT NULL CHECK (plan_snapshot IN ('free','boosty')),
  PRIMARY KEY (day_key, user_id, submission_id)
);
CREATE INDEX IF NOT EXISTS idx_reader_daily_titles_user_day
  ON reader_daily_titles(user_id, day_key, first_delivered_at DESC);
CREATE INDEX IF NOT EXISTS idx_reader_daily_titles_submission
  ON reader_daily_titles(submission_id, first_delivered_at DESC);

-- Short-lived reservations make the five-title limit race-safe without burning a
-- slot before Telegram has successfully delivered the first file.
CREATE TABLE IF NOT EXISTS reader_daily_reservations (
  day_key TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reservation_token TEXT NOT NULL UNIQUE,
  reserved_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (day_key, user_id, submission_id)
);
CREATE INDEX IF NOT EXISTS idx_reader_daily_reservations_expiry
  ON reader_daily_reservations(expires_at);

CREATE TABLE IF NOT EXISTS reader_terms_acceptance (
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  terms_version INTEGER NOT NULL CHECK (terms_version > 0),
  locale TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('telegram','miniapp')),
  accepted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, terms_version)
);

CREATE TABLE IF NOT EXISTS reader_download_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  publication_id INTEGER NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('telegram','miniapp')),
  granted_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_reader_download_grants_lookup
  ON reader_download_grants(user_id, publication_id, expires_at DESC);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES
  ('reader_terms_enabled','1',CURRENT_TIMESTAMP),
  ('reader_terms_version','1',CURRENT_TIMESTAMP),
  ('reader_daily_quota_mode','monitor',CURRENT_TIMESTAMP),
  ('reader_daily_quota_limit','5',CURRENT_TIMESTAMP);
