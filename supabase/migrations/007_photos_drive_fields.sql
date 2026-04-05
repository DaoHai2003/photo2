ALTER TABLE photos ADD COLUMN IF NOT EXISTS drive_file_id TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS drive_thumbnail_link TEXT;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS drive_web_link TEXT;

-- storage_path giờ optional (không cần nếu dùng Drive)
ALTER TABLE photos ALTER COLUMN storage_path DROP NOT NULL;
