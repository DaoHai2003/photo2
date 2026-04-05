-- Thêm cột lưu Google Drive token vào studios
ALTER TABLE studios ADD COLUMN IF NOT EXISTS google_drive_token TEXT;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
