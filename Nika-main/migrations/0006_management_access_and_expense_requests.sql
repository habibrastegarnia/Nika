-- 0006: cash balances, delegated management access, and two-stage expense requests

ALTER TABLE funds ADD COLUMN cash_balance INTEGER NOT NULL DEFAULT 0;

-- Rebuild the cash position from already approved receipts and expenses.
UPDATE funds
SET cash_balance = COALESCE((
  SELECT SUM(
    CASE
      WHEN t.kind='payment' AND t.status='approved' THEN t.amount
      WHEN t.kind='expense' AND t.status='approved' THEN -t.amount
      ELSE 0
    END
  )
  FROM transactions t
  WHERE t.fund_id=funds.id
), 0);

CREATE TABLE IF NOT EXISTS manager_delegations (
  delegator_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delegator_role TEXT NOT NULL CHECK(delegator_role IN ('chair','finance','board','executive')),
  delegate_user_id TEXT NOT NULL REFERENCES users(id),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(delegator_user_id, delegator_role),
  CHECK(delegator_user_id <> delegate_user_id)
);

CREATE INDEX IF NOT EXISTS idx_manager_delegations_delegate
  ON manager_delegations(delegate_user_id, enabled);

CREATE TABLE IF NOT EXISTS expense_request_sequences (
  id INTEGER PRIMARY KEY CHECK(id=1),
  next_value INTEGER NOT NULL DEFAULT 1
);
INSERT OR IGNORE INTO expense_request_sequences(id,next_value) VALUES(1,1);

CREATE TABLE IF NOT EXISTS expense_requests (
  id TEXT PRIMARY KEY,
  reference_no TEXT NOT NULL UNIQUE,
  fund_id TEXT NOT NULL REFERENCES funds(id),
  amount INTEGER NOT NULL CHECK(amount>0),
  document_title TEXT NOT NULL,
  document_date TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'pending_finance','revision_finance','pending_chair',
    'revision_chair','finalized','cancelled'
  )),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  finalized_by TEXT REFERENCES users(id),
  finalized_at TEXT,
  cancelled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_expense_requests_status_created
  ON expense_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_requests_creator
  ON expense_requests(created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_requests_fund
  ON expense_requests(fund_id, status);

CREATE TABLE IF NOT EXISTS expense_request_versions (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES expense_requests(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  snapshot TEXT NOT NULL,
  changed_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(request_id, version_no)
);

CREATE TABLE IF NOT EXISTS expense_request_files (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES expense_requests(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expense_request_files_request
  ON expense_request_files(request_id, version_no);

CREATE TABLE IF NOT EXISTS expense_request_history (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES expense_requests(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(id),
  stage TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expense_request_history_request
  ON expense_request_history(request_id, created_at DESC);

ALTER TABLE audit_logs ADD COLUMN actor_role TEXT;
ALTER TABLE audit_logs ADD COLUMN is_delegate INTEGER NOT NULL DEFAULT 0;
ALTER TABLE audit_logs ADD COLUMN reason TEXT;
