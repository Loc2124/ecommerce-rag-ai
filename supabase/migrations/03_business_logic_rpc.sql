-- ============================================================
-- 03_business_logic_rpc.sql — Hàm nghiệp vụ (chạy SAU File 1)
-- Dùng Postgres Function (RPC) vì backend dùng @supabase/supabase-js,
-- không dùng Prisma — toàn bộ logic transaction + FOR UPDATE phải nằm
-- trong 1 hàm SQL chạy nguyên khối ở server.
-- ============================================================

-- ---------- Tạo đơn: trừ kho NGAY cho cả COD và PayOS ----------
create or replace function create_order(
  p_user_id uuid,
  p_items jsonb, -- [{"product_id": "uuid...", "quantity": 2}, ...]
  p_payment_method payment_method,
  p_hold_minutes int default 15
) returns uuid as $$
declare
  v_order_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_qty int;
  v_price numeric(12,2);
  v_stock int;
  v_total numeric(12,2) := 0;
  v_status order_status;
  v_expires_at timestamptz;
begin
  for v_item in
    select value from jsonb_array_elements(p_items) order by (value->>'product_id')
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    select stock into v_stock
    from products
    where id = v_product_id and is_active = true
    for update;

    if v_stock is null then
      raise exception 'Sản phẩm % không tồn tại', v_product_id;
    end if;
    if v_stock < v_qty then
      raise exception 'Sản phẩm % không đủ tồn kho (còn %, cần %)', v_product_id, v_stock, v_qty;
    end if;
  end loop;

  if p_payment_method = 'cod' then
    v_status := 'confirmed';
    v_expires_at := null;
  else
    v_status := 'pending';
    v_expires_at := now() + (p_hold_minutes || ' minutes')::interval;
  end if;

  insert into orders (user_id, status, payment_method, total, expires_at)
  values (p_user_id, v_status, p_payment_method, 0, v_expires_at)
  returning id into v_order_id;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_qty := (v_item->>'quantity')::int;

    select price into v_price from products where id = v_product_id;

    update products set stock = stock - v_qty where id = v_product_id;

    insert into order_items (order_id, product_id, quantity, price_at_order)
    values (v_order_id, v_product_id, v_qty, v_price);

    v_total := v_total + v_price * v_qty;
  end loop;

  update orders set total = v_total where id = v_order_id;

  return v_order_id;
end;
$$ language plpgsql;

-- ---------- Xác nhận thanh toán PayOS (gọi từ webhook handler) ----------
create or replace function confirm_payos_payment(
  p_order_id uuid,
  p_transaction_id text,
  p_amount numeric
) returns text as $$
declare
  v_status order_status;
  v_total numeric(12,2);
begin
  if exists (select 1 from payments where transaction_id = p_transaction_id) then
    return 'already_processed';
  end if;

  select status, total into v_status, v_total from orders where id = p_order_id for update;

  if v_status is null then
    return 'order_not_found';
  end if;

  -- Webhook đến trễ, sau khi job đã hết hạn/hủy đơn -> tiền đã về thật
  -- nhưng kho có thể đã bán cho người khác -> cần admin hoàn tiền.
  if v_status in ('cancelled', 'expired') then
    if v_total = p_amount then
      update orders set status = 'requires_refund' where id = p_order_id;
      insert into payments (order_id, transaction_id, provider, status, amount, raw_webhook_payload)
      values (p_order_id, p_transaction_id, 'payos', 'success', p_amount,
              jsonb_build_object('note', 'paid_after_expiry_needs_refund'));
      return 'requires_refund';
    else
      insert into payments (order_id, transaction_id, provider, status, amount, raw_webhook_payload)
      values (p_order_id, p_transaction_id, 'payos', 'failed', p_amount,
              jsonb_build_object('reason', 'amount_mismatch_after_expiry'));
      return 'amount_mismatch';
    end if;
  end if;

  if v_status <> 'pending' then
    return 'order_not_pending';
  end if;

  if v_total <> p_amount then
    insert into payments (order_id, transaction_id, provider, status, amount, raw_webhook_payload)
    values (p_order_id, p_transaction_id, 'payos', 'failed', p_amount, jsonb_build_object('reason', 'amount_mismatch'));
    return 'amount_mismatch';
  end if;

  update orders set status = 'confirmed', expires_at = null where id = p_order_id;
  insert into payments (order_id, transaction_id, provider, status, amount, raw_webhook_payload)
  values (p_order_id, p_transaction_id, 'payos', 'success', p_amount, '{}'::jsonb);

  return 'confirmed';
end;
$$ language plpgsql;

-- ---------- Hoàn kho AN TOÀN (có khóa + guard trạng thái) ----------
create or replace function cancel_and_restock_order(
  p_order_id uuid,
  p_new_status order_status -- 'cancelled' (admin hủy) hoặc 'expired' (job tự động)
) returns text as $$
declare
  v_status order_status;
  v_item record;
begin
  select status into v_status from orders where id = p_order_id for update;

  if v_status is null then
    return 'order_not_found';
  end if;

  if v_status not in ('pending', 'confirmed') then
    return 'invalid_status_for_restock'; -- chặn hoàn kho lặp lại
  end if;

  for v_item in select product_id, quantity from order_items where order_id = p_order_id
  loop
    update products set stock = stock + v_item.quantity where id = v_item.product_id;
  end loop;

  update orders set status = p_new_status, expires_at = null where id = p_order_id;
  return p_new_status::text;
end;
$$ language plpgsql;

-- Wrapper cho admin hủy đơn đã confirmed (COD hoặc PayOS đã thanh toán)
create or replace function cancel_confirmed_order(p_order_id uuid) returns text as $$
begin
  return cancel_and_restock_order(p_order_id, 'cancelled');
end;
$$ language plpgsql;
