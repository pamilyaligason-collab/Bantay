-- Phone health (session 10, lane S3, D-78): one row per user that says whether this phone will ring its medicine alarms on time. Written only; Lloyd applies it.
-- Needs 0001 (people, carers) and 0002 (is_admin). Contract: docs/session-10/contracts.md, table public.phone_health.
--
-- Rules
-- * The owner writes their own row through the outbox (upsert on user_id). A linked carer (any row in carers for that person) and an admin read it. Anon: nothing. No delete over REST.
-- * Unknown is null, never false (B-5): alarms_ok is null on web and on Android shells below 2.3.0 ("old app"); notif_ok, exact_ok, battery_ok, call_ok are null when the phone could not answer.
-- * last_open_at and updated_at are stamped by the server on every write, so a wrong phone clock cannot hide a phone from the 48 h "not opened" sweep (dose-watch, S1).
-- * No health values, names or coordinates: only the switches, the phone maker (oem, short lower-case word), the app version and counts (B-7).
-- * One row per user, so no per-user log grows (ML-06); the row is deleted with the account (on delete cascade).
-- Safe to run twice.
begin;

create table if not exists public.phone_health (
  user_id uuid primary key references auth.users (id) on delete cascade,
  platform text check (platform in ('android', 'web')),
  app_version text check (app_version is null or char_length(app_version) <= 20),
  alarms_ok boolean,
  notif_ok boolean,
  exact_ok boolean,
  battery_ok boolean,
  call_ok boolean,
  oem text check (oem is null or char_length(oem) <= 32),
  last_open_at timestamptz,
  alarms_checked_at timestamptz,
  alarms_set integer check (alarms_set is null or alarms_set between 0 and 1000),
  alarms_rearmed integer check (alarms_rearmed is null or alarms_rearmed between 0 and 1000),
  updated_at timestamptz
);
alter table public.phone_health add column if not exists call_ok boolean; -- a database that has the S3 table without it (never in production) still gets it

-- server clock wins
create or replace function public.phone_health_stamp() returns trigger
  language plpgsql set search_path = '' as
  $$ begin new.last_open_at := now(); new.updated_at := now(); return new; end $$;
revoke execute on function public.phone_health_stamp() from public, anon, authenticated;
drop trigger if exists phone_health_stamp on public.phone_health;
create trigger phone_health_stamp before insert or update on public.phone_health for each row execute function public.phone_health_stamp();

-- carers of the person who owns this phone; security definer with an empty search_path so the policy cannot recurse through the RLS of people and carers
create or replace function public.phone_health_carer(p_user uuid) returns boolean
  language sql stable security definer set search_path = '' as
  $$ select exists (select 1 from public.people p join public.carers c on c.person_id = p.id
                    where p.auth_user_id = p_user and c.carer_id = auth.uid()) $$;
revoke execute on function public.phone_health_carer(uuid) from public, anon, authenticated;
grant execute on function public.phone_health_carer(uuid) to authenticated;

alter table public.phone_health enable row level security;
revoke all on public.phone_health from anon, authenticated;
grant select, insert, update on public.phone_health to authenticated; -- no delete over REST
grant select on public.phone_health to service_role; -- the dose-watch phone-health sweep (S1) reads every row; stated here because a rehearsal database has no default privileges (ML-21)

drop policy if exists phone_health_read on public.phone_health;
create policy phone_health_read on public.phone_health for select to authenticated
  using (user_id = auth.uid() or public.phone_health_carer(user_id) or public.is_admin());
drop policy if exists phone_health_insert on public.phone_health;
create policy phone_health_insert on public.phone_health for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists phone_health_update on public.phone_health;
create policy phone_health_update on public.phone_health for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

commit;
