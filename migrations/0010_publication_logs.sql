CREATE TABLE IF NOT EXISTS publication_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_id INTEGER,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','success','warning','error')),
  event TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (publication_id) REFERENCES publications(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_publication_logs_publication_id ON publication_logs(publication_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_publication_logs_created_at ON publication_logs(created_at DESC);
