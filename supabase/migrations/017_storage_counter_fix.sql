-- ============================================================
-- Migration 017: Fix storage counter trigger + RPC recompute
-- ============================================================
-- Mục đích:
--   1. Trigger update_storage_counter (chạy khi INSERT/DELETE photos)
--      bị silent fail vì SECURITY INVOKER + RLS chặn UPDATE studios
--      → studios.total_storage_used_bytes drift
--   2. Cung cấp RPC recompute để admin click "Sync" recompute từ DB
--
-- An toàn: chỉ ALTER FUNCTION + ADD function mới. KHÔNG đụng data.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Trigger update_album_photo_count đã SECURITY DEFINER từ migration 014
--    → counter tự động đúng từ giờ về sau.
--    Chỉ cần recompute 1 lần để fix drift CŨ (insert trước migration 014).
-- ------------------------------------------------------------
-- (No-op — re-confirm idempotently nếu chưa được apply)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_album_photo_count') THEN
    EXECUTE 'ALTER FUNCTION update_album_photo_count() SECURITY DEFINER';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. RPC: recompute_studio_storage(studio_id)
--    Recompute total_storage_used_bytes từ SUM(photos.file_size)
--    của TẤT CẢ albums chưa bị soft-delete.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS recompute_studio_storage(UUID);

CREATE OR REPLACE FUNCTION recompute_studio_storage(p_studio_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_bytes BIGINT;
  v_new_bytes BIGINT;
BEGIN
  -- Lấy giá trị hiện tại để compare
  SELECT total_storage_used_bytes INTO v_old_bytes
  FROM studios WHERE id = p_studio_id;

  -- Tính lại từ source-of-truth: SUM(photos.file_size)
  SELECT COALESCE(SUM(ph.file_size), 0) INTO v_new_bytes
  FROM photos ph
  JOIN albums a ON a.id = ph.album_id
  WHERE a.studio_id = p_studio_id
    AND a.deleted_at IS NULL
    AND ph.file_size IS NOT NULL;

  -- Update studio counter
  UPDATE studios
  SET total_storage_used_bytes = v_new_bytes
  WHERE id = p_studio_id;

  RETURN jsonb_build_object(
    'success', true,
    'studio_id', p_studio_id,
    'old_bytes', v_old_bytes,
    'new_bytes', v_new_bytes,
    'diff_bytes', COALESCE(v_new_bytes - v_old_bytes, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_studio_storage(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 3. RPC: recompute_all_studios_storage() — bulk recompute
--    Dùng khi muốn fix drift hàng loạt 1 lần (admin "Sync all").
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS recompute_all_studios_storage();

CREATE OR REPLACE FUNCTION recompute_all_studios_storage()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE studios s
  SET total_storage_used_bytes = COALESCE(sub.total, 0)
  FROM (
    SELECT a.studio_id, SUM(ph.file_size) AS total
    FROM photos ph
    JOIN albums a ON a.id = ph.album_id
    WHERE a.deleted_at IS NULL AND ph.file_size IS NOT NULL
    GROUP BY a.studio_id
  ) sub
  WHERE s.id = sub.studio_id
    AND s.total_storage_used_bytes IS DISTINCT FROM sub.total;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Reset về 0 cho studios không có ảnh nào
  UPDATE studios
  SET total_storage_used_bytes = 0
  WHERE total_storage_used_bytes > 0
    AND id NOT IN (
      SELECT DISTINCT a.studio_id FROM albums a
      JOIN photos ph ON ph.album_id = a.id
      WHERE a.deleted_at IS NULL AND ph.file_size IS NOT NULL
    );

  RETURN jsonb_build_object('success', true, 'studios_updated', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_all_studios_storage() TO authenticated;

-- ------------------------------------------------------------
-- 4. RUN 1 lần để fix drift hiện tại
-- ------------------------------------------------------------
SELECT recompute_all_studios_storage();

COMMIT;

-- ============================================================
-- VERIFY sau khi chạy:
-- SELECT id, name, total_storage_used_bytes,
--   pg_size_pretty(total_storage_used_bytes) AS size_pretty
-- FROM studios ORDER BY total_storage_used_bytes DESC;
-- ============================================================
