-- ============================================================
-- Migration 018: Public storage bucket cho hero cover của website
-- ============================================================
-- Mục đích:
--   Cho phép studio upload ảnh nền (hero background) cho website public.
--   Dùng PUBLIC bucket để render trực tiếp qua URL không cần signed URL
--   (signed URL hết hạn → ảnh sẽ vỡ định kỳ).
--
-- An toàn:
--   ✅ Bucket mới, không đụng bucket cũ (studio-assets, album-photos, ...)
--   ✅ Idempotent (ON CONFLICT DO NOTHING)
--   ✅ Limit 8MB / file, chỉ chấp nhận image MIME
--   ✅ RLS: ai cũng SELECT được (public bucket), chỉ owner UPLOAD/DELETE
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Tạo public bucket — limit 8MB, chỉ image
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'website-covers',
  'website-covers',
  TRUE,
  8388608,  -- 8 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ------------------------------------------------------------
-- 2. RLS policies cho website-covers
--    - SELECT: ai cũng đọc được (public)
--    - INSERT/UPDATE/DELETE: chỉ owner (path bắt đầu bằng userId)
-- ------------------------------------------------------------

-- Drop policy cũ nếu có (idempotent)
DROP POLICY IF EXISTS "website_covers_public_read" ON storage.objects;
DROP POLICY IF EXISTS "website_covers_owner_write" ON storage.objects;
DROP POLICY IF EXISTS "website_covers_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "website_covers_owner_delete" ON storage.objects;

-- Public read
CREATE POLICY "website_covers_public_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'website-covers');

-- Owner-only write (path: <userId>/<filename>)
CREATE POLICY "website_covers_owner_write" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'website-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "website_covers_owner_update" ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'website-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "website_covers_owner_delete" ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'website-covers'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

COMMIT;

-- ============================================================
-- ROLLBACK (manual):
-- ------------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS "website_covers_public_read" ON storage.objects;
-- DROP POLICY IF EXISTS "website_covers_owner_write" ON storage.objects;
-- DROP POLICY IF EXISTS "website_covers_owner_update" ON storage.objects;
-- DROP POLICY IF EXISTS "website_covers_owner_delete" ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'website-covers';
-- COMMIT;
-- ============================================================
