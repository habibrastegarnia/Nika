-- 0012: timestamp public registration submissions for daily reporting
ALTER TABLE public_user_submissions ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));
