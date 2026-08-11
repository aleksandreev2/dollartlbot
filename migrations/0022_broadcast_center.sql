ALTER TABLE broadcasts ADD COLUMN audience TEXT NOT NULL DEFAULT 'release_followers'
  CHECK (audience IN ('release_followers','all','unused_quota','has_requests','no_requests'));

ALTER TABLE broadcasts ADD COLUMN preference_key TEXT NOT NULL DEFAULT 'notify_releases'
  CHECK (preference_key IN ('notify_releases','notify_announcements'));

ALTER TABLE broadcasts ADD COLUMN action_url TEXT;
ALTER TABLE broadcasts ADD COLUMN template_key TEXT;
ALTER TABLE broadcasts ADD COLUMN created_by INTEGER;

CREATE TABLE IF NOT EXISTS broadcast_localizations (
  broadcast_id INTEGER NOT NULL,
  locale TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  action_label TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (broadcast_id, locale),
  FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_broadcast_localizations_broadcast
  ON broadcast_localizations(broadcast_id, locale);

CREATE INDEX IF NOT EXISTS idx_broadcasts_kind_created
  ON broadcasts(kind, id DESC);
