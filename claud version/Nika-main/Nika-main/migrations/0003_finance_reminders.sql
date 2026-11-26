ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE messages ADD COLUMN tone TEXT NOT NULL DEFAULT 'info';
ALTER TABLE messages ADD COLUMN text_direction TEXT NOT NULL DEFAULT 'rtl';
ALTER TABLE messages ADD COLUMN automatic_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_automatic_key ON messages(automatic_key) WHERE automatic_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS finance_settings (
 id TEXT PRIMARY KEY, monthly_amount INTEGER, monthly_due_day INTEGER,
 owner_amount INTEGER, owner_due_month INTEGER, owner_due_day INTEGER,
 effective_from TEXT NOT NULL, created_by TEXT REFERENCES users(id),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_finance_settings_effective ON finance_settings(effective_from DESC,created_at DESC);