-- 0041_rollcall (session 12, lane I, D-85/D-86): the storm roll call. "I'm safe" / "I need help" is saved for the whole family. WRITTEN ONLY: Lloyd applies it.
-- Needs 0001 (people, is_self, is_writer_of), 0002 (pin_try), 0007 (safety_alerts), 0012 (family_tasks), 0023 (is_family_member), 0030 (notify_family) and 0031 (sos_events_prune, the pg_net flush pattern). Safe to run twice.
-- Rules (fix round 2): the app NEVER writes the table. It calls rollcall_set(person, storm, status), which checks an active family member, self or writer carer,
-- a live storm signal in safety_alerts, a per-caller rate limit (ML-08) and a 30-minute need_help alert cooldown. The storm's 4 Do now tasks are made once, on the server.
-- Roll call is safety, not health: every active family member reads every row (ok / need_help only). The mood log stays private.
-- A check-in is never refused because the alert failed: the alert block swallows its own errors. Retention 30 days, inside sos_events_prune (ML-06).
begin;

create table if not exists public.rollcall (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  user_id uuid not null default auth.uid(),                    -- whoever tapped (set by rollcall_set)
  storm_ref text not null check (char_length(storm_ref) between 1 and 200),   -- safety_alerts.id of the live signal (checked by rollcall_set)
  status text not null check (status in ('ok', 'need_help')),
  at timestamptz not null default now(),
  help_alert_at timestamptz,                                   -- when the family was last alerted for this row (30-minute cooldown)
  unique (person_id, storm_ref)
);
create index if not exists rollcall_storm on public.rollcall (storm_ref);
create index if not exists rollcall_at on public.rollcall (at);

alter table public.rollcall enable row level security;
revoke all on public.rollcall from anon, authenticated;
grant select on public.rollcall to authenticated;       -- no insert / update / delete: rollcall_set is the only writer

drop policy if exists rollcall_read on public.rollcall;
create policy rollcall_read on public.rollcall for select to authenticated using (public.is_family_member());

-- Shared gate for both RPCs (not callable by an app role): rate limit, the storm must be a live safety signal, then the storm's 4 Do now tasks
-- (deterministic client_id, insert-only: a task the family ticked or deleted is never put back).
create or replace function public.storm_gate(p_ref text) returns void
  language plpgsql security definer set search_path = '' as
  $$ declare i int; titles text[] := array['Charge phones and power banks', 'Pack 7 days of medicines in the go-bag', 'Fill water containers', 'Check on a neighbour'];
     begin
       if public.pin_try(md5('rollcall:' || auth.uid()::text)::uuid, 30, interval '1 hour') > 30 then raise exception 'too many check-ins' using errcode = '53400'; end if;
       if p_ref is null or not exists (select 1 from public.safety_alerts where id = p_ref and kind in ('tcws', 'rainfall', 'thunderstorm', 'tsunami') and (expires_at is null or expires_at > now())) then
         raise exception 'no live storm signal' using errcode = '22023';
       end if;
       for i in 1 .. 4 loop
         insert into public.family_tasks (client_id, title, due, created_by)
         values ('storm:' || p_ref || ':' || i, titles[i], (now() at time zone 'Asia/Manila')::date, auth.uid())
         on conflict (client_id) do nothing;
       end loop;
     end $$;

-- The phone calls this once per storm so the Do now list is there before anyone taps a check-in.
create or replace function public.ensure_storm_tasks(p_storm_ref text) returns void
  language plpgsql security definer set search_path = '' as
  $$ begin
       if not public.is_family_member() then raise exception 'not allowed' using errcode = '42501'; end if;
       perform public.storm_gate(p_storm_ref);
     end $$;

-- The one writer. One row per person per storm; a need_help alerts the rest of the family at most once per 30 minutes (the alert ref is new each time; notify_family skips the person).
create or replace function public.rollcall_set(p_person uuid, p_storm_ref text, p_status text) returns void
  language plpgsql security definer set search_path = '' as
  $$ declare rid uuid; last_alert timestamptz; secret text;
     begin
       if not public.is_family_member() or not (public.is_self(p_person) or public.is_writer_of(p_person)) then raise exception 'not allowed' using errcode = '42501'; end if;
       if p_status is null or p_status not in ('ok', 'need_help') then raise exception 'bad status' using errcode = '23514'; end if;
       perform public.storm_gate(p_storm_ref);
       insert into public.rollcall as r (person_id, user_id, storm_ref, status, at) values (p_person, auth.uid(), p_storm_ref, p_status, now())
         on conflict (person_id, storm_ref) do update set user_id = excluded.user_id, status = excluded.status, at = excluded.at
         returning r.id, r.help_alert_at into rid, last_alert;
       if p_status = 'need_help' and (last_alert is null or last_alert < now() - interval '30 minutes') then
         begin
           update public.rollcall set help_alert_at = now() where id = rid;
           perform public.notify_family(p_person, 'rollcall', 'rollcall_help', rid::text || ':' || (extract(epoch from clock_timestamp()) * 1000000)::bigint::text, 'family');
           if to_regproc('net.http_post') is not null and to_regclass('vault.decrypted_secrets') is not null then
             execute 'select decrypted_secret from vault.decrypted_secrets where name = ''dose_watch_cron_secret''' into secret;
             if secret is not null then
               execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 30000)'
                 using 'https://wuakimpssycbtnmoexuc.supabase.co/functions/v1/dose-watch',
                       jsonb_build_object('Content-Type', 'application/json', 'x-dose-watch-secret', secret),
                       '{"mode":"flush"}'::jsonb;
             end if;
           end if;
         exception when others then
           raise warning 'rollcall alert: %', sqlerrm;
         end;
       end if;
     end $$;

-- 30-day retention (ML-06): the 0031 body (90-day sos_events), the roll call rows, and the storm tasks (soft-deleted so every phone drops them on its next pull).
create or replace function public.sos_events_prune() returns void
  language sql security definer set search_path = '' as
  $$ delete from public.sos_events where created_at < now() - interval '90 days';
     delete from public.rollcall where at < now() - interval '30 days';
     update public.family_tasks set deleted_at = now() where client_id like 'storm:%' and deleted_at is null and created_at < now() - interval '30 days' $$;

-- Full grants restated (ML-21).
revoke execute on function public.storm_gate(text), public.ensure_storm_tasks(text), public.rollcall_set(uuid, text, text), public.sos_events_prune() from public, anon, authenticated, service_role;
grant execute on function public.ensure_storm_tasks(text), public.rollcall_set(uuid, text, text) to authenticated;

-- Realtime (guarded: plain Postgres has no such publication)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rollcall') then
    alter publication supabase_realtime add table public.rollcall;
  end if;
end $$;

commit;
