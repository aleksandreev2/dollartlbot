-- Legacy migration retained for sequence compatibility.
-- The regular-user chapter limit is enforced in application logic.
-- Keep this migration as a no-op so D1 can advance safely to later schema changes.
SELECT 1;
