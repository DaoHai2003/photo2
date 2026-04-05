-- Bảng lưu likes (thích) từ khách
CREATE TABLE IF NOT EXISTS photo_likes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    visitor_token TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_like UNIQUE (photo_id, visitor_token)
);

CREATE INDEX IF NOT EXISTS idx_likes_album ON photo_likes(album_id);
CREATE INDEX IF NOT EXISTS idx_likes_photo ON photo_likes(photo_id);
CREATE INDEX IF NOT EXISTS idx_likes_visitor ON photo_likes(album_id, visitor_token);

-- RLS
ALTER TABLE photo_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "likes_select" ON photo_likes FOR SELECT USING (true);
CREATE POLICY "likes_insert" ON photo_likes FOR INSERT WITH CHECK (true);
CREATE POLICY "likes_delete" ON photo_likes FOR DELETE USING (true);

-- Thêm cột like_count vào photos
ALTER TABLE photos ADD COLUMN IF NOT EXISTS like_count INTEGER DEFAULT 0;

-- Trigger cập nhật like_count
CREATE OR REPLACE FUNCTION update_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE photos SET like_count = like_count + 1 WHERE id = NEW.photo_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE photos SET like_count = like_count - 1 WHERE id = OLD.photo_id;
        RETURN OLD;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_like_count
    AFTER INSERT OR DELETE ON photo_likes
    FOR EACH ROW EXECUTE FUNCTION update_like_count();
