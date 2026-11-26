ALTER TABLE finance_settings ADD COLUMN monthly_effective_from TEXT;
ALTER TABLE finance_settings ADD COLUMN owner_effective_from TEXT;
ALTER TABLE finance_settings ADD COLUMN owner_due_date TEXT;

UPDATE finance_settings
SET monthly_effective_from = COALESCE(monthly_effective_from, effective_from),
    owner_effective_from = COALESCE(owner_effective_from, effective_from),
    owner_due_date = COALESCE(
      owner_due_date,
      CASE WHEN owner_due_month IS NOT NULL AND owner_due_day IS NOT NULL
        THEN substr(effective_from,1,4) || '-' || printf('%02d',owner_due_month) || '-' || printf('%02d',owner_due_day)
        ELSE NULL END
    );
