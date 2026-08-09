ALTER TABLE publications ADD COLUMN image_spoiler INTEGER NOT NULL DEFAULT 0 CHECK (image_spoiler IN (0,1));
