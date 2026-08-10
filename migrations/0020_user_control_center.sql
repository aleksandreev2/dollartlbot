CREATE TABLE IF NOT EXISTS user_admin_controls (
  user_id INTEGER PRIMARY KEY,
  notes TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  blocked_at TEXT,
  blocked_by INTEGER,
  blocked_reason TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_admin_controls_blocked
  ON user_admin_controls(blocked_at, user_id);

CREATE TABLE IF NOT EXISTS user_admin_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  admin_user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','failed')),
  telegram_message_id INTEGER,
  error_text TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_admin_messages_user
  ON user_admin_messages(user_id, id DESC);
