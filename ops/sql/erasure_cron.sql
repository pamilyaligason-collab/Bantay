-- Schedule for the erase Edge Function (session 10 phase 2, lane S6b): daily 03:10 Manila (19:10 UTC). WRITTEN ONLY: Lloyd applies it AFTER migration 0034.
-- Deploy with --no-verify-jwt; the secret is the gate. Function secret: ERASE_CRON_SECRET (32+ chars). Redeploy `erase` whenever the secret changes (ML-29).
-- Store the same secret in vault first (SQL editor only):  select vault.create_secret('<secret>', 'erase_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'erase_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''erase_cron_secret'')';
  end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'erasure';
select cron.schedule(
  'erasure',
  '10 19 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/erase',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-erase-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'erase_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
-- Check:  select status, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'erasure') order by start_time desc limit 3;
-- Stop:   select cron.unschedule('erasure');
