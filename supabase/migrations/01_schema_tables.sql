-- ============================================================
-- 01_schema_tables.sql — Cấu trúc bảng (chạy ĐẦU TIÊN)
-- Đồ án: TMĐT tích hợp RAG + Hybrid Search
-- Quy ước: mọi tên bảng dùng số nhiều (products, orders, ...)
-- ============================================================

-- ---------- RESET (TÙY CHỌN — chỉ dùng khi muốn xóa sạch làm lại) ----------
-- CẢNH BÁO: bỏ comment (--) các dòng dưới đây sẽ XÓA VĨNH VIỄN toàn bộ
-- dữ liệu. Không chạy trên môi trường có dữ liệu thật / đang demo.
--
-- drop table if exists eval_results, eval_cases, chat_logs, rated,
--   payments, order_items, orders, product_images, products, categories,
--   users cascade;
-- drop type if exists order_status, payment_method, payment_status,
--   user_role, eval_category cascade;

-- ---------- Extensions ----------
create extension if not exists vector;
create extension if not exists pg_cron;
create extension if not exists pgcrypto;

-- ---------- Enums ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('customer', 'admin');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'pending', 'confirmed', 'shipped', 'completed',
      'cancelled', 'expired', 'requires_refund'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_method') then
    create type payment_method as enum ('cod', 'payos');
  end if;
  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('pending', 'success', 'failed');
  end if;
  if not exists (select 1 from pg_type where typname = 'eval_category') then
    create type eval_category as enum ('exact_keyword', 'paraphrase', 'typo', 'complex');
  end if;
end $$;

-- ---------- NHÓM 1: Tài khoản ----------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  full_name text,
  role user_role not null default 'customer',
  created_at timestamptz not null default now()
);

-- ---------- NHÓM 2: Sản phẩm & danh mục ----------
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references categories(id) on delete set null,
  sku text unique,                      -- dùng để test điểm yếu của vector-only search
  name text not null,
  description text,
  attributes jsonb default '{}',        -- size, màu, chất liệu... linh hoạt theo loại sp
  price numeric(12,2) not null,
  stock int not null default 0,
  embedding vector(768),                -- sinh từ Gemini API (name + description)
  fts tsvector,                         -- phục vụ keyword search (ts_rank)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  url text not null,
  is_primary boolean not null default false,
  sort_order int not null default 0
);

-- ---------- NHÓM 3: Bán hàng & thanh toán ----------
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete restrict,
  status order_status not null default 'pending',
  payment_method payment_method not null default 'payos',
  total numeric(12,2) not null default 0,
  expires_at timestamptz,               -- chỉ dùng cho đơn PayOS (giữ chỗ 15 phút)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  quantity int not null check (quantity > 0),
  price_at_order numeric(12,2) not null  -- giá tại thời điểm mua, không lấy giá hiện tại
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  transaction_id text unique not null,   -- khóa idempotency
  provider text not null,                -- 'payos' | ...
  status payment_status not null default 'pending',
  amount numeric(12,2) not null,
  raw_webhook_payload jsonb,
  created_at timestamptz not null default now()
);

-- ---------- NHÓM 4: Tương tác ----------
create table if not exists rated (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- ---------- NHÓM 5: AI / Thực nghiệm (Chương 4) ----------
create table if not exists chat_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  session_id text not null,
  question text not null,
  question_embedding vector(768),       -- dùng để TRA CỨU cache (so sánh câu hỏi mới với câu cũ)
  answer text,
  used_rag boolean not null default true,
  search_method text,                   -- 'keyword' | 'vector' | 'hybrid' | null
  token_count int,
  latency_ms int,
  cache_hit boolean not null default false, -- CHỈ LÀ CỜ LOG, không phải nơi lưu cache
  created_at timestamptz not null default now()
);

create table if not exists eval_cases (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  expected_product_ids uuid[] not null default '{}',
  category eval_category not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists eval_results (
  id uuid primary key default gen_random_uuid(),
  eval_case_id uuid not null references eval_cases(id) on delete cascade,
  method text not null,                 -- 'no_rag' | 'rag' | 'keyword' | 'vector' | 'hybrid'
  alpha numeric(3,2),
  score_faithfulness numeric(3,2),
  score_relevance numeric(3,2),
  precision_at_5 numeric(4,3),
  recall_at_5 numeric(4,3),
  judge_type text,                      -- 'human' | 'llm'
  raw_answer text,
  created_at timestamptz not null default now()
);
