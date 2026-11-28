-- 0015: recover previously approved resident messages for the public-message feed
WITH published AS (
  SELECT
    json_extract(p.details, '$.notice') AS notice_id,
    r.id AS request_id,
    r.user_id AS author_user_id,
    COALESCE(r.author_name, u.name) AS author_name,
    COALESCE(
      r.author_role,
      (SELECT a.actor_role FROM audit_logs a
       WHERE a.action='request.create' AND a.entity_type='request' AND a.entity_id=r.id
       ORDER BY a.created_at ASC LIMIT 1),
      u.account_type
    ) AS author_role,
    CASE COALESCE(
      r.author_role,
      (SELECT a.actor_role FROM audit_logs a
       WHERE a.action='request.create' AND a.entity_type='request' AND a.entity_id=r.id
       ORDER BY a.created_at ASC LIMIT 1),
      u.account_type
    )
      WHEN 'chair' THEN 'رئیس هیأت‌مدیره'
      WHEN 'finance' THEN 'مدیر مالی'
      WHEN 'board' THEN 'عضو هیأت‌مدیره'
      WHEN 'executive' THEN 'مدیر اجرایی'
      WHEN 'system_admin' THEN 'مدیر سامانه'
      WHEN 'caretaker' THEN 'سرایدار'
      WHEN 'owner' THEN 'مالک واحد ' || COALESCE(un.unit_number, '')
      WHEN 'resident' THEN 'ساکن واحد ' || COALESCE(un.unit_number, '')
      ELSE 'کاربر ساختمان'
    END AS author_label
  FROM audit_logs p
  JOIN requests r ON r.id=p.entity_id
  JOIN users u ON u.id=r.user_id
  LEFT JOIN units un ON un.id=u.unit_id
  WHERE p.action='request.publish'
    AND p.entity_type='request'
    AND json_valid(p.details)
    AND json_extract(p.details, '$.notice') IS NOT NULL
)
UPDATE notices
SET
  source_request_id=(SELECT request_id FROM published WHERE notice_id=notices.id LIMIT 1),
  author_user_id=(SELECT author_user_id FROM published WHERE notice_id=notices.id LIMIT 1),
  author_name=(SELECT author_name FROM published WHERE notice_id=notices.id LIMIT 1),
  author_role=(SELECT author_role FROM published WHERE notice_id=notices.id LIMIT 1),
  author_label=(SELECT author_label FROM published WHERE notice_id=notices.id LIMIT 1)
WHERE audience='all'
  AND EXISTS (SELECT 1 FROM published WHERE notice_id=notices.id);
