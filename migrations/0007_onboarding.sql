ALTER TABLE users ADD COLUMN miniapp_onboarded_at TEXT;
ALTER TABLE users ADD COLUMN adult_confirmed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_users_miniapp_onboarded
  ON users(miniapp_onboarded_at);
