-- Additive CRM upgrade. Historical designs, kitchens and request snapshots stay intact.
ALTER TABLE quote_requests ADD COLUMN next_action TEXT CHECK (next_action IS NULL OR next_action IN ('call','present_quote','visit','revise_quote','follow_up'));
CREATE INDEX IF NOT EXISTS quote_requests_agenda ON quote_requests(next_follow_up_at,id) WHERE next_follow_up_at IS NOT NULL;
CREATE TABLE commercial_quote_versions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES quote_requests(id),
  number INTEGER NOT NULL CHECK (number > 0),
  issue_request_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_nonce TEXT NOT NULL,
  document TEXT NOT NULL CHECK (json_valid(document)),
  source_snapshot TEXT NOT NULL CHECK (json_valid(source_snapshot)),
  issued_at TEXT NOT NULL,
  valid_until TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('issued','accepted','changes_requested','superseded')),
  response_request_id TEXT,
  response_payload_hash TEXT,
  response_kind TEXT CHECK (response_kind IS NULL OR response_kind IN ('accept','changes')),
  responded_at TEXT,
  customer_message TEXT NOT NULL DEFAULT '',
  UNIQUE(request_id,number),
  UNIQUE(request_id,issue_request_id)
);
CREATE INDEX commercial_quote_request_versions ON commercial_quote_versions(request_id,number DESC);
CREATE INDEX commercial_quote_issued ON commercial_quote_versions(issued_at);
CREATE INDEX commercial_quote_responded ON commercial_quote_versions(response_kind,responded_at);
