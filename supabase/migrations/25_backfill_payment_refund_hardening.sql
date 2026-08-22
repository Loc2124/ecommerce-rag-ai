-- Idempotent follow-up for projects that already applied migrations 20 and 22.

begin;

alter table public.orders
  add column if not exists payment_link_claimed_at timestamptz;

create unique index if not exists idx_refund_transaction_id_unique
  on public.refund_requests(refund_transaction_id)
  where refund_transaction_id is not null;

commit;
