CREATE TABLE IF NOT EXISTS channel_leave_auto_bans (
  user_id INTEGER NOT NULL,
  channel_key TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  username TEXT,
  first_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','retry','banned','exempt','unbanned','failed')),
  exemption_reason TEXT,
  leave_count INTEGER NOT NULL DEFAULT 1,
  left_at TEXT NOT NULL,
  banned_at TEXT,
  unbanned_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  actor_user_id INTEGER,
  old_status TEXT,
  new_status TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, channel_key)
);

CREATE INDEX IF NOT EXISTS idx_channel_leave_auto_bans_queue
  ON channel_leave_auto_bans(status, next_attempt_at, attempts);
CREATE INDEX IF NOT EXISTS idx_channel_leave_auto_bans_left
  ON channel_leave_auto_bans(left_at DESC);

INSERT OR IGNORE INTO app_settings(key,value) VALUES
  ('channel_leave_autoban_enabled','1'),
  ('channel_leave_autoban_boosty_exempt','1'),
  ('channel_leave_autoban_max_attempts','6');
