-- S30: nightly data integrity check (integrity-check). NOT APPLIED. Order: apply 0064, set the function secret INTEGRITY_CRON_SECRET (32+ characters),
-- deploy integrity-check with --no-verify-jwt, store the same secret in the vault as 'integrity_cron_secret', then run this file.
-- The first run is the backfill: it checks all history. Findings only; nothing is deleted or changed.
-- timeout 150 s: a full pass over about 12 000 rows is a few seconds; the 150 s covers growth and the heartbeat.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'integrity_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''integrity_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule first.
select cron.unschedule(jobid) from cron.job where jobname = 'integrity-check';

-- 19:30 UTC = 3:30 AM Manila, once a night (after the day's last records-extract and before the 06:45 safety digest).
select cron.schedule(
  'integrity-check',
  '30 19 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/integrity-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'integrity_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $job$
);
