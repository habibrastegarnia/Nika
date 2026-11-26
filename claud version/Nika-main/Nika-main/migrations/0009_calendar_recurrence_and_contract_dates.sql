-- 0009: recurring calendar events and user contract dates
ALTER TABLE events ADD COLUMN recurrence TEXT NOT NULL DEFAULT 'none'
  CHECK(recurrence IN ('none','weekly','monthly','yearly'));

ALTER TABLE events ADD COLUMN recurrence_until TEXT;

ALTER TABLE users ADD COLUMN contract_start_date TEXT;
ALTER TABLE users ADD COLUMN contract_end_date TEXT;

CREATE TABLE IF NOT EXISTS event_occurrences (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  occurrence_date TEXT NOT NULL,
  event_date TEXT NOT NULL,
  event_time TEXT,
  title TEXT,
  body TEXT,
  cancelled INTEGER NOT NULL DEFAULT 0 CHECK(cancelled IN (0,1)),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS idx_events_recurrence ON events(recurrence,event_date);
CREATE INDEX IF NOT EXISTS idx_users_contract_end ON users(contract_end_date);
CREATE INDEX IF NOT EXISTS idx_event_occurrences_event ON event_occurrences(event_id,occurrence_date);
