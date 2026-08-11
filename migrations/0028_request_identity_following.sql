CREATE TABLE IF NOT EXISTS title_identities (
  identity_type TEXT NOT NULL,
  identity_value TEXT NOT NULL,
  submission_id INTEGER,
  claim_user_id INTEGER,
  claim_request_id TEXT,
  claim_expires_at TEXT,
  source_provider TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (identity_type, identity_value),
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL,
  FOREIGN KEY (claim_user_id) REFERENCES users(telegram_id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_title_identities_submission
  ON title_identities(submission_id, identity_type)
  WHERE submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_title_identities_claim_expiry
  ON title_identities(claim_expires_at)
  WHERE submission_id IS NULL AND claim_expires_at IS NOT NULL;

-- Backfill provider identities that are already attached to non-rejected submissions.
-- INSERT OR IGNORE intentionally chooses one canonical submission if historical
-- duplicates already exist; future writes are protected by the identity PK.
INSERT OR IGNORE INTO title_identities (
  identity_type, identity_value, submission_id, source_provider, created_at, updated_at
)
SELECT
  'novelpia', es.external_id, es.submission_id, es.provider,
  COALESCE(es.created_at, datetime('now')), COALESCE(es.updated_at, datetime('now'))
FROM submission_external_sources es
JOIN submissions s ON s.id = es.submission_id
WHERE es.provider IN ('novelpia', 'raw_fucknovelpia')
  AND es.external_id IS NOT NULL
  AND length(es.external_id) BETWEEN 2 AND 9
  AND es.external_id NOT GLOB '*[^0-9]*'
  AND s.status <> 'rejected'
ORDER BY CASE WHEN s.status = 'accepted' THEN 0 ELSE 1 END, s.id ASC;

INSERT OR IGNORE INTO title_identities (
  identity_type, identity_value, submission_id, source_provider, created_at, updated_at
)
SELECT
  'novelpia', c.external_id, c.linked_submission_id, 'novelpia',
  COALESCE(c.created_at, datetime('now')), COALESCE(c.updated_at, datetime('now'))
FROM discovery_catalog c
JOIN submissions s ON s.id = c.linked_submission_id
WHERE c.provider = 'novelpia'
  AND c.linked_submission_id IS NOT NULL
  AND c.external_id IS NOT NULL
  AND length(c.external_id) BETWEEN 2 AND 9
  AND c.external_id NOT GLOB '*[^0-9]*'
  AND s.status <> 'rejected'
ORDER BY CASE WHEN s.status = 'accepted' THEN 0 ELSE 1 END, s.id ASC;

CREATE TABLE IF NOT EXISTS title_follows (
  user_id INTEGER NOT NULL,
  follow_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, follow_key),
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_title_follows_key
  ON title_follows(follow_key, user_id);

CREATE INDEX IF NOT EXISTS idx_title_follows_user_recent
  ON title_follows(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS title_follow_progress_state (
  submission_id INTEGER PRIMARY KEY,
  last_notified_chapter INTEGER,
  last_notified_at TEXT,
  pending_chapter INTEGER,
  next_notify_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_title_follow_progress_due
  ON title_follow_progress_state(next_notify_at, submission_id)
  WHERE pending_chapter IS NOT NULL;
