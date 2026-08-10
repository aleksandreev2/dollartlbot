ALTER TABLE publications ADD COLUMN submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL;
ALTER TABLE publications ADD COLUMN requester_username_snapshot TEXT;

CREATE INDEX IF NOT EXISTS idx_publications_submission_id
  ON publications(submission_id, id DESC);
