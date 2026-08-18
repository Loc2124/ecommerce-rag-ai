-- Migration 08: Drop and recreate match_products to apply new return type
-- WARNING: Backup DB before running migrations in production.

BEGIN;

-- Drop existing function with old signature (if present)
DROP FUNCTION IF EXISTS match_products(text, vector, numeric, integer);

-- Recreate function with updated return table (uses product_id to avoid ambiguous 'id')
create or replace function match_products(
  p_query_text text,
  p_query_embedding vector(3072),
  p_alpha numeric default 0.5,
  p_match_count int default 5
) returns table (
  product_id uuid,
  name text,
  price numeric(12,2),
  keyword_score numeric,
  vector_score numeric,
  combined_score numeric
) as $$
begin
  return query
  with kw as (
    select
      p.id as product_id,
      ts_rank(p.fts, websearch_to_tsquery('simple', p_query_text)) as raw_score
    from products p
    where p.is_active = true
      and p.fts @@ websearch_to_tsquery('simple', p_query_text)
  ),
  kw_norm as (
    select
      product_id,
      case
        when max(raw_score) over () = min(raw_score) over () then 1
        else (raw_score - min(raw_score) over ())
             / (max(raw_score) over () - min(raw_score) over ())
      end as score
    from kw
  ),
  vs as (
    select p.id as product_id, (p.embedding <=> p_query_embedding) as raw_distance
    from products p
    where p.is_active = true and p.embedding is not null
    order by p.embedding <=> p_query_embedding
    limit greatest(p_match_count * 4, 20)
  ),
  vs_norm as (
    select
      product_id,
      case
        when max(raw_distance) over () = min(raw_distance) over () then 1
        else 1 - (raw_distance - min(raw_distance) over ())
                 / (max(raw_distance) over () - min(raw_distance) over ())
      end as score
    from vs
  )
  select
    p.id as product_id,
    p.name,
    p.price,
    coalesce(k.score, 0)::numeric as keyword_score,
    coalesce(v.score, 0)::numeric as vector_score,
    (p_alpha * coalesce(v.score, 0) + (1 - p_alpha) * coalesce(k.score, 0))::numeric as combined_score
  from products p
  left join kw_norm k on k.product_id = p.id
  left join vs_norm v on v.product_id = p.id
  where p.is_active = true and (k.product_id is not null or v.product_id is not null)
  order by combined_score desc
  limit p_match_count;
end;
$$ language plpgsql;

COMMIT;
