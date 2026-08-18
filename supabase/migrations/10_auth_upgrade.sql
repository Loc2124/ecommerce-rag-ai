-- ============================================================
-- Migration 10: auth_upgrade.sql
-- Mục tiêu: chuyển bảng public.users sang mô hình Supabase Auth
-- và loại bỏ email/password_hash do app tự quản lý.
-- ============================================================

BEGIN;

-- 1) Xóa các cột không còn cần thiết nếu đang dùng auth của Supabase
ALTER TABLE public.users
  DROP COLUMN IF EXISTS email,
  DROP COLUMN IF EXISTS password_hash;

-- 2) Đảm bảo khóa chính và khóa ngoại đúng với auth.users
-- Nếu cột id đã là PK thì giữ nguyên, nếu chưa thì thêm.
ALTER TABLE public.users
  ALTER COLUMN id SET NOT NULL;

DO $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_id_fkey'
  ) then
    alter table public.users
      add constraint users_id_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- 3) Trigger tự tạo profile khi user đăng ký qua Supabase Auth
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.users (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function handle_new_user();

COMMIT;
