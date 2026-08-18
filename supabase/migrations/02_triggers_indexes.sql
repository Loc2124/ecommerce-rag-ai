-- ============================================================
-- 02_triggers_indexes.sql — Tìm kiếm & hiệu năng (chạy SAU File 1)
-- ============================================================

-- ---------- Trigger tự động cập nhật cột fts ----------
create or replace function products_fts_update() returns trigger as $$
begin
  new.fts := to_tsvector('simple', coalesce(new.name, '') || ' ' || coalesce(new.description, ''));
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_products_fts on products;
create trigger trg_products_fts
before insert or update on products
for each row execute function products_fts_update();

-- ---------- Index ----------
create index if not exists idx_products_fts on products using gin(fts);
create index if not exists idx_products_category on products(category_id);

-- LƯU Ý QUAN TRỌNG: KHÔNG tạo index HNSW/IVFFlat cho cột embedding ở
-- giai đoạn này. Ở quy mô 300-500 sản phẩm, hệ thống dùng Flat Search
-- (so sánh tuần tự, không có index ANN) để đảm bảo độ chính xác truy
-- xuất TUYỆT ĐỐI — phục vụ đúng mục đích đo Precision/Recall ở chương 4
-- (xem mục 2.2 SRS). Việc thêm HNSW/IVFFlat được xếp vào Hướng phát
-- triển (chương 5), chỉ cần thiết khi mở rộng lên hàng trăm nghìn sản
-- phẩm — thêm bây giờ sẽ biến kết quả tìm kiếm thành xấp xỉ, làm sai
-- lệch số liệu thực nghiệm đã thiết kế.

create index if not exists idx_product_images_products on product_images(product_id);
create index if not exists idx_orders_user on orders(user_id);
create index if not exists idx_order_items_order on order_items(order_id);
create index if not exists idx_payments_order on payments(order_id);
create index if not exists idx_rated_products on rated(product_id);
create index if not exists idx_chat_logs_session on chat_logs(session_id);

-- Không tạo index HNSW cho question_embedding cùng lý do đã nêu ở trên
-- (bảng chat_logs nhỏ, quy mô đồ án, Flat search đủ nhanh). Cách tra
-- cứu cache: SELECT answer FROM chat_logs WHERE used_rag = true AND
-- answer IS NOT NULL ORDER BY question_embedding <-> :new_embedding
-- LIMIT 1 -- nếu khoảng cách dưới ngưỡng, coi là cache hit, trả lời
-- luôn thay vì gọi lại Gemini API (đánh dấu cache_hit = true khi ghi
-- log lượt này).
create index if not exists idx_eval_results_case on eval_results(eval_case_id);
