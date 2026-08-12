CREATE TABLE IF NOT EXISTS broadcast_automations (
  automation_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  updated_by INTEGER,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO broadcast_automations (automation_key, enabled, updated_by, updated_at)
VALUES ('unused_quota_reminders', 1, NULL, datetime('now'));
