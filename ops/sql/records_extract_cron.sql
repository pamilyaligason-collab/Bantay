-- Schedule for the records-extract Edge Function sweep (lane L6): every 10 minutes. WRITTEN ONLY: Lloyd applies it.
-- The sweep reads phone scans the app uploaded but never announced (no signal after the upload), up to 3 per run.
-- Deploy with --no-verify-jwt; the secret is the gate. Set the function secrets: RECORDS_EXTRACT_CRON_SECRET (32+ chars),
-- OPENROUTER_API_KEY, ALLOWED_ORIGIN (see supabase/functions/records-extract/README.md).
-- Store the same secret in vault first (SQL editor only):  select vault.create_secret('<secret>', 'records_extract_cron_secret');
create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'records_extract_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''records_extract_cron_secret'')';
  end if;
end $$;
select cron.unschedule(jobid) from cron.job where jobname = 'records-extract';
select cron.schedule(
  'records-extract',
  '*/10 * * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/records-extract',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-records-extract-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'records_extract_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
-- Check:  select status, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'records-extract') order by start_time desc limit 3;
--         select ingest_status, ingest_error, count(*) from public.source_files where storage_path is not null group by 1, 2;
-- Stop:   select cron.unschedule('records-extract');
