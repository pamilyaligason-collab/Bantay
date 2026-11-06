-- Family Bantay D-136, D-138: the family's latest place. Needs 0001 (people), 0002 (app_roles, pin_try), 0021 (audit_log), 0023 (is_family_member), 0037 (audit_log action list), 0046 (is_owner, people.kind) and 0050 (feed_shares, feed_share_set).
-- Written and rehearsed only; the owner applies it. Safe to run twice. Undo: 0052_live_location.down.sql. No edge function, no notification: nothing here sends.
--
-- Rules (D-138, Opus privacy review required before it is applied)
-- * Latest point only: live_locations holds one row per person, replaced on every write. No history table, no trail.
-- * ON BY DEFAULT for people who sign in: no feed_shares 'place' row means sharing, an explicit enabled=false row means off. A person with no login (no auth_user_id), an archived
--   person and the shared family account (people.kind 'shared') never share and never appear.
-- * Who may switch: the person for themself, the owner may switch OFF anyone (feed_share_set rules of 0050). Switching 'place' off deletes that person's row at once.
-- * live_location_put writes only the caller's OWN person and refuses (42501) while that person's switch is off. It rejects 0,0 and anything off the globe (22023, ML-05).
-- * Read only through family_places(): a family member sees every sharing person, the owner included in nothing extra (no owner or admin branch). No direct table grant.
-- * A disabled account's row is hidden at once (ML-33); rows idle 7 days are deleted daily (ML-06); the writer is limited to 60 calls an hour (ML-08).
-- * The audit row for a switch holds the column name 'enabled' only (0050), never a coordinate.
begin;

create table if not exists public.live_locations (
  person_id uuid primary key references public.people (id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lon double precision not null check (lon between -180 and 180),
  accuracy_m integer check (accuracy_m is null or accuracy_m >= 0),
  fixed_at timestamptz not null,
  battery_pct smallint check (battery_pct is null or battery_pct between 0 and 100),
  charging boolean,
  updated_at timestamptz not null default now(),
  check (not (lat = 0 and lon = 0))
);
alter table public.live_locations enable row level security;
revoke all on public.live_locations from anon, authenticated; -- no policy, no grant: family_places() is the only read, live_location_put the only write

-- Whitelist (ML-28): feed_shares.category gains 'place'. family_feed() (0050) reads only the four feed categories, so a 'place' row never reaches the feed.
alter table public.feed_shares drop constraint if exists feed_shares_category_check;
alter table public.feed_shares add constraint feed_shares_category_check check (category in ('bp', 'lab', 'photo', 'status', 'place'));

-- feed_share_set (0050) with 'place': a no-login person can never share place (22023); switching place off deletes the row. Full grants restated (ML-21).
create or replace function public.feed_share_set(p_person uuid, p_category text, p_on boolean) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  login uuid;
begin
  if me is null or not public.is_family_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_person is null or p_on is null or p_category is null or p_category not in ('bp', 'lab', 'photo', 'status', 'place') then raise exception 'bad target' using errcode = '22023'; end if;
  if public.pin_try(md5('feed:' || me::text)::uuid, 30, interval '1 hour') > 30 then raise exception 'too many changes' using errcode = '53400'; end if;
  select pe.auth_user_id into login from public.people pe where pe.id = p_person and pe.archived_at is null and pe.kind is null;
  if not found then raise exception 'bad target' using errcode = '22023'; end if;
  if p_category = 'place' and login is null then raise exception 'bad target' using errcode = '22023'; end if; -- no login, no phone: nothing to share
  if login is not null then
    if not (login = me or (not p_on and public.is_owner())) then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif not public.is_owner() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.feed_shares as f (person_id, category, enabled, agreed_at, agreed_text, updated_at, updated_by)
    values (p_person, p_category, p_on, case when p_on then now() end, case when p_on then (case when p_category = 'place' then 'place-2026-11' else 'feed-2026-11' end) end, now(), me)
  on conflict (person_id, category) do update set
    enabled = excluded.enabled,
    agreed_at = case when excluded.enabled and not f.enabled then excluded.agreed_at else f.agreed_at end,
    agreed_text = case when excluded.enabled and not f.enabled then excluded.agreed_text else f.agreed_text end,
    updated_at = now(), updated_by = me;
  if p_category = 'place' and not p_on then delete from public.live_locations where person_id = p_person; end if;
  insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'feed_shares', p_person, 'feed_share', array['enabled']);
end $$;
revoke execute on function public.feed_share_set(uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.feed_share_set(uuid, text, boolean) to authenticated;

-- Write the caller's own latest point. 42501 not allowed (not a member, no own person, switch off); 22023 bad value; 53400 more than 60 calls an hour.
-- An older fix never replaces a newer one. battery_pct outside 0..100 is stored as unknown (null), never clamped.
create or replace function public.live_location_put(p_lat double precision, p_lon double precision, p_accuracy_m integer, p_fixed_at timestamptz, p_battery_pct integer, p_charging boolean) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  pid uuid;
begin
  if me is null or not public.is_family_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  select pe.id into pid from public.people pe where pe.auth_user_id = me and pe.archived_at is null and pe.kind is null;
  if pid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.feed_shares fs where fs.person_id = pid and fs.category = 'place' and not fs.enabled) then raise exception 'not sharing' using errcode = '42501'; end if;
  if p_lat is null or p_lon is null or p_fixed_at is null or p_lat not between -90 and 90 or p_lon not between -180 and 180 or (p_lat = 0 and p_lon = 0)
     or p_lat = 'NaN'::double precision or p_lon = 'NaN'::double precision or (p_accuracy_m is not null and p_accuracy_m < 0) or p_fixed_at > now() + interval '5 minutes' or p_fixed_at < now() - interval '7 days' then
    raise exception 'bad value' using errcode = '22023';
  end if;
  if public.pin_try(md5('place:' || me::text)::uuid, 60, interval '1 hour') > 60 then raise exception 'too many changes' using errcode = '53400'; end if;
  insert into public.live_locations as l (person_id, lat, lon, accuracy_m, fixed_at, battery_pct, charging, updated_at)
    values (pid, p_lat, p_lon, p_accuracy_m, p_fixed_at, case when p_battery_pct between 0 and 100 then p_battery_pct::smallint end, p_charging, now())
  on conflict (person_id) do update set lat = excluded.lat, lon = excluded.lon, accuracy_m = excluded.accuracy_m, fixed_at = excluded.fixed_at,
    battery_pct = excluded.battery_pct, charging = excluded.charging, updated_at = now()
    where excluded.fixed_at >= l.fixed_at;
end $$;
revoke execute on function public.live_location_put(double precision, double precision, integer, timestamptz, integer, boolean) from public, anon, authenticated, service_role;
grant execute on function public.live_location_put(double precision, double precision, integer, timestamptz, integer, boolean) to authenticated;

-- The family map: every sharing person's latest point. Empty for a caller who is not an enabled family member. No owner or admin branch: the owner sees what the family sees.
-- "Sharing" = has a login, is not archived or the shared account, the login is not disabled, and no explicit off switch. Rows idle 7 days are not returned (they are deleted by the prune).
create or replace function public.family_places() returns table(person_id uuid, lat double precision, lon double precision, accuracy_m integer, fixed_at timestamptz, battery_pct smallint, charging boolean)
  language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.is_family_member() then return; end if;
  return query
  select l.person_id, l.lat, l.lon, l.accuracy_m, l.fixed_at, l.battery_pct, l.charging
  from public.live_locations l
  join public.people pe on pe.id = l.person_id
  where pe.archived_at is null and pe.kind is null and pe.auth_user_id is not null
    and exists (select 1 from public.app_roles r where r.user_id = pe.auth_user_id and not r.disabled)
    and not exists (select 1 from public.feed_shares fs where fs.person_id = l.person_id and fs.category = 'place' and not fs.enabled)
    and l.updated_at > now() - interval '7 days'
  order by l.person_id;
end $$;
revoke execute on function public.family_places() from public, anon, authenticated, service_role;
grant execute on function public.family_places() to authenticated;

-- 7-day retention (ML-06), daily at 03:40 Manila (guarded: only when pg_cron exists). Never called by an app role.
create or replace function public.live_locations_prune() returns void
  language sql security definer set search_path = '' as
  $$ delete from public.live_locations where updated_at < now() - interval '7 days' $$;
revoke execute on function public.live_locations_prune() from public, anon, authenticated, service_role;

do $$ begin
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    execute $c$select cron.unschedule(jobid) from cron.job where jobname = 'live-locations-prune'$c$;
    execute $c$select cron.schedule('live-locations-prune', '40 19 * * *', 'select public.live_locations_prune()')$c$;
  end if;
end $$;

commit;
