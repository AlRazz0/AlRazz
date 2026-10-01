-- Kitchen snapshots remain independent from single-furniture designs.
CREATE TABLE IF NOT EXISTS kitchens (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS kitchens_owner ON kitchens(owner_hash, deleted_at, created_at);
