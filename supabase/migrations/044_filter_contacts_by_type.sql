-- ============================================================
-- 044_filter_contacts_by_type.sql
--
-- Permite combinar:
-- - búsqueda
-- - etiquetas
-- - Type: Individual o Company
-- - paginación
-- ============================================================

CREATE OR REPLACE FUNCTION public.filter_contacts_by_tags(
  p_tag_ids UUID[],
  p_search TEXT,
  p_contact_type TEXT,
  p_limit INTEGER,
  p_offset INTEGER
)
RETURNS TABLE (
  contact JSONB,
  total_count BIGINT
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH filtered_ids AS (
    SELECT DISTINCT
      contact_row.id
    FROM public.contacts AS contact_row

    INNER JOIN public.contact_tags AS contact_tag
      ON contact_tag.contact_id = contact_row.id

    WHERE
      contact_tag.tag_id = ANY(p_tag_ids)

      AND (
        p_contact_type IS NULL
        OR contact_row.contact_type = p_contact_type
      )

      AND (
        p_search IS NULL
        OR BTRIM(p_search) = ''
        OR COALESCE(contact_row.name, '') ILIKE
          '%' || p_search || '%'
        OR contact_row.phone ILIKE
          '%' || p_search || '%'
        OR COALESCE(contact_row.email, '') ILIKE
          '%' || p_search || '%'
      )
  ),

  counted AS (
    SELECT
      COUNT(*)::BIGINT AS total_count
    FROM filtered_ids
  ),

  paged AS (
    SELECT
      contact_row.*
    FROM public.contacts AS contact_row

    INNER JOIN filtered_ids
      ON filtered_ids.id = contact_row.id

    ORDER BY contact_row.created_at DESC

    LIMIT GREATEST(p_limit, 1)
    OFFSET GREATEST(p_offset, 0)
  )

  SELECT
    TO_JSONB(paged) AS contact,
    counted.total_count
  FROM paged

  CROSS JOIN counted;
$$;

REVOKE ALL
ON FUNCTION public.filter_contacts_by_tags(
  UUID[],
  TEXT,
  TEXT,
  INTEGER,
  INTEGER
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.filter_contacts_by_tags(
  UUID[],
  TEXT,
  TEXT,
  INTEGER,
  INTEGER
)
TO authenticated;