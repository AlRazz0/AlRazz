-- Empty, administrator-managed portfolio. Never seed fabricated work/photos.
CREATE TABLE IF NOT EXISTS completed_projects (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL CHECK(json_valid(data)),
  published INTEGER NOT NULL DEFAULT 0 CHECK(published IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS completed_projects_public ON completed_projects(published,deleted_at,updated_at);
