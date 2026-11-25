-- 0008: gender-aware default avatars
ALTER TABLE users ADD COLUMN gender TEXT NOT NULL DEFAULT 'unspecified'
  CHECK(gender IN ('female','male','unspecified'));

-- Replace the chair account's uploaded portrait with the shared icon avatar.
UPDATE users SET avatar_data=NULL
WHERE id IN (SELECT user_id FROM user_roles WHERE role='chair');
