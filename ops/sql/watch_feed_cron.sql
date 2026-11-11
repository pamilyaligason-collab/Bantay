-- Schedule for the watch-feed Edge Function (S33): once a day at 05:00 Manila (21:00 UTC), reads the YouTube RSS feeds of the trusted channels into watch_videos. Needs 0067 and the deploy first.
-- Written, not applied. The secret never appears in this file. Before running it, store the same value you set as the WATCH_CRON_SECRET function secret (32+ characters):
--   select vault.create_secret('<paste the secret here, in the SQL editor only>', 'watch_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'watch_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''watch_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule first.
select cron.unschedule(jobid) from cron.job where jobname like 'watch-feed%';

select cron.schedule(
  'watch-feed',
  '0 21 * * *', -- 21:00 UTC = 05:00 Manila
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/watch-feed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-watch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'watch_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);

-- Check after a run:
--   select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname like 'watch-feed%' order by d.start_time desc limit 4;
--   select shelf, channel, left(title, 50), published_at from public.watch_videos order by published_at desc limit 20;
-- Stop it:  select cron.unschedule(jobid) from cron.job where jobname like 'watch-feed%';
