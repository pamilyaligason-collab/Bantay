-- Schedule for the alerts-ingest Edge Function (D-25): every 10 minutes. WRITTEN ONLY: Lloyd applies it (see docs/ALERTS.md).
-- The secret never appears in this file. Before running it, store the same value you set as the ALERTS_CRON_SECRET function secret:
--   select vault.create_secret('<paste the secret here, in the SQL editor only>', 'alerts_cron_secret');
-- (to rotate: select vault.update_secret(id, '<new>') for that row, and set the function secret to match).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Fail loudly if the secret was not stored first: a schedule that sends an empty secret would only produce 401s.
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'alerts_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''alerts_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule if there is one.
select cron.unschedule(jobid) from cron.job where jobname = 'alerts-ingest';

select cron.schedule(
  'alerts-ingest',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/alerts-ingest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-alerts-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

-- Check after a few minutes:
--   select status, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'alerts-ingest') order by start_time desc limit 3;
--   select id, source, stale, fetched_at from public.safety_alerts order by fetched_at desc limit 10;
-- Stop it:  select cron.unschedule('alerts-ingest');
