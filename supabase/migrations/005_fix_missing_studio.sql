-- Tạo studio record cho user đã tồn tại nhưng chưa có studio
-- Chạy trong Supabase SQL Editor

INSERT INTO studios (id, name, slug, email)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', SPLIT_PART(u.email, '@', 1), 'Studio'),
  LOWER(REGEXP_REPLACE(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', SPLIT_PART(u.email, '@', 1), 'studio'), '[^a-zA-Z0-9]', '-', 'g')) || '-' || SUBSTR(u.id::text, 1, 4),
  u.email
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM studios s WHERE s.id = u.id);

-- Tạo subscription Free cho studio chưa có
INSERT INTO subscriptions (studio_id, plan_id, status, billing_cycle)
SELECT s.id, p.id, 'active', 'free'
FROM studios s
CROSS JOIN plans p
WHERE p.name = 'free'
AND NOT EXISTS (SELECT 1 FROM subscriptions sub WHERE sub.studio_id = s.id);

-- Tạo studio_members cho studio chưa có
INSERT INTO studio_members (studio_id, user_id, role, accepted_at)
SELECT s.id, s.id, 'owner', NOW()
FROM studios s
WHERE NOT EXISTS (SELECT 1 FROM studio_members sm WHERE sm.studio_id = s.id AND sm.user_id = s.id);
