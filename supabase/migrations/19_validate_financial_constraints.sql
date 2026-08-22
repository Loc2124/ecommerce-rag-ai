-- Validate financial constraints after cleaning any legacy invalid rows.
-- This migration intentionally fails instead of silently accepting bad data.

begin;

do $$
begin
  if exists (select 1 from public.products where price < 0 or stock < 0) then
    raise exception 'Cannot validate products constraints: negative price or stock exists';
  end if;
  if exists (select 1 from public.order_items where price_at_order < 0) then
    raise exception 'Cannot validate order_items constraint: negative price exists';
  end if;
  if exists (select 1 from public.payments where amount < 0) then
    raise exception 'Cannot validate payments constraint: negative amount exists';
  end if;
end $$;

alter table public.products validate constraint products_price_nonnegative;
alter table public.products validate constraint products_stock_nonnegative;
alter table public.order_items validate constraint order_items_price_nonnegative;
alter table public.payments validate constraint payments_amount_nonnegative;

commit;
