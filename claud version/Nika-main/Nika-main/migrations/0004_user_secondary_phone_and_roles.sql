-- 0004: شماره تماس پشتیبان و نقش‌های جدید
ALTER TABLE users ADD COLUMN secondary_phone TEXT;

-- جایگزینی نقش قدیمی مدیر ساختمان با مدیر سامانه و افزودن نقش سرایدار
CREATE TABLE user_roles_new (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','resident','executive','finance','board','chair','system_admin','caretaker')),
  PRIMARY KEY(user_id,role)
);

INSERT INTO user_roles_new(user_id,role)
SELECT user_id,
       CASE WHEN role='building_admin' THEN 'system_admin' ELSE role END
FROM user_roles;

DROP TABLE user_roles;
ALTER TABLE user_roles_new RENAME TO user_roles;
