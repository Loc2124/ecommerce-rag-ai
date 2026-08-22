-- Prevent concurrent payment-link creation for the same pending order.

begin;

alter table public.orders
  add column if not exists payment_link_state text
    check (payment_link_state in ('creating', 'ready'));
alter table public.orders
  add column if not exists payment_link_claimed_at timestamptz;

commit;
