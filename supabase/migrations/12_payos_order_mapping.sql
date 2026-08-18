-- Migration 12: Persist PayOS identifiers for webhook correlation

alter table orders
  add column if not exists payos_order_code bigint,
  add column if not exists payos_payment_link_id text;

create unique index if not exists idx_orders_payos_order_code
  on orders(payos_order_code)
  where payos_order_code is not null;