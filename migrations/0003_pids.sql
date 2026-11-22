-- Public identifiers: random, non-sequential slugs for everything addressable
-- by URL. Internal integer ids remain for relations. Backfilled by script.
ALTER TABLE users ADD COLUMN pid TEXT;
ALTER TABLE works ADD COLUMN pid TEXT;
CREATE UNIQUE INDEX idx_users_pid ON users(pid);
CREATE UNIQUE INDEX idx_works_pid ON works(pid);
