ALTER TABLE users ADD COLUMN activated_at TEXT;
ALTER TABLE users ADD COLUMN activated_via TEXT CHECK (activated_via IN ('legacy','bot','miniapp'));
ALTER TABLE users ADD COLUMN last_seen_at TEXT;

-- Existing accounts predate activation tracking. Mark them as already activated so
-- deploying this migration never floods the admin with fake "new user" alerts.
UPDATE users
SET activated_at = COALESCE(activated_at, created_at),
    activated_via = COALESCE(activated_via, 'legacy'),
    last_seen_at = COALESCE(last_seen_at, updated_at, created_at);

CREATE INDEX IF NOT EXISTS idx_users_activated_at
  ON users(activated_at DESC, telegram_id DESC);
CREATE INDEX IF NOT EXISTS idx_users_last_seen_at
  ON users(last_seen_at DESC, telegram_id DESC);

CREATE TABLE IF NOT EXISTS admin_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info','warning','error')),
  user_id INTEGER,
  submission_id INTEGER,
  publication_id INTEGER,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  action_url TEXT,
  dedupe_key TEXT,
  details TEXT,
  read_at TEXT,
  telegram_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (telegram_status IN ('queued','sending','retry','sent','failed','skipped')),
  telegram_attempts INTEGER NOT NULL DEFAULT 0,
  telegram_next_attempt_at TEXT,
  telegram_sent_at TEXT,
  telegram_last_error TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE SET NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_events_dedupe
  ON admin_events(dedupe_key)
  WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_events_unread
  ON admin_events(read_at, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_events_type
  ON admin_events(type, id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_events_telegram_due
  ON admin_events(telegram_status, telegram_next_attempt_at, id);
