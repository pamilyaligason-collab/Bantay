-- Schedule for the dose-watch Edge Function (lane M7b): every 15 minutes. WRITTEN ONLY: Lloyd applies it.
-- Deploy with --no-verify-jwt; the secret is the gate. Set the function secrets: DOSE_WATCH_CRON_SECRET (32+ chars),
-- VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (same values as broadcast).
-- Store the same secret in vault first (SQL editor only):  select vault.create_secret('<secret>', 'dose_watch_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'dose_watch_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''dose_watch_cron_secret'')';
  end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'dose-watch';
select cron.schedule(
  'dose-watch',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/dose-watch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-dose-watch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dose_watch_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
-- Check:  select status, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'dose-watch') order by start_time desc limit 3;
-- Stop:   select cron.unschedule('dose-watch');
