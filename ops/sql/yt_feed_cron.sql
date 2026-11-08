-- Schedule for the yt-feed Edge Function (S25, D-155/D-159): every 30 minutes, reads the YouTube RSS feeds of four news channels into news_videos. Needs 0055 and the deploy first.
-- The secret never appears in this file. Before running it, store the same value you set as the YT_FEED_CRON_SECRET function secret (32+ characters):
--   select vault.create_secret('<paste the secret here, in the SQL editor only>', 'yt_feed_cron_secret');

create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'yt_feed_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''yt_feed_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule first.
select cron.unschedule(jobid) from cron.job where jobname like 'yt-feed%';

select cron.schedule(
  'yt-feed',
  '*/30 * * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/yt-feed',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-yt-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'yt_feed_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$
);

-- Check after a run:
--   select j.jobname, d.status, d.start_time from cron.job_run_details d join cron.job j using (jobid) where j.jobname like 'yt-feed%' order by d.start_time desc limit 4;
--   select channel, left(title, 50), published_at from public.news_videos order by published_at desc limit 12;
-- Stop it:  select cron.unschedule(jobid) from cron.job where jobname like 'yt-feed%';
