-- Make verified-purchase review validation and insertion atomic.

begin;

create or replace function public.create_verified_review(
  p_product_id uuid,
  p_user_id uuid,
  p_rating int,
  p_comment text default null
) returns table (
  id uuid,
  product_id uuid,
  rating int,
  comment text,
  created_at timestamptz
) as $$
begin
  if p_product_id is null or p_user_id is null then
    raise exception 'product and user are required';
  end if;
  if p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5';
  end if;
  if p_comment is not null and length(p_comment) > 2000 then
    raise exception 'comment must not exceed 2000 characters';
  end if;
  if not exists (
    select 1 from public.products
    where id = p_product_id and is_active = true
  ) then
    raise exception 'product not found';
  end if;
  if not exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.user_id = p_user_id
      and o.status = 'completed'
      and oi.product_id = p_product_id
  ) then
    raise exception 'a completed purchase is required to review this product';
  end if;

  return query
  insert into public.rated(product_id, user_id, rating, comment)
  values (p_product_id, p_user_id, p_rating, p_comment)
  returning rated.id, rated.product_id, rated.rating, rated.comment, rated.created_at;
end;
$$ language plpgsql;

revoke execute on function public.create_verified_review(uuid, uuid, int, text)
  from public, anon, authenticated;
grant execute on function public.create_verified_review(uuid, uuid, int, text)
  to service_role;

commit;
