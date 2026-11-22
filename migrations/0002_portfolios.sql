-- Portfolios pivot: assigned anonymous identities, versioned drafts,
-- per-version reviews, no activity feed.

-- The reviews table swap below would otherwise trip review_msgs' FK.
PRAGMA defer_foreign_keys = true;

-- Assigned pen names + avatar parameters (generated in code, backfilled lazily).
ALTER TABLE users ADD COLUMN handle TEXT;
ALTER TABLE users ADD COLUMN hue INTEGER;
ALTER TABLE users ADD COLUMN animal TEXT;
CREATE UNIQUE INDEX idx_users_handle ON users(handle);

-- Numbered drafts of a work. Content lives here, not on works.
CREATE TABLE work_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  num INTEGER NOT NULL,
  snapshot_html TEXT,                -- sanitized export; '' = too large
  content_hash TEXT,                 -- sha-256 of the sanitized html
  created_at INTEGER NOT NULL,
  UNIQUE (work_id, num)
);
INSERT INTO work_versions (work_id, num, snapshot_html, content_hash, created_at)
  SELECT id, 1, snapshot_html, NULL, COALESCE(snapshot_at, added_at) FROM works;
ALTER TABLE works DROP COLUMN snapshot_html;
ALTER TABLE works DROP COLUMN snapshot_at;

-- Reviews attach to a specific draft; one thread per (draft, reviewer).
CREATE TABLE reviews_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  version_id INTEGER NOT NULL REFERENCES work_versions(id),
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_msg_at INTEGER NOT NULL,
  UNIQUE (version_id, reviewer_id)
);
INSERT INTO reviews_new (id, work_id, version_id, reviewer_id, source, created_at, last_msg_at)
  SELECT r.id, r.work_id, (SELECT v.id FROM work_versions v WHERE v.work_id = r.work_id AND v.num = 1),
         r.reviewer_id, r.source, r.created_at, r.last_msg_at
  FROM reviews r;
DROP TABLE reviews;
ALTER TABLE reviews_new RENAME TO reviews;

-- The activity feed is gone; portfolios are the discovery surface.
DROP TABLE events;
