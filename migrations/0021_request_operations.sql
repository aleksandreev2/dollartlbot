CREATE TABLE IF NOT EXISTS submission_admin_meta (
  submission_id INTEGER PRIMARY KEY,
  notes TEXT NOT NULL DEFAULT '',
  duplicate_of_submission_id INTEGER,
  archived_at TEXT,
  archived_by INTEGER,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (duplicate_of_submission_id) REFERENCES submissions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_submission_admin_meta_archived
  ON submission_admin_meta(archived_at, submission_id DESC);
CREATE INDEX IF NOT EXISTS idx_submission_admin_meta_duplicate
  ON submission_admin_meta(duplicate_of_submission_id, submission_id DESC);
