-- Schedule for the watch-feed back catalogue (S34): once a month, '30 21 1 * *' = 21:30 UTC on the 1st = 05:30 Manila on the 2nd, calls watch-feed with {"mode":"backfill"} (older videos of the trusted channels into watch_videos as evergreen).
-- Needs 0068, the watch-feed deploy, the YT_API_KEY function secret and the daily schedule's vault secret (ops/sql/watch_feed_cron.sql). Written, not applied. The secret never appears in this file.

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'watch_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''watch_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule first.
select cron.unschedule(jobid) from cron.job where jobname = 'watch-backfill';

select cron.schedule(
  'watch-backfill',
  '30 21 1 * *', -- 21:30 UTC on the 1st = 05:30 Manila on the 2nd
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/watch-feed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-watch-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'watch_cron_secret')
      ),
      body := '{"mode":"backfill"}'::jsonb,
      timeout_milliseconds := 150000
    );
  $job$
);

-- Check after a run:
--   select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname = 'watch-backfill' order by d.start_time desc limit 4;
--   select shelf, channel, left(title, 50), published_at from public.watch_videos where evergreen order by published_at desc limit 20;
-- Stop it:  select cron.unschedule(jobid) from cron.job where jobname = 'watch-backfill';
