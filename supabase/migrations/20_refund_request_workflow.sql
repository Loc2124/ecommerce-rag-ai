-- Track paid-order cancellation requests without changing the confirmed order
-- status until an administrator confirms the external refund is complete.

begin;

create table if not exists public.refund_requests (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'rejected')),
  refund_transaction_id text,
  note text,
  requested_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_refund_requests_status
  on public.refund_requests(status, requested_at desc);

create unique index if not exists idx_refund_transaction_id_unique
  on public.refund_requests(refund_transaction_id)
  where refund_transaction_id is not null;

alter table public.refund_requests enable row level security;
revoke all on table public.refund_requests from anon, authenticated;

create or replace function public.request_refund_for_order(
  p_order_id uuid,
  p_requested_by uuid
) returns text as $$
declare
  v_status order_status;
  v_payment_method payment_method;
  v_request_status text;
begin
  select status, payment_method
    into v_status, v_payment_method
  from public.orders
  where id = p_order_id
  for update;

  if v_status is null then
    return 'order_not_found';
  end if;

  if v_status <> 'confirmed' or v_payment_method <> 'payos' then
    return 'refund_not_required';
  end if;

  if not exists (
    select 1 from public.payments
    where order_id = p_order_id and status = 'success'
  ) then
    return 'payment_not_confirmed';
  end if;

  select status into v_request_status
  from public.refund_requests
  where order_id = p_order_id
  for update;

  if v_request_status = 'pending' then
    return 'refund_already_requested';
  end if;

  if v_request_status = 'completed' then
    return 'refund_completed';
  end if;

  insert into public.refund_requests(order_id, requested_by, status)
  values (p_order_id, p_requested_by, 'pending')
  on conflict (order_id) do update
    set requested_by = excluded.requested_by,
        status = 'pending',
        requested_at = now(),
        processed_at = null,
        processed_by = null,
        refund_transaction_id = null;

  insert into public.admin_events(
    user_id, action, resource_type, resource_id, details
  ) values (
    p_requested_by,
    'refund_requested',
    'order',
    p_order_id,
    jsonb_build_object('reason', 'paid_order_cancellation')
  );

  return 'refund_requested';
end;
$$ language plpgsql;

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

revoke execute on function public.request_refund_for_order(uuid, uuid)
  from public, anon, authenticated;
revoke execute on function public.finalize_refund_and_cancel_order(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.request_refund_for_order(uuid, uuid)
  to service_role;
grant execute on function public.finalize_refund_and_cancel_order(uuid, uuid, text, text)
  to service_role;

commit;
