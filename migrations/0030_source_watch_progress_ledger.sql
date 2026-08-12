-- Remote-D1-safe migration: top-level statements only. Do not add CREATE TRIGGER bodies here.

CREATE TABLE IF NOT EXISTS submission_progress_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  from_chapter INTEGER,
  to_chapter INTEGER,
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'baseline', 'admin_progress', 'completed', 'reopened', 'publication_release'
  )),
  publication_id INTEGER,
  admin_user_id INTEGER,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_submission_progress_events_request
  ON submission_progress_events(submission_id, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_progress_events_publication
  ON submission_progress_events(publication_id, event_kind);

CREATE TABLE IF NOT EXISTS submission_source_watch (
  submission_id INTEGER PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'novelpia' CHECK (provider IN ('novelpia')),
  external_id TEXT NOT NULL,
  last_attempt_at TEXT,
  last_success_at TEXT,
  next_check_at TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_remote_chapter_count INTEGER,
  last_remote_publication_status TEXT,
  last_remote_title TEXT,
  last_change_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_source_watch_due
  ON submission_source_watch(next_check_at, failure_count, submission_id);

CREATE TABLE IF NOT EXISTS submission_source_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  action TEXT NOT NULL CHECK (action IN ('auto_applied', 'review_required', 'observed')),
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_source_events_request
  ON submission_source_events(submission_id, id DESC);

-- Existing progress cannot be reconstructed precisely, so preserve the current snapshot as a baseline.
INSERT INTO submission_progress_events (
  submission_id, from_chapter, to_chapter, event_kind, publication_id, admin_user_id, metadata_json, created_at
)
SELECT s.id, NULL, s.current_chapter, 'baseline', NULL, NULL, '{"backfill":true}',
       COALESCE(s.progress_updated_at, s.updated_at, s.created_at)
FROM submissions s
WHERE s.status='accepted'
  AND s.current_chapter IS NOT NULL
  AND s.current_chapter > 0
  AND NOT EXISTS (
    SELECT 1 FROM submission_progress_events e WHERE e.submission_id=s.id
  );

-- Published structured releases are reliable historical evidence and can be backfilled idempotently.
INSERT OR IGNORE INTO submission_progress_events (
  submission_id, from_chapter, to_chapter, event_kind, publication_id, admin_user_id, metadata_json, created_at
)
SELECT p.submission_id, NULL, p.chapter_end, 'publication_release', p.id, NULL,
       '{"backfill":true}', COALESCE(p.published_at, p.updated_at, p.created_at)
FROM publications p
WHERE p.status='published'
  AND p.submission_id IS NOT NULL
  AND p.chapter_end IS NOT NULL
  AND p.chapter_end > 0;
