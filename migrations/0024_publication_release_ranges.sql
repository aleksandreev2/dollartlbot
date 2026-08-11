ALTER TABLE publications ADD COLUMN chapter_start INTEGER;
ALTER TABLE publications ADD COLUMN chapter_end INTEGER;

CREATE INDEX IF NOT EXISTS idx_publications_submission_release
  ON publications(submission_id, status, published_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS publication_release_range_drafts (
  admin_user_id INTEGER PRIMARY KEY,
  chapter_start INTEGER,
  chapter_end INTEGER,
  updated_at TEXT NOT NULL
);
