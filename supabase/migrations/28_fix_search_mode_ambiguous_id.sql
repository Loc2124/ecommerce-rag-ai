-- Fix ambiguous output-column references in search_products_by_mode.

begin;

create or replace function public.search_products_by_mode(
  p_query_text text,
  p_query_embedding vector(3072) default null,
  p_mode text default 'hybrid',
  p_alpha numeric default 0.5,
  p_match_count int default 5
) returns table (
  id uuid,
  name text,
  price numeric(12,2),
  keyword_score numeric,
  vector_score numeric,
  combined_score numeric
) as $$
begin
  if p_mode not in ('keyword', 'vector', 'hybrid') then
    raise exception 'mode must be keyword, vector, or hybrid';
  end if;
  if p_mode in ('vector', 'hybrid') and p_query_embedding is null then
    raise exception 'query embedding is required for vector and hybrid modes';
  end if;
  if p_alpha is null or p_alpha < 0 or p_alpha > 1 then
    raise exception 'alpha must be between 0 and 1';
  end if;
  if p_match_count is null or p_match_count < 1 or p_match_count > 50 then
    raise exception 'match count must be between 1 and 50';
  end if;

  return query
  with kw as (
    select product_row.id,
      ts_rank(product_row.fts, websearch_to_tsquery('simple', coalesce(p_query_text, ''))) as raw_score
    from public.products product_row
    where product_row.is_active = true
      and p_mode in ('keyword', 'hybrid')
      and product_row.fts @@ websearch_to_tsquery('simple', coalesce(p_query_text, ''))
  ),
  kw_norm as (
    select keyword_rows.id,
      case when max(keyword_rows.raw_score) over () = min(keyword_rows.raw_score) over () then 1
      else (keyword_rows.raw_score - min(keyword_rows.raw_score) over ())
        / nullif(max(keyword_rows.raw_score) over () - min(keyword_rows.raw_score) over (), 0) end as score
    from kw keyword_rows
  ),
  vs as (
    select product_row.id, (product_row.embedding <=> p_query_embedding) as raw_distance
    from public.products product_row
    where product_row.is_active = true
      and p_mode in ('vector', 'hybrid')
      and product_row.embedding is not null
    order by product_row.embedding <=> p_query_embedding
    limit greatest(p_match_count * 4, 20)
  ),
  vs_norm as (
    select vector_rows.id,
      case when max(vector_rows.raw_distance) over () = min(vector_rows.raw_distance) over () then 1
      else 1 - (vector_rows.raw_distance - min(vector_rows.raw_distance) over ())
        / nullif(max(vector_rows.raw_distance) over () - min(vector_rows.raw_distance) over (), 0) end as score
    from vs vector_rows
  )
  select product_row.id, product_row.name, product_row.price,
    coalesce(keyword_rows.score, 0)::numeric,
    coalesce(vector_rows.score, 0)::numeric,
    case
      when p_mode = 'keyword' then coalesce(keyword_rows.score, 0)::numeric
      when p_mode = 'vector' then coalesce(vector_rows.score, 0)::numeric
      else (p_alpha * coalesce(vector_rows.score, 0)
        + (1 - p_alpha) * coalesce(keyword_rows.score, 0))::numeric
    end
  from public.products product_row
  left join kw_norm keyword_rows on keyword_rows.id = product_row.id
  left join vs_norm vector_rows on vector_rows.id = product_row.id
  where product_row.is_active = true
    and ((p_mode = 'keyword' and keyword_rows.id is not null)
      or (p_mode = 'vector' and vector_rows.id is not null)
      or (p_mode = 'hybrid' and (keyword_rows.id is not null or vector_rows.id is not null)))
  order by 6 desc
  limit p_match_count;
end;
$$ language plpgsql;

revoke execute on function public.search_products_by_mode(text, vector, text, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.search_products_by_mode(text, vector, text, numeric, integer)
  to service_role;

commit;