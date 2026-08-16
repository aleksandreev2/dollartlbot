CREATE TABLE IF NOT EXISTS subscription_entitlement_cache (
  user_id INTEGER PRIMARY KEY,
  subscriber INTEGER NOT NULL DEFAULT 0,
  verification_error INTEGER NOT NULL DEFAULT 0,
  checked_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  stale_until TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscription_entitlement_cache_expiry
  ON subscription_entitlement_cache(expires_at);

CREATE TABLE IF NOT EXISTS security_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  event_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  source TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_time
  ON security_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type_time
  ON security_events(event_type, created_at DESC);

CREATE TABLE IF NOT EXISTS incident_alert_state (
  alert_key TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'clear',
  last_fired_at TEXT,
  last_value TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO app_settings(key,value,updated_at) VALUES
  ('security_alerts_enabled','1',CURRENT_TIMESTAMP),
  ('security_alert_cooldown_minutes','60',CURRENT_TIMESTAMP),
  ('subscription_positive_ttl_seconds','300',CURRENT_TIMESTAMP),
  ('subscription_negative_ttl_seconds','45',CURRENT_TIMESTAMP),
  ('subscription_error_ttl_seconds','15',CURRENT_TIMESTAMP),
  ('subscription_stale_positive_minutes','30',CURRENT_TIMESTAMP);
