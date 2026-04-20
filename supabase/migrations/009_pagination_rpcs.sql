-- ============================================================
-- Migration 009: Server-side pagination + filter RPC
-- ============================================================
-- Purpose:
--   Replace client-side "fetch all photos then slice" with a single
--   server-paginated RPC that can filter by tab (all | liked | selected |
--   commented), search by filename (pg_trgm), sort, and return both the
--   page rows and the total count in one query.
--
-- Uses denormalized counters already kept in sync by triggers:
--   - photos.like_count       (migration 006)
--   - photos.selection_count  (migration 001 trigger)
--   - photos.comment_count    (migration 001 trigger)
--   So no JOIN/EXISTS needed for tab filtering → fast on 3700+ albums.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- Extensions — pg_trgm for "contains" search on filenames.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ------------------------------------------------------------
-- Indexes to keep EXPLAIN on index scan (not seq scan) for all
-- filter/sort combos on a single album's photos.
-- ------------------------------------------------------------

-- Primary composite for the hot path: album + type + sort_order ASC.
CREATE INDEX IF NOT EXISTS idx_photos_album_type_sort
    ON photos(album_id, photo_type, sort_order);

-- Alternative sort by created_at (used for "Mới nhất" order).
CREATE INDEX IF NOT EXISTS idx_photos_album_type_created
    ON photos(album_id, photo_type, created_at);

-- Partial indexes for the tab filters (match only rows that qualify —
-- tiny & fast for large albums where most photos have 0 likes/selections).
CREATE INDEX IF NOT EXISTS idx_photos_album_liked
    ON photos(album_id, photo_type, sort_order)
    WHERE like_count > 0;

CREATE INDEX IF NOT EXISTS idx_photos_album_selected
    ON photos(album_id, photo_type, sort_order)
    WHERE selection_count > 0;

CREATE INDEX IF NOT EXISTS idx_photos_album_commented
    ON photos(album_id, photo_type, sort_order)
    WHERE comment_count > 0;

-- Trigram GIN for contains-search on normalized_filename.
CREATE INDEX IF NOT EXISTS idx_photos_norm_name_trgm
    ON photos USING gin (normalized_filename gin_trgm_ops);

-- ------------------------------------------------------------
-- RPC: get_album_photos_page
-- Returns (photo jsonb, total_count bigint) — total_count repeated on
-- every row via COUNT(*) OVER() so the client reads it once from row[0].
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_album_photos_page(
    p_album_id    UUID,
    p_photo_type  TEXT DEFAULT 'original',
    p_filter      TEXT DEFAULT 'all',
    p_search      TEXT DEFAULT NULL,
    p_sort        TEXT DEFAULT 'sort_order',
    p_sort_dir    TEXT DEFAULT 'asc',
    p_page        INT  DEFAULT 1,
    p_page_size   INT  DEFAULT 100
)
RETURNS TABLE (photo jsonb, total_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
    WITH params AS (
        SELECT
            GREATEST(1, LEAST(COALESCE(p_page_size, 100), 500))  AS page_size,
            GREATEST(1, COALESCE(p_page, 1))                      AS page_num,
            NULLIF(LOWER(TRIM(COALESCE(p_search, ''))), '')       AS search_q,
            COALESCE(p_photo_type, 'original')                    AS ptype,
            COALESCE(p_filter, 'all')                             AS pfilter,
            COALESCE(p_sort, 'sort_order')                        AS psort,
            LOWER(COALESCE(p_sort_dir, 'asc'))                    AS pdir
    ),
    filtered AS (
        SELECT p.*
        FROM photos p, params
        WHERE p.album_id = p_album_id
          AND p.photo_type = params.ptype
          AND (
              params.pfilter = 'all'
              OR (params.pfilter = 'liked'     AND p.like_count > 0)
              OR (params.pfilter = 'selected'  AND p.selection_count > 0)
              OR (params.pfilter = 'commented' AND p.comment_count > 0)
          )
          AND (
              params.search_q IS NULL
              OR p.normalized_filename ILIKE '%' || params.search_q || '%'
          )
    ),
    ordered AS (
        SELECT f.*, COUNT(*) OVER() AS total
        FROM filtered f, params
        ORDER BY
            -- sort_order ascending (default)
            CASE WHEN params.psort = 'sort_order' AND params.pdir = 'asc'
                 THEN f.sort_order END ASC NULLS LAST,
            CASE WHEN params.psort = 'sort_order' AND params.pdir = 'desc'
                 THEN f.sort_order END DESC NULLS LAST,
            -- created_at
            CASE WHEN params.psort = 'created_at' AND params.pdir = 'asc'
                 THEN f.created_at END ASC NULLS LAST,
            CASE WHEN params.psort = 'created_at' AND params.pdir = 'desc'
                 THEN f.created_at END DESC NULLS LAST,
            -- filename (alphabetical)
            CASE WHEN params.psort = 'filename' AND params.pdir = 'asc'
                 THEN f.normalized_filename END ASC NULLS LAST,
            CASE WHEN params.psort = 'filename' AND params.pdir = 'desc'
                 THEN f.normalized_filename END DESC NULLS LAST,
            -- deterministic tie-breaker so pagination is stable
            f.id ASC
        LIMIT  (SELECT page_size FROM params)
        OFFSET (SELECT (page_num - 1) * page_size FROM params)
    )
    SELECT
        to_jsonb(o) - 'total' AS photo,
        o.total                AS total_count
    FROM ordered o;
$$;

-- Allow anon (public pages) and authenticated (admin) to call.
GRANT EXECUTE ON FUNCTION get_album_photos_page(
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT
) TO anon, authenticated;

COMMIT;

-- ============================================================
-- ROLLBACK (manual — copy below to a separate file if needed):
-- ------------------------------------------------------------
-- BEGIN;
-- DROP FUNCTION IF EXISTS get_album_photos_page(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT);
-- DROP INDEX IF EXISTS idx_photos_norm_name_trgm;
-- DROP INDEX IF EXISTS idx_photos_album_commented;
-- DROP INDEX IF EXISTS idx_photos_album_selected;
-- DROP INDEX IF EXISTS idx_photos_album_liked;
-- DROP INDEX IF EXISTS idx_photos_album_type_created;
-- DROP INDEX IF EXISTS idx_photos_album_type_sort;
-- -- pg_trgm extension left installed (safe).
-- COMMIT;
-- ============================================================
