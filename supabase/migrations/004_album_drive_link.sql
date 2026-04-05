-- Thêm cột liên kết Drive folder vào albums
ALTER TABLE albums ADD COLUMN IF NOT EXISTS drive_folder_id TEXT;
ALTER TABLE albums ADD COLUMN IF NOT EXISTS drive_folder_url TEXT;

-- Thêm cột Drive token vào studios (nếu chưa có)
ALTER TABLE studios ADD COLUMN IF NOT EXISTS google_drive_token TEXT;
ALTER TABLE studios ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
