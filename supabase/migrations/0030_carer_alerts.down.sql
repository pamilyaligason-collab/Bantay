-- Undo 0030_carer_alerts.sql. Safe to run twice. Run it AFTER the 0031 and 0035 downs (their triggers call notify_family).
-- Deletes every alert row. documents.printed_name is KEPT: S11 stores the name printed on each paper there.
do $$ begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'carer_alerts') then
    alter publication supabase_realtime drop table public.carer_alerts;
  end if;
end $$;
-- dose_watch_prune back to its 0018 body
create or replace function public.dose_watch_prune() returns integer
  language plpgsql security definer set search_path = '' as
  $$ declare n int; begin
       delete from public.dose_watch_sent where sent_at < now() - interval '7 days';
       get diagnostics n = row_count;
       return n;
     end $$;
revoke execute on function public.dose_watch_prune() from public, anon, authenticated;
grant execute on function public.dose_watch_prune() to service_role;
drop function if exists public.raise_mood_alert(uuid);
drop function if exists public.notify_family(uuid, text, text, text, text);
drop table if exists public.carer_alerts;
