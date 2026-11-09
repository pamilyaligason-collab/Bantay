create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'pagasa_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''pagasa_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule first.
select cron.unschedule(jobid) from cron.job where jobname = 'pagasa-warnings';

select cron.schedule(
  'pagasa-warnings',
  '*/30 * * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/pagasa-warnings',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-pagasa-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pagasa_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);
