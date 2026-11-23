-- 0002: ستون‌ها و جدول‌های لازم برای اتصال کامل رابط به API
ALTER TABLE units ADD COLUMN block TEXT;
ALTER TABLE units ADD COLUMN floor TEXT;
ALTER TABLE units ADD COLUMN parking TEXT;
ALTER TABLE units ADD COLUMN notes TEXT;

ALTER TABLE transactions ADD COLUMN category TEXT;
ALTER TABLE transactions ADD COLUMN note TEXT;

ALTER TABLE notices ADD COLUMN kind TEXT NOT NULL DEFAULT 'اطلاعیه';

ALTER TABLE requests ADD COLUMN category TEXT;
ALTER TABLE requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'request';
ALTER TABLE requests ADD COLUMN response TEXT;
ALTER TABLE requests ADD COLUMN board_requested INTEGER NOT NULL DEFAULT 0;
ALTER TABLE requests ADD COLUMN updated_at TEXT;

CREATE TABLE IF NOT EXISTS login_attempts(
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS rules(
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS resolutions(
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
  decided_on TEXT NOT NULL,
  created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS events(
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT,
  event_date TEXT NOT NULL, event_time TEXT,
  created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS documents(
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, url TEXT NOT NULL,
  created_by TEXT REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_tx_unit ON transactions(unit_id,fund_id);
CREATE INDEX IF NOT EXISTS idx_tx_status ON transactions(status,kind);
CREATE INDEX IF NOT EXISTS idx_msg_recipient ON messages(recipient_id,read_at);
CREATE INDEX IF NOT EXISTS idx_req_user ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_notices_created ON notices(created_at);
CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
