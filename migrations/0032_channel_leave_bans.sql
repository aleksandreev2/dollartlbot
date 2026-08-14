CREATE TABLE IF NOT EXISTS channel_leave_bans (
  user_id INTEGER PRIMARY KEY,
  channel_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  leave_count INTEGER NOT NULL DEFAULT 1,
  banned_at TEXT NOT NULL,
  telegram_ban_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (telegram_ban_status IN ('pending', 'applied', 'failed')),
  appeal_state TEXT NOT NULL DEFAULT 'none'
    CHECK (appeal_state IN ('none', 'awaiting_text', 'pending', 'approved', 'rejected')),
  appeal_text TEXT,
  appeal_created_at TEXT,
  appeal_reviewed_at TEXT,
  appeal_reviewed_by INTEGER,
  last_language TEXT NOT NULL DEFAULT 'en',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_leave_bans_active
  ON channel_leave_bans(active, updated_at DESC);
