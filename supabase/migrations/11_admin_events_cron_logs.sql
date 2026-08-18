-- Migration 11: Create admin_events and cron_logs tables
-- Purpose: Event logging for admin actions and cron job status tracking

-- Admin events table
create table if not exists admin_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,                  -- 'update_order_status', 'update_product', etc.
  resource_type text not null,           -- 'order', 'product', 'user', etc.
  resource_id uuid not null,             -- reference to the affected resource
  details jsonb default '{}',            -- action-specific metadata
  created_at timestamptz not null default now()
);

create index idx_admin_events_user_id on admin_events(user_id);
create index idx_admin_events_created_at on admin_events(created_at desc);
create index idx_admin_events_resource on admin_events(resource_type, resource_id);

-- Cron job logs table
create table if not exists cron_logs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,                -- e.g., 'expire_pending_payos_orders'
  status text not null,                  -- 'success' | 'failed'
  duration_ms int,                       -- execution time in milliseconds
  error_message text,                    -- error details if failed
  rows_affected int default 0,           -- number of records processed
  metadata jsonb default '{}',           -- additional context
  created_at timestamptz not null default now()
);

create index idx_cron_logs_job_name on cron_logs(job_name);
create index idx_cron_logs_created_at on cron_logs(created_at desc);

-- Add embedding_status column to products if not exists
alter table products add column if not exists embedding_status text default 'pending';
alter table products add column if not exists embedding_error text;
alter table products add column if not exists embedding_updated_at timestamptz;

create index idx_products_embedding_status on products(embedding_status);
