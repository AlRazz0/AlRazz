-- Optional first-party measurements only. No customer/contact/URL/IP columns.
CREATE TABLE measurement_sessions (
  day INTEGER NOT NULL,
  session_hash TEXT NOT NULL,
  visit INTEGER NOT NULL DEFAULT 1,
  assistant_result INTEGER NOT NULL DEFAULT 0,
  design_saved INTEGER NOT NULL DEFAULT 0,
  quote_started INTEGER NOT NULL DEFAULT 0,
  quote_submitted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(day, session_hash)
);
CREATE TABLE measurement_vitals (
  day INTEGER NOT NULL,
  session_hash TEXT NOT NULL,
  page_view_hash TEXT NOT NULL,
  page TEXT NOT NULL,
  device TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL NOT NULL,
  sequence INTEGER NOT NULL,
  PRIMARY KEY(day, session_hash, page_view_hash, name)
);
CREATE INDEX measurement_vitals_period ON measurement_vitals(day, page, device, name);
