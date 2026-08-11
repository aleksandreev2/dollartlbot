CREATE TABLE IF NOT EXISTS publication_editor_drafts (
  admin_user_id INTEGER PRIMARY KEY,
  internal_title TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  add_footer INTEGER NOT NULL DEFAULT 1 CHECK (add_footer IN (0,1)),
  add_donate INTEGER NOT NULL DEFAULT 1 CHECK (add_donate IN (0,1)),
  add_bot_comment INTEGER NOT NULL DEFAULT 1 CHECK (add_bot_comment IN (0,1)),
  notify_users INTEGER NOT NULL DEFAULT 0 CHECK (notify_users IN (0,1)),
  submission_id INTEGER,
  source_publication_id INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS publication_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  internal_title TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL,
  add_footer INTEGER NOT NULL DEFAULT 1 CHECK (add_footer IN (0,1)),
  add_donate INTEGER NOT NULL DEFAULT 1 CHECK (add_donate IN (0,1)),
  add_bot_comment INTEGER NOT NULL DEFAULT 1 CHECK (add_bot_comment IN (0,1)),
  notify_users INTEGER NOT NULL DEFAULT 0 CHECK (notify_users IN (0,1)),
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_publication_templates_updated
  ON publication_templates(updated_at DESC, id DESC);
