-- Enable prefix matching in hybrid keyword search (for example, "appl" -> "apple").
-- Tokens are sanitized before building the tsquery so user input cannot inject
-- tsquery operators or produce malformed search expressions.

begin;

create or replace function match_products(
  p_query_text text,
  p_query_embedding vector(3072),
  p_alpha numeric default 0.5,
  p_match_count int default 5
) returns table (
  prod_id uuid,
  name text,
  price numeric(12,2),
  keyword_score numeric,
  vector_score numeric,
  combined_score numeric
) as $$
begin
  return query
  with keyword_query as (
    select coalesce(
      string_agg(
        regexp_replace(token, '[^[:alnum:]_]+', '', 'g') || ':*',
        ' & '
      ) filter (where regexp_replace(token, '[^[:alnum:]_]+', '', 'g') <> ''),
      ''
    ) as query_text
    from regexp_split_to_table(lower(coalesce(p_query_text, '')), '\s+') as token
  ),
  kw as (
    select
      p.id as kw_pid,
      ts_rank(p.fts, to_tsquery('simple', kq.query_text)) as raw_score
    from products p
    cross join keyword_query kq
    where p.is_active = true
      and kq.query_text <> ''
      and p.fts @@ to_tsquery('simple', kq.query_text)
  ),
  kw_norm as (
    select
      kw_pid,
      case
        when max(raw_score) over () = min(raw_score) over () then 1
        else (raw_score - min(raw_score) over ())
             / (max(raw_score) over () - min(raw_score) over ())
      end as score
    from kw
  ),
  vs as (
    select p.id as vs_pid, (p.embedding <=> p_query_embedding) as raw_distance
    from products p
    where p.is_active = true and p.embedding is not null
    order by p.embedding <=> p_query_embedding
    limit greatest(p_match_count * 4, 20)
  ),
  vs_norm as (
    select
      vs_pid,
      case
        when max(raw_distance) over () = min(raw_distance) over () then 1
        else 1 - (raw_distance - min(raw_distance) over ())
                 / (max(raw_distance) over () - min(raw_distance) over ())
      end as score
    from vs
  )
  select
    p.id as prod_id,
    p.name,
    p.price,
    coalesce(k.score, 0)::numeric as keyword_score,
    coalesce(v.score, 0)::numeric as vector_score,
    (p_alpha * coalesce(v.score, 0)
      + (1 - p_alpha) * coalesce(k.score, 0))::numeric as combined_score
  from products p
  left join kw_norm k on k.kw_pid = p.id
  left join vs_norm v on v.vs_pid = p.id
  where p.is_active = true and (k.kw_pid is not null or v.vs_pid is not null)
  order by combined_score desc
  limit p_match_count;
end;
$$ language plpgsql;

commit;
