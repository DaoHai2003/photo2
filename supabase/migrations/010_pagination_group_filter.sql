-- ============================================================
-- Migration 010: Add group_id filter to pagination RPC
-- ============================================================
-- Adds optional p_group_id parameter to get_album_photos_page
-- so server-side pagination can filter by photo_group.
-- ============================================================

BEGIN;

-- Drop old function signature (8 params) so we can recreate with 9.
DROP FUNCTION IF EXISTS get_album_photos_page(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION get_album_photos_page(
    p_album_id    UUID,
    p_photo_type  TEXT DEFAULT 'original',
    p_filter      TEXT DEFAULT 'all',
    p_search      TEXT DEFAULT NULL,
    p_sort        TEXT DEFAULT 'sort_order',
    p_sort_dir    TEXT DEFAULT 'asc',
    p_page        INT  DEFAULT 1,
    p_page_size   INT  DEFAULT 100,
    p_group_id    UUID DEFAULT NULL
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
          AND (
              p_group_id IS NULL
              OR p.group_id = p_group_id
          )
    ),
    ordered AS (
        SELECT f.*, COUNT(*) OVER() AS total
        FROM filtered f, params
        ORDER BY
            CASE WHEN params.psort = 'sort_order' AND params.pdir = 'asc'
                 THEN f.sort_order END ASC NULLS LAST,
            CASE WHEN params.psort = 'sort_order' AND params.pdir = 'desc'
                 THEN f.sort_order END DESC NULLS LAST,
            CASE WHEN params.psort = 'created_at' AND params.pdir = 'asc'
                 THEN f.created_at END ASC NULLS LAST,
            CASE WHEN params.psort = 'created_at' AND params.pdir = 'desc'
                 THEN f.created_at END DESC NULLS LAST,
            CASE WHEN params.psort = 'filename' AND params.pdir = 'asc'
                 THEN f.normalized_filename END ASC NULLS LAST,
            CASE WHEN params.psort = 'filename' AND params.pdir = 'desc'
                 THEN f.normalized_filename END DESC NULLS LAST,
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
    UUID, TEXT, TEXT, TEXT, TEXT, TEXT, INT, INT, UUID
) TO anon, authenticated;

COMMIT;
