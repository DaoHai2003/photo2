-- ============================================================
-- Migration 012: Fix tính năng "Tạo Website"
-- ============================================================
-- Mục đích: Bổ sung 2 cột thiếu để tính năng "Tạo Website" hoạt động
--   1. website_profiles.slug — public URL /studio/{slug}, auto-fill từ
--      studios.slug (mỗi studio đã có slug unique sẵn)
--   2. website_albums.is_visible — toggle hiển thị album trên portfolio
--
-- An toàn:
--   • Chỉ ADD COLUMN, KHÔNG xoá / đổi cột nào hiện có
--   • Backfill data tự động cho rows đã có sẵn
--   • Idempotent — chạy lại nhiều lần OK
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. ADD COLUMN slug cho website_profiles
-- ------------------------------------------------------------

ALTER TABLE website_profiles
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill: mỗi website_profile lấy slug từ studio tương ứng
UPDATE website_profiles wp
SET slug = s.slug
FROM studios s
WHERE wp.studio_id = s.id AND wp.slug IS NULL;

-- UNIQUE constraint (chỉ thêm nếu chưa có)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'website_profiles_slug_unique'
  ) THEN
    ALTER TABLE website_profiles
      ADD CONSTRAINT website_profiles_slug_unique UNIQUE (slug);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_website_profiles_slug ON website_profiles(slug);

-- ------------------------------------------------------------
-- 2. ADD COLUMN is_visible cho website_albums
-- ------------------------------------------------------------

ALTER TABLE website_albums
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN DEFAULT TRUE;

-- Backfill: tất cả rows hiện có default = visible
UPDATE website_albums SET is_visible = TRUE WHERE is_visible IS NULL;

CREATE INDEX IF NOT EXISTS idx_website_albums_visible
  ON website_albums(website_id, is_visible)
  WHERE is_visible = TRUE;

COMMIT;

-- ============================================================
-- ROLLBACK (manual):
-- ------------------------------------------------------------
-- BEGIN;
-- DROP INDEX IF EXISTS idx_website_albums_visible;
-- ALTER TABLE website_albums DROP COLUMN IF EXISTS is_visible;
-- DROP INDEX IF EXISTS idx_website_profiles_slug;
-- ALTER TABLE website_profiles DROP CONSTRAINT IF EXISTS website_profiles_slug_unique;
-- ALTER TABLE website_profiles DROP COLUMN IF EXISTS slug;
-- COMMIT;
-- ============================================================
