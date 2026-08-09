ALTER TABLE submissions ADD COLUMN client_request_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_user_client_request
  ON submissions(user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS submission_intake_reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  request_id TEXT NOT NULL,
  payload_fingerprint TEXT NOT NULL,
  month_key TEXT NOT NULL,
  quota_source TEXT NOT NULL CHECK (quota_source IN ('base', 'referral')),
  referral_id INTEGER REFERENCES referrals(id),
  state TEXT NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'committed', 'failed')),
  raw_file_id TEXT,
  raw_file_name TEXT,
  raw_file_mime TEXT,
  submission_id INTEGER REFERENCES submissions(id) ON DELETE SET NULL,
  expires_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, request_id),
  FOREIGN KEY (user_id) REFERENCES users(telegram_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_intake_user_month
  ON submission_intake_reservations(user_id, month_key, state, expires_at);

CREATE INDEX IF NOT EXISTS idx_submission_intake_expiry
  ON submission_intake_reservations(state, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_submission_intake_active_referral
  ON submission_intake_reservations(referral_id)
  WHERE state = 'reserved' AND referral_id IS NOT NULL;
