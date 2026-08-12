CREATE TABLE IF NOT EXISTS product_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT,
  event_name TEXT NOT NULL,
  user_id INTEGER,
  session_id TEXT,
  submission_id INTEGER,
  catalog_id INTEGER,
  surface TEXT,
  event_value TEXT,
  query_text TEXT,
  metadata_json TEXT,
  source TEXT NOT NULL DEFAULT 'client' CHECK (source IN ('client','server')),
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_events_event_id
  ON product_events(event_id)
  WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_product_events_name_created
  ON product_events(event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_user_created
  ON product_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_created
  ON product_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_product_events_query_created
  ON product_events(query_text, created_at DESC)
  WHERE query_text IS NOT NULL;
