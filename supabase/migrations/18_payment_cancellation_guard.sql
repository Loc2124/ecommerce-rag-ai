-- Prevent restocking a paid PayOS order through direct RPC calls.
-- Refund processing must happen before cancellation of a confirmed paid order.
-- PayOS PAID is normalized by confirm_payos_payment to payments.status = 'success'.

begin;

create or replace function public.cancel_and_restock_order(
  p_order_id uuid,
  p_new_status order_status
) returns text as $$
declare
  v_status order_status;
  v_payment_method payment_method;
  v_item record;
begin
  select status, payment_method
    into v_status, v_payment_method
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    return 'order_not_found';
  end if;

  if v_status not in ('pending', 'confirmed') then
    return 'invalid_status_for_restock';
  end if;

  if p_new_status not in ('cancelled', 'expired') then
    return 'invalid_restock_status';
  end if;

  if p_new_status = 'expired' and v_status <> 'pending' then
    return 'invalid_expiry_status';
  end if;

  if v_status = 'confirmed'
     and v_payment_method = 'payos'
     and exists (
       select 1
       from public.payments
       where order_id = p_order_id and status = 'success'
     ) then
    return 'requires_refund';
  end if;

  for v_item in
    select product_id, quantity
    from public.order_items
    where order_id = p_order_id
  loop
    update public.products
    set stock = stock + v_item.quantity
    where id = v_item.product_id;
  end loop;

  update public.orders
  set status = p_new_status, expires_at = null, updated_at = now()
  where id = p_order_id;

  return p_new_status::text;
end;
$$ language plpgsql;

commit;
