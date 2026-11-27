-- 0013: restore expense categorization for monthly fund and manual titles for owner fund
ALTER TABLE expense_requests ADD COLUMN category TEXT;
