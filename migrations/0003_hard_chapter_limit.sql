CREATE TRIGGER IF NOT EXISTS submissions_max_250_insert
BEFORE INSERT ON submissions
WHEN NEW.chapter_count > 250
BEGIN
  SELECT RAISE(ABORT, 'chapter_count_exceeds_250');
END;

CREATE TRIGGER IF NOT EXISTS submissions_max_250_update
BEFORE UPDATE OF chapter_count ON submissions
WHEN NEW.chapter_count > 250
BEGIN
  SELECT RAISE(ABORT, 'chapter_count_exceeds_250');
END;
