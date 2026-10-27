-- Family Bantay: in-app family alerts (session 10 phase 2, lane S1, D-78). Needs 0001 (people, carers), 0002 (app_roles), 0008 (documents) and 0018 (dose_watch_prune).
-- There is no server push on the Android app: an alert is a row here, shown in the bell and on Today/Family when the carer opens Bantay.
-- Browser/PWA users also get a web push, sent by the dose-watch function (mode 'flush') for rows with pushed_at null.
-- Rows carry a template id and a dedupe ref only: never a name, a reading or a coordinate (B-7).
-- Written only; Lloyd applies it. Safe to run twice. Undo: 0030_carer_alerts.down.sql.

create table if not exists public.carer_alerts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid references public.people (id) on delete cascade,        -- null only for admin 'system' rows
  carer_user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('dose_missed','review_open','phone_health','reading_high','mood_unwell','hazard','sos','sos_cancel','digest','pin_approve','pin_changed','system')),
  template text not null,                                                -- a templates.ts id
  ref text,                                                              -- dedupe key: safety_alerts.id, sos_events.id, medication id + day, reading bucket
  created_at timestamptz not null default now(),
  pushed_at timestamptz,                                                 -- "offered to web push"; the in-app row is the record
  seen_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',     -- the bell hides rows past this; dose_watch_prune deletes at 30 days
  constraint carer_alerts_person check (person_id is not null or kind = 'system')
);
create unique index if not exists carer_alerts_ref on public.carer_alerts (kind, ref, carer_user_id) where ref is not null;
create index if not exists carer_alerts_user_created on public.carer_alerts (carer_user_id, created_at desc);
create index if not exists carer_alerts_unpushed on public.carer_alerts (created_at) where pushed_at is null;

-- S11 (hazard K1): the name as printed on a paper. The 0030 down keeps this column because S11 data lives there.
alter table public.documents add column if not exists printed_name text;

-- RLS (H10): each user reads only their own rows and may set only seen_at on them. No insert or delete for app roles.
alter table public.carer_alerts enable row level security;
revoke all on public.carer_alerts from anon, authenticated;
grant select on public.carer_alerts to authenticated;
grant update (seen_at) on public.carer_alerts to authenticated;
grant select, insert, update, delete on public.carer_alerts to service_role;
drop policy if exists carer_alerts_select on public.carer_alerts;
create policy carer_alerts_select on public.carer_alerts for select to authenticated using (carer_user_id = auth.uid());
drop policy if exists carer_alerts_seen on public.carer_alerts;
create policy carer_alerts_seen on public.carer_alerts for update to authenticated using (carer_user_id = auth.uid()) with check (carer_user_id = auth.uid());

-- Realtime (guarded: WSL has no supabase_realtime publication; the down removes the table from it)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'carer_alerts') then
    alter publication supabase_realtime add table public.carer_alerts;
  end if;
end $$;

-- p_scope: 'carers' = writer carers of p_person; 'family' = every active member except the person; 'self' = the person's own user only (hazard rows).
-- Returns the number of rows inserted; a duplicate (kind, ref, carer) is ignored, never an error. A disabled account is never a recipient.
-- The person is never told about themself except with 'self'.
create or replace function public.notify_family(p_person uuid, p_kind text, p_template text, p_ref text, p_scope text) returns int
  language plpgsql security definer set search_path = '' as $$
declare n int; owner uuid;
begin
  if p_person is null then raise exception 'notify_family: person required' using errcode = '22023'; end if;
  if p_scope not in ('carers', 'family', 'self') then raise exception 'notify_family: bad scope' using errcode = '22023'; end if;
  select auth_user_id into owner from public.people where id = p_person;
  if not found then raise exception 'notify_family: unknown person' using errcode = '22023'; end if;
  insert into public.carer_alerts (person_id, carer_user_id, kind, template, ref)
  select p_person, r.uid, p_kind, p_template, p_ref
  from (
    select c.carer_id as uid from public.carers c where p_scope = 'carers' and c.person_id = p_person and c.can_write and c.carer_id is distinct from owner
    union
    select a.user_id from public.app_roles a where p_scope = 'family' and not a.disabled and a.user_id is distinct from owner
    union
    select owner where p_scope = 'self' and owner is not null
  ) r
  where not exists (select 1 from public.app_roles d where d.user_id = r.uid and d.disabled)
  on conflict (kind, ref, carer_user_id) where ref is not null do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.notify_family(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notify_family(uuid, text, text, text, text) to service_role;

-- The ONLY alert an app caller may raise: "<name> is not feeling well". The caller must be the person or a writer carer. One per person per Manila day.
create or replace function public.raise_mood_alert(p_person uuid) returns int
  language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not (
    exists (select 1 from public.people where id = p_person and auth_user_id = auth.uid())
    or exists (select 1 from public.carers where person_id = p_person and carer_id = auth.uid() and can_write)
  ) then raise exception 'not allowed' using errcode = '42501'; end if;
  return public.notify_family(p_person, 'mood_unwell', 'mood_unwell', p_person::text || ':' || to_char(now() at time zone 'Asia/Manila', 'YYYY-MM-DD'), 'carers');
end $$;
revoke execute on function public.raise_mood_alert(uuid) from public, anon;
grant execute on function public.raise_mood_alert(uuid) to authenticated, service_role;

-- Housekeeping: dose_watch_prune (0018) also forgets alert rows older than 30 days (ML-06). Grants restated (ML-21).
create or replace function public.dose_watch_prune() returns integer
  language plpgsql security definer set search_path = '' as
  $$ declare n int; begin
       delete from public.dose_watch_sent where sent_at < now() - interval '7 days';
       get diagnostics n = row_count;
       delete from public.carer_alerts where created_at < now() - interval '30 days';
       return n;
     end $$;
revoke execute on function public.dose_watch_prune() from public, anon, authenticated;
grant execute on function public.dose_watch_prune() to service_role;
