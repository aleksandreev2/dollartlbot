ALTER TABLE user_notifications ADD COLUMN broadcast_id INTEGER REFERENCES broadcasts(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_notifications_broadcast
  ON user_notifications(user_id, broadcast_id)
  WHERE broadcast_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  broadcast_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'retry', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  telegram_sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (broadcast_id, user_id),
  FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_due
  ON broadcast_recipients(broadcast_id, status, next_attempt_at, user_id);

CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status
  ON broadcast_recipients(status, next_attempt_at);
