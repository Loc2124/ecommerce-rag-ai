-- Backfill data that may predate the embedding status columns.
update products
set embedding_status = 'pending'
where embedding_status is null;

alter table products
  alter column embedding_status set default 'pending';

-- Keep cron_logs in sync with the pg_cron job used by admin analytics.
create or replace function run_expire_pending_payos_orders() returns void as $$
declare
  started_at timestamptz := clock_timestamp();
  affected_rows int := 0;
begin
  affected_rows := expire_pending_payos_orders();

  insert into cron_logs (
    job_name,
    status,
    duration_ms,
    rows_affected,
    metadata
  )
  values (
    'expire_pending_payos_orders',
    'success',
    extract(milliseconds from clock_timestamp() - started_at)::int,
    affected_rows,
    '{}'::jsonb
  );
exception when others then
  insert into cron_logs (
    job_name,
    status,
    duration_ms,
    error_message,
    metadata
  )
  values (
    'expire_pending_payos_orders',
    'failed',
    extract(milliseconds from clock_timestamp() - started_at)::int,
    sqlerrm,
    '{}'::jsonb
  );
  raise;
end;
$$ language plpgsql;

select cron.unschedule('expire-pending-payos-orders')
where exists (
  select 1 from cron.job where jobname = 'expire-pending-payos-orders'
);

select cron.schedule(
  'expire-pending-payos-orders',
  '*/5 * * * *',
  $$select run_expire_pending_payos_orders();$$
);