-- Allow admins to finalize refunds for payments received after an order expired.
-- Such orders already had stock restored by the expiry/cancellation path.

begin;

create or replace function public.finalize_refund_and_cancel_order(
  p_order_id uuid,
  p_admin_id uuid,
  p_refund_transaction_id text,
  p_note text default null
) returns text as $$
declare
  v_status order_status;
  v_request_status text;
  v_item record;
begin
  select status into v_status
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    return 'order_not_found';
  end if;

  if v_status not in ('confirmed', 'requires_refund') then
    return 'invalid_order_status';
  end if;

  select status into v_request_status
  from public.refund_requests
  where order_id = p_order_id
  for update;

  if v_status = 'confirmed' and v_request_status is null then
    return 'refund_request_not_found';
  end if;
  if v_request_status is not null and v_request_status <> 'pending' then
    return 'refund_request_already_processed';
  end if;
  if nullif(trim(p_refund_transaction_id), '') is null then
    return 'refund_transaction_id_required';
  end if;

  if v_status = 'confirmed' then
    for v_item in
      select product_id, quantity
      from public.order_items
      where order_id = p_order_id
    loop
      update public.products
      set stock = stock + v_item.quantity
      where id = v_item.product_id;
    end loop;
  end if;

  update public.orders
  set status = 'cancelled', expires_at = null, updated_at = now()
  where id = p_order_id;

  if v_request_status is null then
    insert into public.refund_requests(
      order_id, requested_by, status, refund_transaction_id, note,
      processed_at, processed_by
    ) values (
      p_order_id, p_admin_id, 'completed', trim(p_refund_transaction_id),
      p_note, now(), p_admin_id
    );
  else
    update public.refund_requests
    set status = 'completed',
        refund_transaction_id = trim(p_refund_transaction_id),
        note = p_note,
        processed_at = now(),
        processed_by = p_admin_id
    where order_id = p_order_id;
  end if;

  insert into public.admin_events(
    user_id, action, resource_type, resource_id, details
  ) values (
    p_admin_id,
    'refund_completed_order_cancelled',
    'order',
    p_order_id,
    jsonb_build_object(
      'refund_transaction_id', trim(p_refund_transaction_id),
      'note', p_note
    )
  );

  return 'cancelled';
end;
$$ language plpgsql;

revoke execute on function public.finalize_refund_and_cancel_order(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_refund_and_cancel_order(uuid, uuid, text, text)
  to service_role;

commit;
