-- Normalize legacy source values before backend-only URL validation becomes authoritative.
-- Keep this migration to simple statements: remote D1 migration execution can split
-- CREATE TRIGGER bodies differently from the local workerd path. The Worker already
-- normalizes every new submission URL through safeHttpUrl() before INSERT.
UPDATE submissions
SET source_url = NULL,
    updated_at = COALESCE(updated_at, datetime('now'))
WHERE source_url IS NOT NULL
  AND TRIM(source_url) <> ''
  AND LOWER(TRIM(source_url)) NOT LIKE 'http://%'
  AND LOWER(TRIM(source_url)) NOT LIKE 'https://%';
