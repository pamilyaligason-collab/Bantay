-- 0041_rollcall (session 12, lane I, D-85/D-86): the storm roll call. "I'm safe" / "I need help" is saved for the whole family. WRITTEN ONLY: Lloyd applies it.
-- Needs 0001 (people, is_self, is_writer_of), 0023 (is_family_member), 0030 (notify_family) and 0031 (sos_events_prune, the pg_net flush pattern). Safe to run twice.
-- Rules (contracts.md, Rev 2): the app writes by direct REST upsert on (person_id, storm_ref), never the outbox. user_id is forced to auth.uid() by a trigger.
-- Roll call is safety, not health: every active family member reads every row (ok / need_help only). The mood log stays private.
-- A check-in is never refused: the alert trigger swallows its own errors. Retention 30 days, inside sos_events_prune (ML-06).
begin;

create table if not exists public.rollcall (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  user_id uuid not null default auth.uid(),                    -- forced by trigger: whoever tapped
  storm_ref text not null check (char_length(storm_ref) between 1 and 200),   -- safety_alerts.id of the live signal
  status text not null check (status in ('ok', 'need_help')),
  at timestamptz not null default now(),
  unique (person_id, storm_ref)
);
create index if not exists rollcall_storm on public.rollcall (storm_ref);
create index if not exists rollcall_at on public.rollcall (at);

alter table public.rollcall enable row level security;
revoke all on public.rollcall from anon, authenticated;
grant select, insert on public.rollcall to authenticated;
-- PostgREST's upsert names every payload column in ON CONFLICT DO UPDATE SET, so the two key columns need the grant; the trigger below pins them to the old values.
grant update (person_id, storm_ref, status, at) on public.rollcall to authenticated;

drop policy if exists rollcall_read on public.rollcall;
create policy rollcall_read on public.rollcall for select to authenticated using (public.is_family_member());
drop policy if exists rollcall_insert on public.rollcall;
create policy rollcall_insert on public.rollcall for insert to authenticated
  with check (public.is_self(person_id) or public.is_writer_of(person_id));
drop policy if exists rollcall_update on public.rollcall;
create policy rollcall_update on public.rollcall for update to authenticated
  using (public.is_self(person_id) or public.is_writer_of(person_id))
  with check (public.is_self(person_id) or public.is_writer_of(person_id));

-- BEFORE: whoever writes is the user_id (a client value is overridden); an update can never move a row to another person or storm.
create or replace function public.rollcall_stamp() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin
       if auth.uid() is not null then new.user_id := auth.uid(); end if;
       if tg_op = 'UPDATE' then
         new.person_id := old.person_id;
         new.storm_ref := old.storm_ref;
       end if;
       return new;
     end $$;

-- AFTER: a need_help tells the rest of the family once per row (ref = row id; notify_family skips the person themself). Never blocks the check-in.
create or replace function public.rollcall_alert() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ declare secret text;
     begin
       begin
         if new.status = 'need_help' and (tg_op = 'INSERT' or old.status is distinct from 'need_help') then
           perform public.notify_family(new.person_id, 'rollcall', 'rollcall_help', new.id::text, 'family');
           if to_regproc('net.http_post') is not null and to_regclass('vault.decrypted_secrets') is not null then
             execute 'select decrypted_secret from vault.decrypted_secrets where name = ''dose_watch_cron_secret''' into secret;
             if secret is not null then
               execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
                 using 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/dose-watch',
                       jsonb_build_object('Content-Type', 'application/json', 'x-dose-watch-secret', secret),
                       '{"mode":"flush"}'::jsonb;
             end if;
           end if;
         end if;
       exception when others then
         raise warning 'rollcall trigger: %', sqlerrm;
       end;
       return new;
     end $$;

-- 30-day retention (ML-06): the 0031 body (90-day sos_events) plus the roll call line.
create or replace function public.sos_events_prune() returns void
  language sql security definer set search_path = '' as
  $$ delete from public.sos_events where created_at < now() - interval '90 days';
     delete from public.rollcall where at < now() - interval '30 days' $$;

-- Full grants restated (ML-21): none of these is called by an app role.
revoke execute on function public.rollcall_stamp(), public.rollcall_alert(), public.sos_events_prune() from public, anon, authenticated, service_role;

drop trigger if exists rollcall_stamp on public.rollcall;
create trigger rollcall_stamp before insert or update on public.rollcall for each row execute function public.rollcall_stamp();
drop trigger if exists rollcall_alert on public.rollcall;
create trigger rollcall_alert after insert or update of status on public.rollcall for each row execute function public.rollcall_alert();

-- Realtime (guarded: plain Postgres has no such publication)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rollcall') then
    alter publication supabase_realtime add table public.rollcall;
  end if;
end $$;

commit;
