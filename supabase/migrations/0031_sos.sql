-- SOS events (session 10, lane S2, D-78): the elder's SOS is saved for the family, who see it in Bantay. WRITTEN ONLY: Lloyd applies it.
-- Needs 0001 (people, is_self, is_writer_of), 0002 (is_admin) and 0023 (is_family_member). notify_family comes from 0030 (S1) and is LATE-BOUND:
-- apply 0030 first and drop it last. If notify_family is missing or raises, the SOS write still commits (the triggers swallow their own errors).
-- Vault secret `dose_watch_cron_secret` must exist before this is applied (the flush call reads it); with no pg_net or no secret the flush is skipped.
--
-- Rules (contracts.md)
-- * The row id is made by the phone (the outbox has no client_id for it), so a retry is idempotent (on_conflict=id, ignore-duplicates).
-- * An SOS is NEVER refused: no count in the insert policy. The throttle lives in the AFTER trigger and only skips the fan-out (more than 3 rows
--   from one user in 10 minutes), never the write. Cancel after any number of events works.
-- * `late` is decided here, never by the phone: sent_at - at > 30 minutes. A null sent_at or an `at` in the future counts as live (fail open).
-- * Readers: any active family member (is_family_member) and the row's own user. Writer: the elder, or a writer carer of that person.
-- * Retention 90 days (sos_events_prune, daily). Acks cascade with their event.
-- Safe to run twice.
begin;

create table if not exists public.sos_events (
  id uuid primary key,                                                   -- client-supplied
  person_id uuid not null references public.people (id),
  user_id uuid not null default auth.uid(),
  at timestamptz not null,                                               -- end of the hold, phone clock
  sent_at timestamptz,                                                   -- outbox send time, same phone clock
  lat double precision,
  lon double precision,
  gps boolean,
  late boolean not null default false,
  call_to text check (call_to in ('family', '911', 'none')),
  sms_opened boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sos_events_user_recent on public.sos_events (user_id, created_at desc);
create index if not exists sos_events_created on public.sos_events (created_at);

create table if not exists public.sos_acks (
  event_id uuid not null references public.sos_events (id) on delete cascade,
  user_id uuid not null default auth.uid(),
  seen_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.sos_events enable row level security;
alter table public.sos_acks enable row level security;
revoke all on public.sos_events, public.sos_acks from anon, authenticated;
grant select, insert on public.sos_events to authenticated;
grant update (sms_opened, call_to, cancelled_at) on public.sos_events to authenticated;  -- nothing else changes after the hold
grant select, insert on public.sos_acks to authenticated;

drop policy if exists sos_events_insert on public.sos_events;
create policy sos_events_insert on public.sos_events for insert to authenticated
  with check (user_id = auth.uid() and (public.is_self(person_id) or public.is_writer_of(person_id)));  -- no count: an SOS is never refused
drop policy if exists sos_events_read on public.sos_events;
create policy sos_events_read on public.sos_events for select to authenticated
  using (user_id = auth.uid() or public.is_family_member());
drop policy if exists sos_events_update on public.sos_events;
create policy sos_events_update on public.sos_events for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sos_acks_insert on public.sos_acks;
create policy sos_acks_insert on public.sos_acks for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.sos_events e where e.id = event_id));  -- only for an event one can see
drop policy if exists sos_acks_read on public.sos_acks;
create policy sos_acks_read on public.sos_acks for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.sos_events e where e.id = event_id));

-- ---------- triggers (every body swallows its own error: an alert failure must never block the SOS write) ----------
create or replace function public.sos_events_late() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin
       begin
         new.late := coalesce(coalesce(new.sent_at, new.at) - new.at > interval '30 minutes', false);  -- overrides any client value
       exception when others then
         raise warning 'sos trigger: %', sqlerrm;
         new.late := false;
       end;
       return new;
     end $$;

create or replace function public.sos_events_alert() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ declare secret text;
     begin
       begin
         -- throttle the fan-out, never the write: the 4th SOS in 10 minutes is stored and tells nobody new
         if (select count(*) from public.sos_events where user_id = new.user_id and created_at > now() - interval '10 minutes') > 3 then
           return new;
         end if;
         perform public.notify_family(new.person_id, 'sos', case when new.late then 'sos_late' else 'family_sos' end, new.id::text, 'family');
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
         raise warning 'sos trigger: %', sqlerrm;
       end;
       return new;
     end $$;

create or replace function public.sos_events_cancel() returns trigger
  language plpgsql security definer set search_path = '' as
  $$ begin
       begin
         if old.cancelled_at is null and new.cancelled_at is not null then
           perform public.notify_family(new.person_id, 'sos_cancel', 'sos_cancel', new.id::text || ':cancel', 'family');  -- once, by the ref
         end if;
       exception when others then
         raise warning 'sos trigger: %', sqlerrm;
       end;
       return new;
     end $$;

-- 90-day retention (ML-06): acks go with their event
create or replace function public.sos_events_prune() returns void
  language sql security definer set search_path = '' as
  $$ delete from public.sos_events where created_at < now() - interval '90 days' $$;

-- Full grants restated (ML-21): trigger functions and the prune job are never called by an app role.
revoke execute on function public.sos_events_late(), public.sos_events_alert(), public.sos_events_cancel(), public.sos_events_prune()
  from public, anon, authenticated, service_role;

drop trigger if exists sos_events_late on public.sos_events;
create trigger sos_events_late before insert on public.sos_events for each row execute function public.sos_events_late();
drop trigger if exists sos_events_alert on public.sos_events;
create trigger sos_events_alert after insert on public.sos_events for each row execute function public.sos_events_alert();
drop trigger if exists sos_events_cancel on public.sos_events;
create trigger sos_events_cancel after update of cancelled_at on public.sos_events for each row
  when (old.cancelled_at is null and new.cancelled_at is not null) execute function public.sos_events_cancel();

-- ---------- Realtime (guarded: WSL and plain Postgres have no such publication) ----------
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['sos_events', 'sos_acks'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- daily prune at 03:20 Manila (guarded: only when pg_cron exists) ----------
do $$ begin
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    execute $c$select cron.unschedule(jobid) from cron.job where jobname = 'sos-events-prune'$c$;
    execute $c$select cron.schedule('sos-events-prune', '20 19 * * *', 'select public.sos_events_prune()')$c$;
  end if;
end $$;

commit;
