-- 0007: temporary D1 image storage and verified offline backup lifecycle

-- Expense images are kept temporarily in D1 until the user downloads and confirms
-- an offline archive. Metadata and workflow history remain online permanently.
ALTER TABLE expense_request_files ADD COLUMN data_base64 TEXT;
ALTER TABLE expense_request_files ADD COLUMN archived_at TEXT;

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES users(id),
  checksum TEXT NOT NULL,
  file_ids_json TEXT NOT NULL,
  image_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','expired')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_backup_runs_created
  ON backup_runs(created_at DESC);
