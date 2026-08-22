-- Backend-only data access: Express uses service_role and owns API authorization.
-- RLS prevents direct PostgREST access from anon/authenticated clients.

begin;

alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payments enable row level security;
alter table public.rated enable row level security;
alter table public.chat_logs enable row level security;
alter table public.eval_cases enable row level security;
alter table public.eval_results enable row level security;
alter table public.admin_events enable row level security;
alter table public.cron_logs enable row level security;

revoke all on table public.users, public.categories, public.products,
  public.product_images, public.orders, public.order_items, public.payments,
  public.rated, public.chat_logs, public.eval_cases, public.eval_results,
  public.admin_events, public.cron_logs from anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'products_price_nonnegative') then
    alter table public.products add constraint products_price_nonnegative check (price >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'products_stock_nonnegative') then
    alter table public.products add constraint products_stock_nonnegative check (stock >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'order_items_price_nonnegative') then
    alter table public.order_items add constraint order_items_price_nonnegative check (price_at_order >= 0) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_amount_nonnegative') then
    alter table public.payments add constraint payments_amount_nonnegative check (amount >= 0) not valid;
  end if;
end $$;

alter function public.handle_new_user()
  set search_path = pg_catalog, public;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

commit;
