-- Undo 0068_watch_evergreen.sql. Safe to run twice. Removes the evergreen rows (the back catalogue; the next backfill refills it) and the column, so the daily purge keeps working with the older function too.
drop index if exists public.watch_videos_evergreen_shelf;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'watch_videos' and column_name = 'evergreen') then
    delete from public.watch_videos where evergreen;
  end if;
end $$;
alter table public.watch_videos drop column if exists evergreen;
