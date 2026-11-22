-- Thwack initial schema. All timestamps are unix seconds.

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  google_sub TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL
);

CREATE TABLE google_tokens (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  refresh_token_enc TEXT NOT NULL,
  scopes TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE works (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  doc_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',      -- active | removed
  available INTEGER NOT NULL DEFAULT 1,       -- 0 when the doc stopped being publicly readable
  added_at INTEGER NOT NULL,
  snapshot_html TEXT,                         -- sanitized export; '' = too large, link out
  snapshot_at INTEGER
);
CREATE INDEX idx_works_user ON works(user_id, status);

CREATE TABLE follows (
  follower_id INTEGER NOT NULL REFERENCES users(id),
  followee_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX idx_follows_followee ON follows(followee_id);

-- Irreversible by design: the app has no delete path for blocks.
CREATE TABLE blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id),
  blocked_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- One private conversation thread per (work, reviewer).
CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES works(id),
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,                       -- assigned | organic
  created_at INTEGER NOT NULL,
  last_msg_at INTEGER NOT NULL,
  UNIQUE (work_id, reviewer_id)
);

CREATE TABLE review_msgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  review_id INTEGER NOT NULL REFERENCES reviews(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_msgs_review ON review_msgs(review_id);

CREATE TABLE assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reviewer_id INTEGER NOT NULL REFERENCES users(id),
  work_id INTEGER NOT NULL REFERENCES works(id),
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | completed | expired | declined
  assigned_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_assign_reviewer ON assignments(reviewer_id, status);
CREATE INDEX idx_assign_work ON assignments(work_id, status);

-- Events-only activity feed. Actor is always the WRITER whose work the event
-- concerns; reviewer identity never appears here.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,                         -- work_added | review_received | review_reply
  work_id INTEGER NOT NULL REFERENCES works(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_actor ON events(actor_id, created_at);
