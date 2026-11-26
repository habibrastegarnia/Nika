-- 0010: public initial user information submissions (staging only)
-- These records are deliberately separate from the live users and units tables.
CREATE TABLE IF NOT EXISTS public_user_submissions (
  id TEXT PRIMARY KEY,
  unit_number TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK(user_type IN ('owner','resident')),
  full_name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK(gender IN ('female','male')),
  phone TEXT NOT NULL,
  secondary_phone TEXT,
  contract_start_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_public_user_submissions_unit ON public_user_submissions(unit_number);
