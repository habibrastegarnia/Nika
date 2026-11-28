-- 0016: direct public user messages and audited chair-only soft deletion
ALTER TABLE notices ADD COLUMN deleted_at TEXT;
ALTER TABLE notices ADD COLUMN deleted_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE notices ADD COLUMN delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_notices_public_active
  ON notices(audience,deleted_at,created_at);
