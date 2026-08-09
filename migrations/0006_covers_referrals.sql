CREATE TABLE IF NOT EXISTS referral_invites (
  referrer_user_id INTEGER PRIMARY KEY,
  invite_link TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  referrer_user_id INTEGER NOT NULL,
  referred_user_id INTEGER NOT NULL UNIQUE,
  invite_link TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'cancelled', 'qualified')),
  joined_at TEXT NOT NULL,
  left_at TEXT,
  qualified_at TEXT,
  reward_granted INTEGER NOT NULL DEFAULT 0 CHECK (reward_granted IN (0, 1)),
  reward_month_key TEXT,
  reward_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_status
  ON referrals(referrer_user_id, status, reward_granted);
CREATE INDEX IF NOT EXISTS idx_referrals_pending_joined
  ON referrals(status, joined_at);
CREATE INDEX IF NOT EXISTS idx_referrals_invite_link
  ON referrals(invite_link);

ALTER TABLE submissions ADD COLUMN quota_source TEXT NOT NULL DEFAULT 'base'
  CHECK (quota_source IN ('base', 'referral'));
ALTER TABLE submissions ADD COLUMN referral_id INTEGER REFERENCES referrals(id);
ALTER TABLE submissions ADD COLUMN cover_key TEXT;
ALTER TABLE submissions ADD COLUMN cover_source TEXT CHECK (cover_source IS NULL OR cover_source IN ('epub', 'admin'));
ALTER TABLE submissions ADD COLUMN cover_mime TEXT;
ALTER TABLE submissions ADD COLUMN cover_updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_referral_id
  ON submissions(referral_id);
CREATE INDEX IF NOT EXISTS idx_submissions_user_month_quota
  ON submissions(user_id, month_key, quota_source, slot_returned);
