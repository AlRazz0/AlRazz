-- Cloudflare D1 is the source of truth. Catalog data never lives in localStorage.
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS products_active ON products(active);

CREATE TABLE IF NOT EXISTS settings (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK (json_valid(data)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0)
);

CREATE TABLE IF NOT EXISTS designs (
  id TEXT PRIMARY KEY,
  owner_hash TEXT NOT NULL,
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS designs_owner ON designs(owner_hash, deleted_at, created_at);

-- Login throttling remains effective across Worker instances and process restarts.
CREATE TABLE IF NOT EXISTS login_limits (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
