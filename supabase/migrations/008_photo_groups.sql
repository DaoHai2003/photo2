-- Thêm cột phân loại ảnh gốc / chỉnh sửa
ALTER TABLE photos ADD COLUMN IF NOT EXISTS photo_type TEXT DEFAULT 'original' CHECK (photo_type IN ('original', 'edited'));

-- Bảng nhóm ảnh chỉnh sửa
CREATE TABLE IF NOT EXISTS photo_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    album_id UUID NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Mặc định',
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photo_groups_album ON photo_groups(album_id);

ALTER TABLE photo_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "photo_groups_select" ON photo_groups FOR SELECT USING (true);
CREATE POLICY "photo_groups_insert" ON photo_groups FOR INSERT WITH CHECK (true);
CREATE POLICY "photo_groups_update" ON photo_groups FOR UPDATE USING (true);
CREATE POLICY "photo_groups_delete" ON photo_groups FOR DELETE USING (true);

-- Thêm cột group_id vào photos
ALTER TABLE photos ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES photo_groups(id) ON DELETE SET NULL;
