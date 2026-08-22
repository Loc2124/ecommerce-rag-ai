-- Add database-side validation for order RPC inputs.

begin;

create or replace function public.create_order(
  p_user_id uuid,
  p_items jsonb,
  p_payment_method payment_method,
  p_hold_minutes int default 15
) returns uuid as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_price numeric(12,2);
  v_stock int;
  v_total numeric(12,2) := 0;
  v_status order_status;
  v_expires_at timestamptz;
begin
  if p_user_id is null then raise exception 'user id is required'; end if;
  if p_payment_method is null then raise exception 'payment method is required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'at least one order item is required';
  end if;
  if exists (
    select value->>'product_id'
    from jsonb_array_elements(p_items)
    group by value->>'product_id'
    having count(*) > 1
  ) then
    raise exception 'duplicate product ids are not allowed';
  end if;
  if p_hold_minutes < 1 or p_hold_minutes > 1440 then
    raise exception 'hold minutes must be between 1 and 1440';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items) order by (value->>'product_id')
  loop
    if nullif(v_item->>'product_id', '') is null
       or (v_item->>'quantity') !~ '^[0-9]+$'
       or (v_item->>'quantity')::int < 1 then
      raise exception 'each item requires a positive quantity and product id';
    end if;
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    select stock into v_stock from public.products
    where id = v_product_id and is_active = true for update;
    if v_stock is null then raise exception 'product does not exist'; end if;
    if v_stock < v_qty then raise exception 'insufficient stock'; end if;
  end loop;

  if p_payment_method = 'cod' then
    v_status := 'confirmed';
    v_expires_at := null;
  else
    v_status := 'pending';
    v_expires_at := now() + (p_hold_minutes || ' minutes')::interval;
  end if;

  insert into public.orders (user_id, status, payment_method, total, expires_at)
  values (p_user_id, v_status, p_payment_method, 0, v_expires_at)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;
    select price into v_price from public.products where id = v_product_id;
    update public.products set stock = stock - v_qty where id = v_product_id;
    insert into public.order_items(order_id, product_id, quantity, price_at_order)
    values (v_order_id, v_product_id, v_qty, v_price);
    v_total := v_total + v_price * v_qty;
  end loop;

  update public.orders set total = v_total where id = v_order_id;
  return v_order_id;
end;
$$ language plpgsql;

commit;
