PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS anti_abuse_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT,
  hits INTEGER NOT NULL DEFAULT 1,
  window_seconds INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_anti_abuse_events_user_time
  ON anti_abuse_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_anti_abuse_events_decision_time
  ON anti_abuse_events(decision, created_at DESC);

CREATE TABLE IF NOT EXISTS anti_abuse_user_stats (
  user_id INTEGER PRIMARY KEY,
  total_limited INTEGER NOT NULL DEFAULT 0,
  total_temp_blocks INTEGER NOT NULL DEFAULT 0,
  abuse_score INTEGER NOT NULL DEFAULT 0,
  last_action TEXT,
  last_decision TEXT,
  last_reason TEXT,
  last_event_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('anti_abuse_mode','monitor',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('anti_abuse_global_limit_10s','12',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('anti_abuse_global_limit_60s','60',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('anti_abuse_commands_limit_10s','5',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('anti_abuse_commands_limit_60s','20',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('anti_abuse_callbacks_limit_10s','8',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('anti_abuse_callbacks_limit_60s','30',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('anti_abuse_same_action_cooldown_ms','1500',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('anti_abuse_temp_block_seconds','900',datetime('now'));
