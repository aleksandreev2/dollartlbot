ALTER TABLE users ADD COLUMN last_limit_reset_notified_month TEXT;
ALTER TABLE users ADD COLUMN last_promo_at TEXT;
ALTER TABLE users ADD COLUMN promo_opt_out INTEGER NOT NULL DEFAULT 0 CHECK (promo_opt_out IN (0, 1));

ALTER TABLE submissions ADD COLUMN queue_status TEXT CHECK (queue_status IS NULL OR queue_status IN ('queued', 'in_progress', 'completed'));
ALTER TABLE submissions ADD COLUMN queue_position INTEGER;
ALTER TABLE submissions ADD COLUMN queued_at TEXT;
ALTER TABLE submissions ADD COLUMN started_at TEXT;
ALTER TABLE submissions ADD COLUMN completed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_queue
  ON submissions(status, queue_status, queue_position, id);

CREATE INDEX IF NOT EXISTS idx_users_engagement
  ON users(promo_opt_out, last_promo_at, last_limit_reset_notified_month);

-- Preserve older accepted requests by placing them into the queue.
UPDATE submissions
SET queue_status = 'queued',
    queue_position = id,
    queued_at = COALESCE(queued_at, updated_at)
WHERE status = 'accepted' AND queue_status IS NULL;
