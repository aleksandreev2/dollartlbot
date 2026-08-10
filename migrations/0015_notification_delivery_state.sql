ALTER TABLE user_notifications ADD COLUMN preference_key TEXT;
ALTER TABLE user_notifications ADD COLUMN dedupe_key TEXT;
ALTER TABLE user_notifications ADD COLUMN telegram_status TEXT CHECK (telegram_status IN ('queued','retry','sent','failed','skipped'));
ALTER TABLE user_notifications ADD COLUMN telegram_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_notifications ADD COLUMN telegram_next_attempt_at TEXT;
ALTER TABLE user_notifications ADD COLUMN telegram_sent_at TEXT;
ALTER TABLE user_notifications ADD COLUMN telegram_last_error TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_dedupe
  ON user_notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_telegram_due
  ON user_notifications(telegram_status, telegram_next_attempt_at, id);

CREATE TABLE IF NOT EXISTS submission_notification_state (
  submission_id INTEGER PRIMARY KEY,
  last_progress_notified_chapter INTEGER,
  last_progress_notified_at TEXT,
  pending_progress_chapter INTEGER,
  next_progress_notify_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_notification_due
  ON submission_notification_state(next_progress_notify_at, submission_id)
  WHERE pending_progress_chapter IS NOT NULL;
