-- Restrict direct RPC access so clients cannot bypass the Express business layer.
-- The backend uses SUPABASE_SERVICE_ROLE_KEY for both public search and business RPCs.
-- The scheduled expiry functions are intentionally callable only by pg_cron/their owner.
begin;

revoke execute on function create_order(uuid, jsonb, payment_method, integer)
  from public, anon, authenticated;
revoke execute on function confirm_payos_payment(uuid, text, numeric)
  from public, anon, authenticated;
revoke execute on function cancel_and_restock_order(uuid, order_status)
  from public, anon, authenticated;
revoke execute on function cancel_confirmed_order(uuid)
  from public, anon, authenticated;
revoke execute on function match_products(text, vector, numeric, integer)
  from public, anon, authenticated;

-- expire_pending_payos_orders / run_expire_pending_payos_orders are invoked
-- only by pg_cron under the function owner's privileges (not via EXECUTE
-- grants). No role is granted EXECUTE here by design — the backend never
-- calls these directly; only the scheduled cron job does.
revoke execute on function expire_pending_payos_orders()
  from public, anon, authenticated;
revoke execute on function run_expire_pending_payos_orders()
  from public, anon, authenticated;

grant execute on function create_order(uuid, jsonb, payment_method, integer)
  to service_role;
grant execute on function confirm_payos_payment(uuid, text, numeric)
  to service_role;
grant execute on function cancel_and_restock_order(uuid, order_status)
  to service_role;
grant execute on function cancel_confirmed_order(uuid)
  to service_role;
grant execute on function match_products(text, vector, numeric, integer)
  to service_role;

commit;