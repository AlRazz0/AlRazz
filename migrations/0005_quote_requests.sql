-- Additive CRM storage. Original saved designs/kitchens remain untouched.
CREATE TABLE IF NOT EXISTS quote_requests (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  owner_hash TEXT NOT NULL,
  request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  contact TEXT NOT NULL CHECK (json_valid(contact)),
  snapshot TEXT NOT NULL CHECK (json_valid(snapshot)),
  consent_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','contacted','quoted','accepted','lost')),
  assignee TEXT NOT NULL DEFAULT '',
  next_follow_up_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  lost_reason TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(owner_hash, request_id)
);
CREATE INDEX IF NOT EXISTS quote_requests_owner_created ON quote_requests(owner_hash,created_at);
CREATE INDEX IF NOT EXISTS quote_requests_ip_created ON quote_requests(ip_hash,created_at);
CREATE INDEX IF NOT EXISTS quote_requests_status_updated ON quote_requests(status,updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS quote_requests_updated ON quote_requests(updated_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS quote_requests_follow_up ON quote_requests(next_follow_up_at,status);
CREATE TABLE IF NOT EXISTS quote_request_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES quote_requests(id),
  version INTEGER NOT NULL CHECK (version > 0),
  created_at TEXT NOT NULL,
  data TEXT NOT NULL CHECK (json_valid(data)),
  UNIQUE(request_id,version)
);
CREATE INDEX IF NOT EXISTS quote_request_events_request ON quote_request_events(request_id,version);
