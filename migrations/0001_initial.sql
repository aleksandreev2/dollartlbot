CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  username TEXT,
  first_name TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  language_selected INTEGER NOT NULL DEFAULT 0 CHECK (language_selected IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  user_id INTEGER PRIMARY KEY,
  step TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  username_snapshot TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  month_key TEXT NOT NULL,
  title TEXT NOT NULL,
  original_language TEXT NOT NULL,
  chapter_count INTEGER NOT NULL CHECK (chapter_count > 0),
  publication_status TEXT NOT NULL CHECK (publication_status IN ('ongoing', 'completed')),
  source_url TEXT,
  raw_file_id TEXT NOT NULL,
  raw_file_name TEXT,
  raw_file_mime TEXT,
  genres_tags TEXT NOT NULL,
  sexual_content TEXT NOT NULL,
  sensitive_content TEXT NOT NULL,
  notes TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('free', 'subscriber')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  slot_returned INTEGER NOT NULL DEFAULT 0 CHECK (slot_returned IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_submissions_user_month
  ON submissions(user_id, month_key, slot_returned);

CREATE TABLE IF NOT EXISTS admin_sessions (
  admin_user_id INTEGER PRIMARY KEY,
  submission_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processed_updates (
  update_id INTEGER PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_processed_updates_created_at
  ON processed_updates(created_at);
