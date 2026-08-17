PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS title_ratings (
  submission_id INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (submission_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_title_ratings_submission
  ON title_ratings(submission_id, rating, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_title_ratings_user
  ON title_ratings(user_id, updated_at DESC);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES
  ('reader_library_enabled','1',CURRENT_TIMESTAMP),
  ('reader_ratings_enabled','1',CURRENT_TIMESTAMP);
