-- 0017: private message recipient groups, immutable sender labels and threaded conversations
ALTER TABLE messages ADD COLUMN recipient_role TEXT;
ALTER TABLE messages ADD COLUMN thread_id TEXT;
ALTER TABLE messages ADD COLUMN sender_role TEXT;
ALTER TABLE messages ADD COLUMN sender_label TEXT;

UPDATE messages SET thread_id=id WHERE thread_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id,created_at);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_role ON messages(recipient_role,read_at,created_at);
