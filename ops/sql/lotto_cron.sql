-- Schedule for the lotto-pcso Edge Function (S24, D-153): 21:20, 21:45, 22:30 and 07:00 Manila (13:20, 13:45, 14:30, 23:00 UTC), after the 9 PM draws, like the 953 Aragon app. Needs 0054 and the deploy first.
-- The secret never appears in this file. Before running it, store the same value you set as the LOTTO_CRON_SECRET function secret (32+ characters):
--   select vault.create_secret('<paste the secret here, in the SQL editor only>', 'lotto_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'lotto_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''lotto_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop old schedules first.
select cron.unschedule(jobid) from cron.job where jobname like 'lotto-pcso%';

select cron.schedule(
  'lotto-pcso-1',
  '20 13 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/lotto-pcso',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-lotto-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lotto_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);

select cron.schedule(
  'lotto-pcso-2',
  '45 13 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/lotto-pcso',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-lotto-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lotto_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);

select cron.schedule(
  'lotto-pcso-3',
  '30 14 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/lotto-pcso',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-lotto-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lotto_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);

select cron.schedule(
  'lotto-pcso-4',
  '0 23 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/lotto-pcso',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-lotto-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'lotto_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);

-- Check after a run:
--   select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname like 'lotto-pcso%' order by d.start_time desc limit 4;
--   select game, draw_date, combination from public.lotto_results order by draw_date desc, game limit 12;
-- Stop it:  select cron.unschedule(jobid) from cron.job where jobname like 'lotto-pcso%';
