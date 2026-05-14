-- ============================================================
-- Migration 023: Face search feature
-- ============================================================
-- Thêm pgvector + 2 bảng mới:
--   1. photo_faces — lưu embedding 512-dim của mặt detected trong ảnh
--   2. photo_face_index_jobs — queue worker xử lý ảnh mới
-- + cột mới `face_search_enabled` trên albums (default false → opt-in)
--
-- KHÔNG ảnh hưởng tables/columns hiện có. Chỉ ADD, không ALTER/DROP.
-- Idempotent: chạy lại nhiều lần OK.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Enable pgvector extension
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;

-- ------------------------------------------------------------
-- 2. photo_faces — embeddings của mỗi mặt detected
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photo_faces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  album_id uuid NOT NULL REFERENCES albums(id) ON DELETE CASCADE,
  face_bbox jsonb NOT NULL,              -- {x, y, width, height} bounding box
  embedding vector(512) NOT NULL,        -- ArcFace 512-dim
  confidence float NOT NULL,             -- detection confidence 0-1
  created_at timestamptz DEFAULT now()
);

-- Vector similarity index (IVFFLAT cosine, lists=100 cho dataset <1M)
CREATE INDEX IF NOT EXISTS photo_faces_embedding_idx
  ON photo_faces USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- B-tree filter theo album nhanh
CREATE INDEX IF NOT EXISTS photo_faces_album_idx ON photo_faces(album_id);

-- RLS: anon đọc faces của album published (cho search hoạt động)
ALTER TABLE photo_faces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read faces of published albums" ON photo_faces;
CREATE POLICY "Public read faces of published albums" ON photo_faces
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM albums WHERE id = photo_faces.album_id AND is_published = true)
  );

-- ------------------------------------------------------------
-- 3. photo_face_index_jobs — queue indexing
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS photo_face_index_jobs (
  photo_id uuid PRIMARY KEY REFERENCES photos(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  attempts int DEFAULT 0,
  last_error text,
  faces_found int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photo_face_index_jobs_status_idx
  ON photo_face_index_jobs(status);

-- ------------------------------------------------------------
-- 4. Cột mới `face_search_enabled` trên albums (opt-in per album)
-- ------------------------------------------------------------
ALTER TABLE albums ADD COLUMN IF NOT EXISTS face_search_enabled boolean DEFAULT false;

-- ------------------------------------------------------------
-- 5. RPC: enqueue indexing cho 1 album (gọi khi owner bật toggle hoặc backfill)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION enqueue_album_face_index(p_album_id UUID)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count INT;
BEGIN
  INSERT INTO photo_face_index_jobs (photo_id)
  SELECT id FROM photos WHERE album_id = p_album_id
  ON CONFLICT (photo_id) DO UPDATE
    SET status = 'pending', attempts = 0, updated_at = now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION enqueue_album_face_index(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6. Trigger auto-enqueue khi photo mới insert vào album đã bật face_search
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_enqueue_face_index_on_photo_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM albums
    WHERE id = NEW.album_id AND face_search_enabled = true
  ) THEN
    INSERT INTO photo_face_index_jobs (photo_id)
    VALUES (NEW.id)
    ON CONFLICT (photo_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS photos_enqueue_face_index ON photos;
CREATE TRIGGER photos_enqueue_face_index
  AFTER INSERT ON photos
  FOR EACH ROW EXECUTE FUNCTION trigger_enqueue_face_index_on_photo_insert();

COMMIT;

-- VERIFY:
-- SELECT extname FROM pg_extension WHERE extname='vector';  -- phải có 1 row
-- \d photo_faces                                              -- check schema
-- \d photo_face_index_jobs
-- SELECT face_search_enabled FROM albums LIMIT 1;            -- phải có cột mới
-- SELECT enqueue_album_face_index('<album-uuid>');           -- test RPC
