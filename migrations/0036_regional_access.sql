PRAGMA foreign_keys=ON;

ALTER TABLE users ADD COLUMN country_code TEXT;
ALTER TABLE users ADD COLUMN country_verified_at TEXT;
ALTER TABLE users ADD COLUMN country_source TEXT;

CREATE INDEX IF NOT EXISTS idx_users_country_verified
  ON users(country_code, country_verified_at);

CREATE TABLE IF NOT EXISTS region_verification_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE CASCADE,
  pending_action_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  verified_country_code TEXT
);
CREATE INDEX IF NOT EXISTS idx_region_challenges_user_expiry
  ON region_verification_challenges(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS idx_region_challenges_expiry
  ON region_verification_challenges(expires_at);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('regional_routing_enabled','1',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('regional_restricted_countries','AM,AZ,BY,KZ,KG,MD,RU,TJ,TM,UZ',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('regional_russian_channel_url','https://t.me/domnekromanta',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('regional_country_ttl_days','30',datetime('now'));
INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES ('regional_challenge_ttl_minutes','10',datetime('now'));
