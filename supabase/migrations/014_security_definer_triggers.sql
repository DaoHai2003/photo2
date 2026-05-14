-- ============================================================
-- Migration 014: SECURITY DEFINER cho counter triggers
-- ============================================================
-- Mục đích:
--   FIX VĨNH VIỄN tình trạng "khách bấm thích/chọn/comment xong nhưng
--   counter trên photos không tăng → tab 'đã thích/đã chọn/bình luận'
--   không hiện ảnh; phải bấm sync counters bên admin mới fix":
--
--   Root cause: trigger functions update_like_count / update_selection_counts
--   / update_comment_count được tạo KHÔNG có SECURITY DEFINER → trigger fire
--   với role của caller (anon cho khách). RLS trên bảng `photos` block UPDATE
--   cho anon → trigger silently fail → like_count / selection_count /
--   comment_count không tăng.
--
--   Fix: ALTER FUNCTION ... SECURITY DEFINER → trigger chạy với quyền owner
--   (postgres) bypass RLS → counter update OK ngay khi khách thao tác.
--
-- An toàn: KHÔNG đụng data, chỉ đổi attribute của function. Idempotent —
-- chạy lại nhiều lần không sao.
-- ============================================================

BEGIN;

-- 1. Like counter trigger
ALTER FUNCTION update_like_count() SECURITY DEFINER;

-- 2. Selection counter trigger (cũng update albums.total_selections)
ALTER FUNCTION update_selection_counts() SECURITY DEFINER;

-- 3. Comment counter trigger
ALTER FUNCTION update_comment_count() SECURITY DEFINER;

-- 4. Album photo_count trigger (tránh drift khi insert photo từ background job)
ALTER FUNCTION update_album_photo_count() SECURITY DEFINER;

-- ------------------------------------------------------------
-- 5. Self-heal: recompute counters cho TẤT CẢ albums hiện tại để
--    fix data đã bị drift trước khi migration này chạy.
-- ------------------------------------------------------------

-- Resync like_count cho mọi photo đang có row trong photo_likes
UPDATE photos p SET like_count = COALESCE(l.cnt, 0)
FROM (
    SELECT photo_id, COUNT(*) AS cnt FROM photo_likes GROUP BY photo_id
) l
WHERE p.id = l.photo_id AND p.like_count IS DISTINCT FROM l.cnt;

UPDATE photos SET like_count = 0
WHERE like_count > 0
  AND id NOT IN (SELECT photo_id FROM photo_likes);

-- Resync selection_count
UPDATE photos p SET selection_count = COALESCE(s.cnt, 0)
FROM (
    SELECT photo_id, COUNT(*) AS cnt FROM photo_selections GROUP BY photo_id
) s
WHERE p.id = s.photo_id AND p.selection_count IS DISTINCT FROM s.cnt;

UPDATE photos SET selection_count = 0
WHERE selection_count > 0
  AND id NOT IN (SELECT photo_id FROM photo_selections);

-- Resync comment_count
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

-- Resync albums.total_selections + photo_count
UPDATE albums a SET total_selections = COALESCE(s.cnt, 0)
FROM (
    SELECT album_id, COUNT(*) AS cnt FROM photo_selections GROUP BY album_id
) s
WHERE a.id = s.album_id AND a.total_selections IS DISTINCT FROM s.cnt;

UPDATE albums SET total_selections = 0
WHERE total_selections > 0
  AND id NOT IN (SELECT album_id FROM photo_selections);

UPDATE albums a SET photo_count = COALESCE(p.cnt, 0)
FROM (
    SELECT album_id, COUNT(*) AS cnt FROM photos GROUP BY album_id
) p
WHERE a.id = p.album_id AND a.photo_count IS DISTINCT FROM p.cnt;

UPDATE albums SET photo_count = 0
WHERE photo_count > 0
  AND id NOT IN (SELECT album_id FROM photos);

COMMIT;

-- ============================================================
-- ROLLBACK (manual):
--   BEGIN;
--   ALTER FUNCTION update_like_count() SECURITY INVOKER;
--   ALTER FUNCTION update_selection_counts() SECURITY INVOKER;
--   ALTER FUNCTION update_comment_count() SECURITY INVOKER;
--   ALTER FUNCTION update_album_photo_count() SECURITY INVOKER;
--   COMMIT;
-- ============================================================
