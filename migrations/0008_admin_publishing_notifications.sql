CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
  ('publish_channel_id', '', datetime('now')),
  ('discussion_chat_id', '', datetime('now')),
  ('donation_url', 'https://boosty.to/domnekromanta/single-payment/donation/818248/target?share=target_link', datetime('now')),
  ('bot_username', 'dollartlbot', datetime('now'));

CREATE TABLE IF NOT EXISTS publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','publishing','published','failed')),
  internal_title TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  add_footer INTEGER NOT NULL DEFAULT 1 CHECK (add_footer IN (0,1)),
  add_donate INTEGER NOT NULL DEFAULT 1 CHECK (add_donate IN (0,1)),
  add_bot_comment INTEGER NOT NULL DEFAULT 1 CHECK (add_bot_comment IN (0,1)),
  notify_users INTEGER NOT NULL DEFAULT 0 CHECK (notify_users IN (0,1)),
  image_key TEXT,
  image_mime TEXT,
  channel_message_id INTEGER,
  discussion_message_id INTEGER,
  error_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_publications_status_id ON publications(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_publications_channel_message ON publications(channel_message_id);

CREATE TABLE IF NOT EXISTS publication_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('file')),
  file_name TEXT NOT NULL,
  mime_type TEXT,
  r2_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  telegram_file_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_publication_assets_publication ON publication_assets(publication_id, sort_order, id);

ALTER TABLE users ADD COLUMN notify_request_updates INTEGER NOT NULL DEFAULT 1 CHECK (notify_request_updates IN (0,1));
ALTER TABLE users ADD COLUMN notify_releases INTEGER NOT NULL DEFAULT 1 CHECK (notify_releases IN (0,1));
ALTER TABLE users ADD COLUMN notify_announcements INTEGER NOT NULL DEFAULT 1 CHECK (notify_announcements IN (0,1));
ALTER TABLE users ADD COLUMN notify_referrals INTEGER NOT NULL DEFAULT 1 CHECK (notify_referrals IN (0,1));

CREATE TABLE IF NOT EXISTS user_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_url TEXT,
  created_at TEXT NOT NULL,
  read_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, read_at, id DESC);

CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'release',
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  cursor_user_id INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_broadcasts_status_id ON broadcasts(status, id);
