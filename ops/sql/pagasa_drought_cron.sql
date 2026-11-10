-- S29: daily PAGASA drought outlook (pagasa-drought). Same vault secret as pagasa-warnings.
-- timeout 150 s: one run can take about 130 s (100 s budget + 1 s gap + 25 s fetch + upsert + heartbeat).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'pagasa_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''pagasa_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule first.
select cron.unschedule(jobid) from cron.job where jobname = 'pagasa-drought';

-- 21:10 UTC = 5:10 AM Manila, once a day (PAGASA updates the outlook monthly; daily keeps every province fresh within two runs).
select cron.schedule(
  'pagasa-drought',
  '10 21 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/pagasa-drought',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pagasa-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pagasa_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $job$
);
