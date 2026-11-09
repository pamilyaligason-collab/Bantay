-- da-prices daily at 10:00 Asia/Manila (02:00 UTC). Run after vault secret 'da_cron_secret' exists. Re-runnable.
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'da_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''da_cron_secret'')';
  end if;
end $$;

select cron.unschedule(jobid) from cron.job where jobname = 'da-prices';

select cron.schedule(
  'da-prices',
  '0 2 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/da-prices',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-da-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'da_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
