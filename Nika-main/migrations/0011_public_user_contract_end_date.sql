-- 0011: optional contract end date for resident intake submissions only
ALTER TABLE public_user_submissions ADD COLUMN contract_end_date TEXT;
