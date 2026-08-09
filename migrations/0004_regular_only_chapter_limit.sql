DROP TRIGGER IF EXISTS submissions_max_250_insert;
DROP TRIGGER IF EXISTS submissions_max_250_update;

CREATE TRIGGER IF NOT EXISTS submissions_regular_max_250_insert
BEFORE INSERT ON submissions
WHEN NEW.plan = 'free' AND NEW.chapter_count > 250
BEGIN
  SELECT RAISE(ABORT, 'regular_chapter_count_exceeds_250');
END;

CREATE TRIGGER IF NOT EXISTS submissions_regular_max_250_update
BEFORE UPDATE OF chapter_count, plan ON submissions
WHEN NEW.plan = 'free' AND NEW.chapter_count > 250
BEGIN
  SELECT RAISE(ABORT, 'regular_chapter_count_exceeds_250');
END;
