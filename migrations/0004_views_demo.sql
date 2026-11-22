-- Raw per-draft view counting (shown only to the author) and the demo flag
-- that marks the example cast seeded by 0005.
ALTER TABLE work_versions ADD COLUMN views INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
