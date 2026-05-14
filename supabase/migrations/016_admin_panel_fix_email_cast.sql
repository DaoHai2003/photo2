-- ============================================================
-- Migration 016: Fix get_admin_studios_list — cast email types
-- ============================================================
-- Bug: auth.users.email là varchar(255), function khai báo TEXT
--      → Postgres báo "structure does not match function result type"
-- Fix: explicit ::text cast cho mọi cột varchar lấy từ auth.users
--
-- An toàn: chỉ DROP + CREATE function, không đụng data.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS get_admin_studios_list(TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION get_admin_studios_list(
  p_search TEXT DEFAULT NULL,
  p_filter_status TEXT DEFAULT NULL,
  p_page INT DEFAULT 1,
  p_page_size INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  email TEXT,
  phone TEXT,
  logo_path TEXT,
  slug TEXT,
  plan_id UUID,
  plan_name TEXT,
  total_storage_used_bytes BIGINT,
  suspended_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  studio_created_at TIMESTAMPTZ,
  user_email TEXT,
  user_created_at TIMESTAMPTZ,
  user_last_sign_in_at TIMESTAMPTZ,
  album_count BIGINT,
  photo_count BIGINT,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offset INT;
BEGIN
  v_offset := GREATEST(0, (p_page - 1) * p_page_size);

  RETURN QUERY
  WITH filtered AS (
    SELECT
      s.id,
      s.name::text AS name,
      s.email::text AS email,
      s.phone::text AS phone,
      s.logo_path::text AS logo_path,
      s.slug::text AS slug,
      s.plan_id,
      p.display_name::text AS plan_name,
      s.total_storage_used_bytes,
      s.suspended_at,
      s.last_login_at,
      s.created_at AS studio_created_at,
      u.email::text AS user_email,
      u.created_at AS user_created_at,
      u.last_sign_in_at AS user_last_sign_in_at,
      (SELECT COUNT(*) FROM albums a WHERE a.studio_id = s.id AND a.deleted_at IS NULL) AS album_count,
      (SELECT COUNT(*) FROM photos ph
        JOIN albums a ON a.id = ph.album_id
        WHERE a.studio_id = s.id AND a.deleted_at IS NULL) AS photo_count
    FROM studios s
    LEFT JOIN auth.users u ON u.id = s.id
    LEFT JOIN plans p ON p.id = s.plan_id
    WHERE
      (p_search IS NULL OR p_search = '' OR
        s.name ILIKE '%' || p_search || '%' OR
        s.email ILIKE '%' || p_search || '%' OR
        u.email::text ILIKE '%' || p_search || '%')
      AND (
        p_filter_status IS NULL OR
        (p_filter_status = 'suspended' AND s.suspended_at IS NOT NULL) OR
        (p_filter_status = 'active' AND s.suspended_at IS NULL)
      )
  ),
  counted AS (
    SELECT (SELECT COUNT(*) FROM filtered) AS total_count
  )
  SELECT f.*, c.total_count
  FROM filtered f, counted c
  ORDER BY f.studio_created_at DESC
  LIMIT p_page_size OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION get_admin_studios_list(TEXT, TEXT, INT, INT) TO authenticated;

COMMIT;

-- Verify sau khi chạy:
-- SELECT * FROM get_admin_studios_list(NULL, NULL, 1, 50);
