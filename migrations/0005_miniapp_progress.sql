ALTER TABLE submissions ADD COLUMN current_chapter INTEGER;
ALTER TABLE submissions ADD COLUMN progress_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_active_progress
  ON submissions(status, queue_status, progress_updated_at, id);
