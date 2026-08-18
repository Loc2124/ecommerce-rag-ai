-- ============================================================
-- 07_hybrid_search_rpc.sql — Hybrid Search (chạy SAU File 1 và File 2)
-- Cần bảng products có cột embedding + fts (File 1) và trigger tự động
-- cập nhật fts (File 2) đã tồn tại trước khi hàm này hoạt động đúng.
--
-- match_products là "trái tim" của tìm kiếm ngữ nghĩa: BẮT BUỘC dùng
-- RPC vì Supabase JS client (PostgREST) không có cú pháp ORDER BY
-- embedding <-> $1, cũng không tính được điểm kết hợp (keyword + vector)
-- ngay trong 1 câu truy vấn — nếu không có hàm này, backend phải kéo dữ
-- liệu thô về rồi tự tính ở Node.js, chậm hơn nhiều so với tính trong DB.
-- ============================================================

-- Bước 1: chạy song song keyword search (ts_rank) và vector search (<->)
-- Bước 2: chuẩn hóa min-max về [0,1] — LƯU Ý phải đảo chiều vector vì
--         <-> là khoảng cách (càng NHỎ càng giống), còn ts_rank càng
--         LỚN càng liên quan; nếu không đảo chiều, công thức sẽ cộng
--         điểm sai hướng (mục 3.3 SRS đã cảnh báo lỗi này)
-- Bước 3: kết hợp theo trọng số α (tham số hóa để thử 0.3/0.5/0.7 ở
--         Thực nghiệm 2, chương 4)
-- Luôn lọc is_active = true (theo yêu cầu FR-09/UC-04)

create or replace function match_products(
  p_query_text text,
  p_query_embedding vector(3072), -- gemini-embedding-001 mặc định 3072 chiều (text-embedding-004/768 đã ngừng hỗ trợ từ 1/2026)
  p_alpha numeric default 0.5,   -- trọng số vector; (1 - p_alpha) cho keyword
  p_match_count int default 5
) returns table (
  id uuid,
  name text,
  price numeric(12,2),
  keyword_score numeric,
  vector_score numeric,
  combined_score numeric
) as $$
begin
  return query
  with kw as (
    select
      p.id,
      ts_rank(p.fts, websearch_to_tsquery('simple', p_query_text)) as raw_score
    from products p
    where p.is_active = true
      and p.fts @@ websearch_to_tsquery('simple', p_query_text)
  ),
  kw_norm as (
    select
      id,
      case
        when max(raw_score) over () = min(raw_score) over () then 1
        else (raw_score - min(raw_score) over ())
             / (max(raw_score) over () - min(raw_score) over ())
      end as score
    from kw
  ),
  -- Flat search (không HNSW, đúng quyết định đã chốt): lấy dư ứng viên
  -- trước khi chuẩn hóa, để không phải chuẩn hóa trên toàn bộ bảng.
  -- Dùng <=> (cosine distance) thay vì <-> (Euclidean): cosine tính cả
  -- hướng lẫn độ lớn ngay trong công thức nên không phụ thuộc việc
  -- vector đã được chuẩn hóa (normalize) hay chưa — an toàn hơn cho
  -- embedding từ gemini-embedding-001.
  vs as (
    select p.id, (p.embedding <=> p_query_embedding) as raw_distance
    from products p
    where p.is_active = true and p.embedding is not null
    order by p.embedding <=> p_query_embedding
    limit greatest(p_match_count * 4, 20)
  ),
  vs_norm as (
    select
      id,
      case
        when max(raw_distance) over () = min(raw_distance) over () then 1
        else 1 - (raw_distance - min(raw_distance) over ())
                 / (max(raw_distance) over () - min(raw_distance) over ())
      end as score -- đảo chiều: khoảng cách nhỏ nhất -> điểm cao nhất
    from vs
  )
  select
    p.id,
    p.name,
    p.price,
    coalesce(k.score, 0)::numeric as keyword_score,
    coalesce(v.score, 0)::numeric as vector_score,
    (p_alpha * coalesce(v.score, 0) + (1 - p_alpha) * coalesce(k.score, 0))::numeric as combined_score
  from products p
  left join kw_norm k on k.id = p.id
  left join vs_norm v on v.id = p.id
  where p.is_active = true and (k.id is not null or v.id is not null)
  order by combined_score desc
  limit p_match_count;
end;
$$ language plpgsql;

-- ============================================================
-- GHI CHÚ GỌI TỪ BACKEND (Node.js + @supabase/supabase-js)
-- ============================================================
-- const { data, error } = await supabase.rpc('match_products', {
--   p_query_text: 'áo khoác giữ ấm mùa đông',
--   p_query_embedding: embeddingArray, // mảng 768 số, lấy từ Gemini API
--   p_alpha: 0.5,        // đổi giá trị này khi chạy Thực nghiệm 2
--   p_match_count: 5
-- });
-- data trả về đã sắp xếp sẵn theo combined_score giảm dần — dùng thẳng
-- cho cả UC-04 (tìm kiếm) và UC-05 (lấy top-k context cho Chatbot RAG).