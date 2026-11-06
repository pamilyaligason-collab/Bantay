-- Schedule for the world-news Edge Function (W6, D-135): every 6 hours. It reads public RSS feeds (no GDELT) and needs 0049 and 0051 first. WRITTEN ONLY: the owner applies it after 0049 and the deploy.
-- The secret never appears in this file. Before running it, store the same value you set as the WORLD_NEWS_CRON_SECRET function secret (32+ characters):
--   select vault.create_secret('<paste the secret here, in the SQL editor only>', 'world_news_cron_secret');
-- (to rotate: select vault.update_secret(id, '<new>') for that row, and set the function secret to match).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Fail loudly if the secret was not stored first: a schedule that sends an empty secret would only produce 401s.
do $$ begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'world_news_cron_secret') then
    raise exception 'store the secret first: select vault.create_secret(..., ''world_news_cron_secret'')';
  end if;
end $$;

-- Re-runnable: drop the old schedule if there is one.
select cron.unschedule(jobid) from cron.job where jobname = 'world-news';

select cron.schedule(
  'world-news',
  '10 */6 * * *',
  $job$
    select net.http_post(
      url := 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/world-news',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-world-news-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'world_news_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 90000
    );
  $job$
);

-- Check after the first run (the run takes about 30 seconds: ten RSS feeds 1.5 s apart):
--   select status, start_time from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'world-news') order by start_time desc limit 3;
--   select id, source_domain, seen_at from public.world_news order by seen_at desc limit 10;
--   select topic, source, published_at from public.news_items where id like 'rss-%' order by published_at desc limit 10;
-- Stop it:  select cron.unschedule('world-news');
