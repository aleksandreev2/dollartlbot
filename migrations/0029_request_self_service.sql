ALTER TABLE submissions ADD COLUMN review_state TEXT NOT NULL DEFAULT 'ready'
  CHECK (review_state IN ('ready', 'needs_info', 'user_replied'));
ALTER TABLE submissions ADD COLUMN review_requested_at TEXT;
ALTER TABLE submissions ADD COLUMN review_requested_by INTEGER;
ALTER TABLE submissions ADD COLUMN review_resolved_at TEXT;
ALTER TABLE submissions ADD COLUMN withdrawn_at TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_review_state
  ON submissions(status, review_state, id DESC);

CREATE TABLE IF NOT EXISTS submission_conversation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('admin', 'user', 'system')),
  author_user_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'message' CHECK (kind IN (
    'message', 'needs_info', 'user_reply', 'edit', 'raw_replaced', 'withdrawn', 'resolved'
  )),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_conversation_request
  ON submission_conversation(submission_id, id ASC);

CREATE TABLE IF NOT EXISTS submission_raw_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  old_file_id TEXT NOT NULL,
  old_file_name TEXT,
  old_file_mime TEXT,
  new_file_id TEXT NOT NULL,
  new_file_name TEXT,
  new_file_mime TEXT,
  replaced_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (replaced_by_user_id) REFERENCES users(telegram_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_submission_raw_history_request
  ON submission_raw_history(submission_id, id DESC);

-- IMPORTANT: keep D1 migration files to top-level statements only.
-- Remote D1 migration execution can split CREATE TRIGGER ... BEGIN ... END bodies
-- differently from the local workerd path and surface SQLITE_ERROR: incomplete input.
-- RAW-history truthfulness is therefore enforced in the Worker by a conditional
-- INSERT that only records a replacement when the uploaded Telegram file is still
-- the active RAW on the pending request.
