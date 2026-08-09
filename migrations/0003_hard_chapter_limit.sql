-- Legacy migration retained for sequence compatibility.
-- The regular-user chapter limit is enforced in application logic.
-- The previous CREATE TRIGGER form is not safe through Wrangler's migration statement parser.
SELECT 1;
