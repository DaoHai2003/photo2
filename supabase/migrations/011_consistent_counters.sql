-- ============================================================
-- Migration 011: Consistent counters & self-heal
-- ============================================================
-- Mục đích:
--   FIX VĨNH VIỄN tình trạng "badge ĐÃ CHỌN (12) nhưng tab show 0":
--
--   1) get_album_counts (badge) đếm khác nguồn với get_album_photos_page
--      (tab content) → mismatch khi 1 trong 2 nguồn drift
--   2) photo_selections / photo_likes có thể có orphan rows (rác từ
--      direct DB ops hoặc migration cũ) → badge cao bất thường
--   3) photos.selection_count / like_count / comment_count denormalized
--      đôi khi desync với source-of-truth tables
--
-- Strategy:
--   • Recompute toàn bộ counter từ source tables 1 lần (cleanup state hiện tại)
--   • Delete orphan rows trong photo_selections / photo_likes (an toàn:
--     orphan = photo_id không tồn tại trong photos table → rác)
--   • Replace get_album_counts dùng CHUNG denormalized counter với
--     get_album_photos_page → 2 nguồn không bao giờ khác nhau nữa
--   • Thêm RPC recompute_album_counters() để self-heal 1 album bất kỳ lúc
--     nào nghi drift (callable từ app, hoặc cron weekly)
--
-- An toàn: KHÔNG xoá ảnh, KHÔNG xoá selection/like/comment hợp lệ.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. CLEANUP: xoá orphan rows
--    Chỉ xoá rows mà photo_id không còn trong photos table —
--    đây là rác do CASCADE trước đây không fire (data corruption).
-- ------------------------------------------------------------

DELETE FROM photo_selections
WHERE photo_id NOT IN (SELECT id FROM photos);

DELETE FROM photo_likes
WHERE photo_id NOT IN (SELECT id FROM photos);

-- ------------------------------------------------------------
-- 2. RESYNC: recompute denormalized counter từ source tables
-- ------------------------------------------------------------

-- photos.selection_count = COUNT(photo_selections by photo_id)
UPDATE photos p SET selection_count = COALESCE(s.cnt, 0)
FROM (
    SELECT photo_id, COUNT(*) AS cnt FROM photo_selections GROUP BY photo_id
) s
WHERE p.id = s.photo_id AND p.selection_count IS DISTINCT FROM s.cnt;

UPDATE photos SET selection_count = 0
WHERE selection_count > 0
  AND id NOT IN (SELECT photo_id FROM photo_selections);

-- photos.like_count = COUNT(photo_likes by photo_id)
UPDATE photos p SET like_count = COALESCE(l.cnt, 0)
FROM (
    SELECT photo_id, COUNT(*) AS cnt FROM photo_likes GROUP BY photo_id
) l
WHERE p.id = l.photo_id AND p.like_count IS DISTINCT FROM l.cnt;

UPDATE photos SET like_count = 0
WHERE like_count > 0
  AND id NOT IN (SELECT photo_id FROM photo_likes);

-- photos.comment_count = COUNT(photo_comments WHERE deleted_at IS NULL)
UPDATE photos p SET comment_count = COALESCE(c.cnt, 0)
FROM (
    SELECT photo_id, COUNT(*) AS cnt
    FROM photo_comments
    WHERE deleted_at IS NULL
    GROUP BY photo_id
) c
WHERE p.id = c.photo_id AND p.comment_count IS DISTINCT FROM c.cnt;

UPDATE photos SET comment_count = 0
WHERE comment_count > 0
  AND id NOT IN (SELECT photo_id FROM photo_comments WHERE deleted_at IS NULL);

-- albums.total_selections = COUNT(photo_selections by album_id)
UPDATE albums a SET total_selections = COALESCE(s.cnt, 0)
FROM (
    SELECT album_id, COUNT(*) AS cnt FROM photo_selections GROUP BY album_id
) s
WHERE a.id = s.album_id AND a.total_selections IS DISTINCT FROM s.cnt;

UPDATE albums SET total_selections = 0
WHERE total_selections > 0
  AND id NOT IN (SELECT album_id FROM photo_selections);

-- albums.photo_count = COUNT(photos by album_id)
UPDATE albums a SET photo_count = COALESCE(p.cnt, 0)
FROM (
    SELECT album_id, COUNT(*) AS cnt FROM photos GROUP BY album_id
) p
WHERE a.id = p.album_id AND a.photo_count IS DISTINCT FROM p.cnt;

UPDATE albums SET photo_count = 0
WHERE photo_count > 0
  AND id NOT IN (SELECT album_id FROM photos);

-- ------------------------------------------------------------
-- 3. CONSISTENT COUNTS: replace get_album_counts dùng CHUNG nguồn
--    với get_album_photos_page → badge khớp 100% với tab content.
--    Cả 2 đều đọc từ photos.{selection,like,comment}_count, kèm
--    photo_type='original' (default tab "Ảnh Gốc").
-- ------------------------------------------------------------

-- DROP version cũ (return type khác) trước khi CREATE — Postgres không
-- cho CREATE OR REPLACE đổi return type.
DROP FUNCTION IF EXISTS get_album_counts(UUID);

CREATE OR REPLACE FUNCTION get_album_counts(p_album_id UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    SELECT jsonb_build_object(
        'original_count',   (SELECT COUNT(*) FROM photos WHERE album_id = p_album_id AND photo_type = 'original'),
        'edited_count',     (SELECT COUNT(*) FROM photos WHERE album_id = p_album_id AND photo_type = 'edited'),
        -- Badge counts: CÙNG nguồn với get_album_photos_page filter
        -- → không bao giờ drift apart nữa.
        'liked_photos',     (SELECT COUNT(*) FROM photos WHERE album_id = p_album_id AND photo_type = 'original' AND like_count > 0),
        'selected_photos',  (SELECT COUNT(*) FROM photos WHERE album_id = p_album_id AND photo_type = 'original' AND selection_count > 0),
        'commented_photos', (SELECT COUNT(*) FROM photos WHERE album_id = p_album_id AND photo_type = 'original' AND comment_count > 0)
    );
$$;

GRANT EXECUTE ON FUNCTION get_album_counts(UUID) TO anon, authenticated;

-- ------------------------------------------------------------
-- 4. SELF-HEAL: RPC recompute_album_counters
--    Callable từ app khi user nghi count sai. Re-runs cleanup +
--    resync chỉ trong scope 1 album → an toàn, nhanh.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION recompute_album_counters(p_album_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_orphan_selections INT;
    v_orphan_likes      INT;
BEGIN
    -- Cleanup orphan rows trong scope album
    WITH del AS (
        DELETE FROM photo_selections
        WHERE album_id = p_album_id
          AND photo_id NOT IN (SELECT id FROM photos WHERE album_id = p_album_id)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_orphan_selections FROM del;

    WITH del AS (
        DELETE FROM photo_likes
        WHERE album_id = p_album_id
          AND photo_id NOT IN (SELECT id FROM photos WHERE album_id = p_album_id)
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_orphan_likes FROM del;

    -- Resync selection_count
    UPDATE photos p SET selection_count = COALESCE(s.cnt, 0)
    FROM (
        SELECT photo_id, COUNT(*) AS cnt
        FROM photo_selections
        WHERE album_id = p_album_id
        GROUP BY photo_id
    ) s
    WHERE p.id = s.photo_id AND p.album_id = p_album_id;

    UPDATE photos SET selection_count = 0
    WHERE album_id = p_album_id AND selection_count > 0
      AND id NOT IN (SELECT photo_id FROM photo_selections WHERE album_id = p_album_id);

    -- Resync like_count
    UPDATE photos p SET like_count = COALESCE(l.cnt, 0)
    FROM (
        SELECT photo_id, COUNT(*) AS cnt
        FROM photo_likes
        WHERE album_id = p_album_id
        GROUP BY photo_id
    ) l
    WHERE p.id = l.photo_id AND p.album_id = p_album_id;

    UPDATE photos SET like_count = 0
    WHERE album_id = p_album_id AND like_count > 0
      AND id NOT IN (SELECT photo_id FROM photo_likes WHERE album_id = p_album_id);

    -- Resync comment_count
    UPDATE photos p SET comment_count = COALESCE(c.cnt, 0)
    FROM (
        SELECT photo_id, COUNT(*) AS cnt
        FROM photo_comments
        WHERE album_id = p_album_id AND deleted_at IS NULL
        GROUP BY photo_id
    ) c
    WHERE p.id = c.photo_id AND p.album_id = p_album_id;

    UPDATE photos SET comment_count = 0
    WHERE album_id = p_album_id AND comment_count > 0
      AND id NOT IN (
          SELECT photo_id FROM photo_comments
          WHERE album_id = p_album_id AND deleted_at IS NULL
      );

    -- Resync albums.total_selections + photo_count
    UPDATE albums SET
        total_selections = (SELECT COUNT(*) FROM photo_selections WHERE album_id = p_album_id),
        photo_count      = (SELECT COUNT(*) FROM photos WHERE album_id = p_album_id)
    WHERE id = p_album_id;

    RETURN jsonb_build_object(
        'success', true,
        'album_id', p_album_id,
        'orphan_selections_deleted', v_orphan_selections,
        'orphan_likes_deleted',      v_orphan_likes
    );
END;
$$;

GRANT EXECUTE ON FUNCTION recompute_album_counters(UUID) TO authenticated;

COMMIT;

-- ============================================================
-- ROLLBACK (manual):
-- ------------------------------------------------------------
-- BEGIN;
-- DROP FUNCTION IF EXISTS recompute_album_counters(UUID);
-- -- get_album_counts: restore từ backup nếu cần (không tự rollback được vì
-- -- không có version cũ trong migration cũ)
-- COMMIT;
-- ============================================================
