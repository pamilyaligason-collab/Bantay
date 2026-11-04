-- Schedule for the alerts-digest Edge Function (Phase 2 lane A): 06:45 Asia/Manila every day = 22:45 UTC the day before. WRITTEN ONLY: the owner applies it, after migration 0048.
-- The function reuses the alerts-ingest secret: it is deployed with --no-verify-jwt and checks the ALERTS_CRON_SECRET function secret in the x-alerts-secret header.
-- So the vault secret 'alerts_cron_secret' (stored for ops/sql/alerts_cron.sql) must already exist. The secret never appears in this file.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'alerts_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''alerts_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule if there is one.
select cron.unschedule(jobid) from cron.job where jobname = 'alerts-digest';

select cron.schedule(
  'alerts-digest',
  '45 22 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/alerts-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-alerts-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'alerts_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

-- Check the next morning:
--   select day, built_at, body->>'summary' from public.safety_digests order by day desc limit 3;
--   select status, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'alerts-digest') order by start_time desc limit 3;
-- Stop it:  select cron.unschedule('alerts-digest');
