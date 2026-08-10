INSERT OR IGNORE INTO app_settings (key, value, updated_at) VALUES
  ('access_channel_id', '@dollartranslate', datetime('now')),
  ('access_channel_url', 'https://t.me/dollartranslate', datetime('now'));

CREATE TABLE IF NOT EXISTS access_membership_cache (
  user_id INTEGER NOT NULL,
  channel_key TEXT NOT NULL,
  is_member INTEGER NOT NULL CHECK (is_member IN (0,1)),
  source TEXT NOT NULL DEFAULT 'channel',
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  stale_until TEXT NOT NULL,
  PRIMARY KEY (user_id, channel_key)
);

CREATE INDEX IF NOT EXISTS idx_access_membership_cache_stale
  ON access_membership_cache(stale_until);
