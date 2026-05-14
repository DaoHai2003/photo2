-- ============================================================
-- Migration 020: Fix get_studio_plan UNION column mismatch
-- ============================================================
-- Bug: active_sub CTE select sub.* + p columns → ~30 cols.
--      fallback_free CTE select 7 cols. UNION ALL fail.
-- Fix: cả 2 CTE select đúng 7 cột giống nhau.
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS get_studio_plan(UUID);

CREATE OR REPLACE FUNCTION get_studio_plan(p_studio_id UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active_sub AS (
    SELECT
      p.name::text AS plan_name,
      p.display_name::text AS display_name,
      p.max_albums,
      p.max_storage_mb,
      p.has_zip_download,
      p.has_custom_branding,
      p.has_website_builder,
      (sub.status = 'trial') AS is_trial,
      sub.current_period_end AS expires_at
    FROM subscriptions sub
    JOIN plans p ON p.id = sub.plan_id
    WHERE sub.studio_id = p_studio_id
      AND sub.status IN ('active', 'trial')
      AND (sub.current_period_end IS NULL OR sub.current_period_end > NOW())
    ORDER BY sub.current_period_end DESC NULLS FIRST
    LIMIT 1
  ),
  fallback_free AS (
    SELECT
      'free'::text AS plan_name,
      'Miễn phí'::text AS display_name,
      5 AS max_albums,
      5000 AS max_storage_mb,
      FALSE AS has_zip_download,
      FALSE AS has_custom_branding,
      FALSE AS has_website_builder,
      FALSE AS is_trial,
      NULL::timestamptz AS expires_at
    WHERE NOT EXISTS (SELECT 1 FROM active_sub)
  ),
  combined AS (
    SELECT * FROM active_sub
    UNION ALL
    SELECT * FROM fallback_free
  )
  SELECT jsonb_build_object(
    'plan_name', plan_name,
    'display_name', display_name,
    'max_albums', max_albums,
    'max_storage_mb', max_storage_mb,
    'has_zip_download', has_zip_download,
    'has_custom_branding', has_custom_branding,
    'has_website_builder', has_website_builder,
    'is_trial', is_trial,
    'expires_at', expires_at
  )
  FROM combined LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION get_studio_plan(UUID) TO authenticated, anon;

COMMIT;

-- VERIFY:
-- SELECT get_studio_plan('<your-studio-id>');
