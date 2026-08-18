-- ============================================================
-- 04_automation_cron.sql — Tự động hóa (chạy SAU File 1 và File 3,
-- vì cần bảng orders/products và hàm cancel_and_restock_order đã có)
-- ============================================================

create or replace function expire_pending_payos_orders() returns int as $$
declare
  v_order record;
  v_count int := 0;
begin
  for v_order in
    select o.id from orders o
    where o.payment_method = 'payos'
      and o.status = 'pending'
      and o.expires_at is not null
      and o.expires_at < now()
      and not exists (
        select 1 from payments p where p.order_id = o.id and p.status = 'failed'
      ) -- loại trừ đơn đang chờ admin đối soát thủ công (sai lệch số tiền)
    for update of o skip locked
  loop
    perform cancel_and_restock_order(v_order.id, 'expired');
    v_count := v_count + 1;
  end loop;
  return v_count; -- số đơn đã dọn, hữu ích để log/giám sát
end;
$$ language plpgsql;

-- Lên lịch chạy mỗi 5 phút (pg_cron có sẵn trên mọi gói Supabase, kể cả
-- free). cron.schedule tự upsert theo jobname nên chạy lại file này
-- nhiều lần không tạo job trùng.
select cron.schedule(
  'expire-pending-payos-orders',
  '*/5 * * * *',
  $$select expire_pending_payos_orders();$$
);

-- Theo dõi lịch sử chạy job:
-- select * from cron.job_run_details order by start_time desc limit 20;
