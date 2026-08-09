-- Remove legacy source values that could become unsafe href schemes in the Mini App.
UPDATE submissions
SET source_url = NULL,
    updated_at = COALESCE(updated_at, datetime('now'))
WHERE source_url IS NOT NULL
  AND TRIM(source_url) <> ''
  AND LOWER(TRIM(source_url)) NOT LIKE 'http://%'
  AND LOWER(TRIM(source_url)) NOT LIKE 'https://%';

CREATE TRIGGER IF NOT EXISTS submissions_source_url_insert_guard
BEFORE INSERT ON submissions
WHEN NEW.source_url IS NOT NULL
  AND TRIM(NEW.source_url) <> ''
  AND LOWER(TRIM(NEW.source_url)) NOT LIKE 'http://%'
  AND LOWER(TRIM(NEW.source_url)) NOT LIKE 'https://%'
BEGIN
  SELECT RAISE(ABORT, 'source_url must use http or https');
END;

CREATE TRIGGER IF NOT EXISTS submissions_source_url_update_guard
BEFORE UPDATE OF source_url ON submissions
WHEN NEW.source_url IS NOT NULL
  AND TRIM(NEW.source_url) <> ''
  AND LOWER(TRIM(NEW.source_url)) NOT LIKE 'http://%'
  AND LOWER(TRIM(NEW.source_url)) NOT LIKE 'https://%'
BEGIN
  SELECT RAISE(ABORT, 'source_url must use http or https');
END;
