-- Undo 0031_sos.sql. Safe to run twice. Deletes every SOS event and ack: export first if they matter.
-- Run BEFORE the 0030 down (the triggers call notify_family late-bound, so dropping 0030 first only makes them warn).
begin;
do $$ begin
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    execute $c$select cron.unschedule(jobid) from cron.job where jobname = 'sos-events-prune'$c$;
  end if;
end $$;
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['sos_acks', 'sos_events'] loop
      if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime drop table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
drop trigger if exists sos_events_cancel on public.sos_events;
drop trigger if exists sos_events_alert on public.sos_events;
drop trigger if exists sos_events_late on public.sos_events;
drop table if exists public.sos_acks;
drop table if exists public.sos_events;
drop function if exists public.sos_events_prune();
drop function if exists public.sos_events_cancel();
drop function if exists public.sos_events_alert();
drop function if exists public.sos_events_late();
commit;
