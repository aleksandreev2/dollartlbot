ALTER TABLE users ADD COLUMN quota_unlimited INTEGER NOT NULL DEFAULT 0 CHECK (quota_unlimited IN (0,1));

CREATE TABLE IF NOT EXISTS quota_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  month_key TEXT NOT NULL,
  delta INTEGER NOT NULL CHECK (delta BETWEEN -1000 AND 1000),
  reason TEXT,
  admin_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quota_events_user_month ON quota_events(user_id, month_key, id DESC);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  details TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_created ON admin_audit_log(id DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_type, target_id, id DESC);

CREATE TABLE IF NOT EXISTS cover_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT,
  source TEXT NOT NULL CHECK (source IN ('epub','admin')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cover_versions_submission ON cover_versions(submission_id, id DESC);
INSERT INTO cover_versions (submission_id, r2_key, mime_type, source, created_at)
SELECT id, cover_key, cover_mime, COALESCE(cover_source, 'admin'), COALESCE(cover_updated_at, updated_at)
FROM submissions
WHERE cover_key IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM cover_versions cv WHERE cv.submission_id = submissions.id AND cv.r2_key = submissions.cover_key);

ALTER TABLE publication_assets ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (delivery_status IN ('pending','sent','failed'));
ALTER TABLE publication_assets ADD COLUMN delivered_message_id INTEGER;
ALTER TABLE publication_assets ADD COLUMN delivery_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE publication_assets ADD COLUMN last_delivery_attempt_at TEXT;
ALTER TABLE publication_assets ADD COLUMN delivery_error TEXT;

ALTER TABLE publications ADD COLUMN comments_check_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (comments_check_status IN ('pending','complete','needs_attention','not_required'));
ALTER TABLE publications ADD COLUMN comments_checked_at TEXT;
ALTER TABLE publications ADD COLUMN comments_check_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE publications ADD COLUMN bot_comment_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (bot_comment_status IN ('pending','sent','failed','disabled'));
ALTER TABLE publications ADD COLUMN bot_comment_message_id INTEGER;
ALTER TABLE publications ADD COLUMN bot_comment_error TEXT;

UPDATE publications SET bot_comment_status='disabled' WHERE add_bot_comment=0;
