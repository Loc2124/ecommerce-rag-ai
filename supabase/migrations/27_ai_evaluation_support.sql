-- AI evaluation support: semantic chat-answer cache and explicit search modes.

begin;

create or replace function public.match_chat_answer(
  p_query_embedding vector(3072),
  p_distance_threshold numeric default 0.08
) returns table (
  answer text,
  question text,
  distance numeric,
  search_method text,
  created_at timestamptz
) as $$
begin
  if p_query_embedding is null then
    return;
  end if;
  if p_distance_threshold is null or p_distance_threshold < 0 or p_distance_threshold > 2 then
    raise exception 'distance threshold must be between 0 and 2';
  end if;

  return query
  select
    c.answer,
    c.question,
    (c.question_embedding <=> p_query_embedding)::numeric as distance,
    c.search_method,
    c.created_at
  from public.chat_logs c
  where c.used_rag = true
    and c.answer is not null
    and c.question_embedding is not null
    and (c.question_embedding <=> p_query_embedding) <= p_distance_threshold
  order by c.question_embedding <=> p_query_embedding, c.created_at desc
  limit 1;
end;
$$ language plpgsql;

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
    select p.id,
      ts_rank(p.fts, websearch_to_tsquery('simple', coalesce(p_query_text, ''))) as raw_score
    from public.products p
    where p.is_active = true
      and p_mode in ('keyword', 'hybrid')
      and p.fts @@ websearch_to_tsquery('simple', coalesce(p_query_text, ''))
  ),
  kw_norm as (
    select kw.id,
      case when max(raw_score) over () = min(raw_score) over () then 1
      else (raw_score - min(raw_score) over ())
        / nullif(max(raw_score) over () - min(raw_score) over (), 0) end as score
    from kw
  ),
  vs as (
    select p.id, (p.embedding <=> p_query_embedding) as raw_distance
    from public.products p
    where p.is_active = true
      and p_mode in ('vector', 'hybrid')
      and p.embedding is not null
    order by p.embedding <=> p_query_embedding
    limit greatest(p_match_count * 4, 20)
  ),
  vs_norm as (
    select vs.id,
      case when max(raw_distance) over () = min(raw_distance) over () then 1
      else 1 - (raw_distance - min(raw_distance) over ())
        / nullif(max(raw_distance) over () - min(raw_distance) over (), 0) end as score
    from vs
  )
  select p.id, p.name, p.price,
    coalesce(k.score, 0)::numeric,
    coalesce(v.score, 0)::numeric,
    case
      when p_mode = 'keyword' then coalesce(k.score, 0)::numeric
      when p_mode = 'vector' then coalesce(v.score, 0)::numeric
      else (p_alpha * coalesce(v.score, 0)
        + (1 - p_alpha) * coalesce(k.score, 0))::numeric
    end
  from public.products p
  left join kw_norm k on k.id = p.id
  left join vs_norm v on v.id = p.id
  where p.is_active = true
    and ((p_mode = 'keyword' and k.id is not null)
      or (p_mode = 'vector' and v.id is not null)
      or (p_mode = 'hybrid' and (k.id is not null or v.id is not null)))
  order by 6 desc
  limit p_match_count;
end;
$$ language plpgsql;

revoke execute on function public.match_chat_answer(vector, numeric)
  from public, anon, authenticated;
revoke execute on function public.search_products_by_mode(text, vector, text, numeric, integer)
  from public, anon, authenticated;
grant execute on function public.match_chat_answer(vector, numeric) to service_role;
grant execute on function public.search_products_by_mode(text, vector, text, numeric, integer)
  to service_role;

commit;
