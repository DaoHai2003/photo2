-- ============================================================
-- Migration 013: Track Google Drive folder ID trong photo_groups
-- ============================================================
-- Để Quét lại Drive có thể detect rename + sync chính xác:
--   • Match group qua drive_folder_id (stable) thay vì name (có thể đổi)
--   • Khi user rename folder trong Drive → app tự update name của group
--   • Photos auto-assign vào đúng group sau khi rescan
-- An toàn: chỉ ADD COLUMN, không động data hiện có.
-- ============================================================

BEGIN;

ALTER TABLE photo_groups
  ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;

CREATE INDEX IF NOT EXISTS idx_photo_groups_drive_folder
  ON photo_groups(album_id, drive_folder_id)
  WHERE drive_folder_id IS NOT NULL;

COMMIT;
