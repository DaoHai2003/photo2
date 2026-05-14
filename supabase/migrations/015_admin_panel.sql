-- ============================================================
-- Migration 015: Admin panel — suspend support + dashboard RPCs
-- ============================================================
-- Mục đích:
--   Thêm hạ tầng cho admin panel:
--   1. Cột suspended_at, suspend_reason, last_login_at vào studios
--   2. RPC get_admin_dashboard_stats — 1 query trả tổng quan
--   3. RPC get_admin_studios_list — paginated + search + filter
--
-- An toàn:
--   ✅ Additive only (cột mới nullable, default NULL)
--   ✅ Code cũ chạy bình thường (không đụng cột cũ)
--   ✅ RPC SECURITY DEFINER + check email caller (server-side guard)
--   ✅ Idempotent — chạy lại nhiều lần OK
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Thêm cột suspend + last_login vào studios
-- ------------------------------------------------------------
ALTER TABLE studios ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS suspend_reason TEXT;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 2. Indexes — speed up search & filter
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_studios_email ON studios(email);
CREATE INDEX IF NOT EXISTS idx_studios_suspended
  ON studios(suspended_at) WHERE suspended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_studios_created_at ON studios(created_at DESC);

-- ------------------------------------------------------------
-- 3. RPC: Dashboard stats — admin tổng quan
--    Trả 1 jsonb với toàn bộ số liệu cần cho cards.
--    SECURITY DEFINER bypass RLS để JOIN auth.users.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS get_admin_dashboard_stats();

CREATE OR REPLACE FUNCTION get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_users',         (SELECT COUNT(*) FROM auth.users),
    'total_studios',       (SELECT COUNT(*) FROM studios),
    'active_30d',          (SELECT COUNT(*) FROM auth.users
                            WHERE last_sign_in_at > NOW() - INTERVAL '30 days'),
    'suspended_count',     (SELECT COUNT(*) FROM studios WHERE suspended_at IS NOT NULL),
    'total_albums',        (SELECT COUNT(*) FROM albums WHERE deleted_at IS NULL),
    'total_photos',        (SELECT COUNT(*) FROM photos),
    'total_storage_bytes', (SELECT COALESCE(SUM(total_storage_used_bytes), 0) FROM studios),
    'new_signups_7d',      (SELECT COUNT(*) FROM auth.users
                            WHERE created_at > NOW() - INTERVAL '7 days'),
    'signups_by_day',      (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('date', d::date, 'count', cnt) ORDER BY d), '[]'::jsonb)
      FROM (
        SELECT date_trunc('day', u.created_at) AS d, COUNT(*) AS cnt
        FROM auth.users u
        WHERE u.created_at > NOW() - INTERVAL '30 days'
        GROUP BY 1
      ) s(d, cnt)
    )
  );
$$;

GRANT EXECUTE ON FUNCTION get_admin_dashboard_stats() TO authenticated;

-- ------------------------------------------------------------
-- 4. RPC: List studios với pagination + search + filter
--    Returns: rows + total_count
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS get_admin_studios_list(TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION get_admin_studios_list(
  p_search TEXT DEFAULT NULL,
  p_filter_status TEXT DEFAULT NULL,  -- 'active' | 'suspended' | NULL (all)
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
      s.id, s.name, s.email, s.phone, s.logo_path, s.slug, s.plan_id,
      p.display_name AS plan_name,
      s.total_storage_used_bytes,
      s.suspended_at, s.last_login_at,
      s.created_at AS studio_created_at,
      u.email AS user_email,
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
        u.email ILIKE '%' || p_search || '%')
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

-- ------------------------------------------------------------
-- 5. RPC: Studio detail (1 row chi tiết + related data)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS get_admin_studio_detail(UUID);

CREATE OR REPLACE FUNCTION get_admin_studio_detail(p_studio_id UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'studio', to_jsonb(s.*),
    'user', jsonb_build_object(
      'email', u.email,
      'created_at', u.created_at,
      'last_sign_in_at', u.last_sign_in_at,
      'email_confirmed_at', u.email_confirmed_at
    ),
    'plan', to_jsonb(p.*),
    'album_count', (SELECT COUNT(*) FROM albums WHERE studio_id = s.id AND deleted_at IS NULL),
    'photo_count', (SELECT COUNT(*) FROM photos ph
                    JOIN albums a ON a.id = ph.album_id
                    WHERE a.studio_id = s.id AND a.deleted_at IS NULL),
    'recent_albums', (
      SELECT COALESCE(jsonb_agg(to_jsonb(a.*) ORDER BY a.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT id, title, slug, created_at, photo_count
        FROM albums
        WHERE studio_id = s.id AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 10
      ) a
    )
  )
  FROM studios s
  LEFT JOIN auth.users u ON u.id = s.id
  LEFT JOIN plans p ON p.id = s.plan_id
  WHERE s.id = p_studio_id;
$$;

GRANT EXECUTE ON FUNCTION get_admin_studio_detail(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6. RPC: Suspend / Unsuspend studio
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS admin_suspend_studio(UUID, TEXT);

CREATE OR REPLACE FUNCTION admin_suspend_studio(
  p_studio_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE studios
  SET suspended_at = NOW(), suspend_reason = p_reason
  WHERE id = p_studio_id;

  RETURN jsonb_build_object('success', true, 'studio_id', p_studio_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_suspend_studio(UUID, TEXT) TO authenticated;

DROP FUNCTION IF EXISTS admin_unsuspend_studio(UUID);

CREATE OR REPLACE FUNCTION admin_unsuspend_studio(p_studio_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE studios
  SET suspended_at = NULL, suspend_reason = NULL
  WHERE id = p_studio_id;

  RETURN jsonb_build_object('success', true, 'studio_id', p_studio_id);
END;
$$;

GRANT EXECUTE ON FUNCTION admin_unsuspend_studio(UUID) TO authenticated;

COMMIT;

-- ============================================================
-- ROLLBACK (manual)
-- ============================================================
-- BEGIN;
-- DROP FUNCTION IF EXISTS get_admin_dashboard_stats();
-- DROP FUNCTION IF EXISTS get_admin_studios_list(TEXT, TEXT, INT, INT);
-- DROP FUNCTION IF EXISTS get_admin_studio_detail(UUID);
-- DROP FUNCTION IF EXISTS admin_suspend_studio(UUID, TEXT);
-- DROP FUNCTION IF EXISTS admin_unsuspend_studio(UUID);
-- DROP INDEX IF EXISTS idx_studios_email;
-- DROP INDEX IF EXISTS idx_studios_suspended;
-- DROP INDEX IF EXISTS idx_studios_created_at;
-- ALTER TABLE studios DROP COLUMN IF EXISTS suspended_at;
-- ALTER TABLE studios DROP COLUMN IF EXISTS suspend_reason;
-- ALTER TABLE studios DROP COLUMN IF EXISTS last_login_at;
-- COMMIT;
-- ============================================================
