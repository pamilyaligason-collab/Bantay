-- Family Bantay D-150: the daily background check-in (APK 2.8.0, D-149, D-151) writes battery and a check-in time with its own per-phone key, never the app's 1-hour sign-in token.
-- Also adds live_locations.checked_at and battery_checked_at, and moves the family_places 7-day cut and the prune from updated_at to fixed_at (D-151: a check-in can extend neither the grey pin nor the 7-day removal).
-- Needs 0052 (live_locations, feed_shares 'place'), 0002 (pin_try), 0023 (is_family_member). Written and rehearsed only; the owner applies it. Safe to run twice. Undo: 0053_device_place_key.down.sql.
--
-- Rules (D-150, Opus security review required before it is applied)
-- * A key belongs to one person on one phone (device_id, a random id the phone makes, never a hardware id). Only the SHA-256 of the key is stored; the raw key is returned once, by device_place_key_issue.
-- * The key can do one thing: live_location_put_device (D-151) records THAT person's battery and a check-in time. It never writes a place (lat, lon, accuracy, fixed_at). It reads nothing and opens nothing else (no table, no other function).
-- * Issue: signed-in family member, own person, only while that person's place sharing is not switched off. One active key per (person, device): issuing again rotates. At most 5 active keys per person (oldest revoked).
-- * Revoke: device_place_key_revoke(key) works with the key alone (so a phone can revoke after it lost its session). Switching 'place' off, by the person or by the owner, revokes every key of that person at once
--   (trigger on feed_shares, so every writer is covered, ML-11).
-- * Checked on every write, not only at issue: key exists, not revoked, issued within 30 days (hard cap, a used key does not extend it) and used within 30 days, the person is still linked to the login that issued it, the person still has a login that is not disabled, is not archived or the shared account, sharing not switched off.
--   Wrong, revoked, expired, off and disabled all answer the same false, so a caller learns nothing about which.
-- * Limits (ML-08): one check-in per key per 30 minutes (53400); wrong-key answers share one global budget of 300 an hour, so guessing is bounded; issuing is 10 an hour per person.
-- * No coordinate is ever written to audit_log or to the key table.
begin;
set local lock_timeout = '5s';

create table if not exists public.device_place_keys (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people (id) on delete cascade,
  user_id uuid not null, -- the login that issued the key; the key works only while people.auth_user_id is still this login (a re-linked person's old keys stop)
  device_id text not null check (length(device_id) between 8 and 64),
  key_hash text not null unique check (length(key_hash) = 64),
  label text check (label is null or length(label) <= 40),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  last_put_at timestamptz,
  revoked_at timestamptz
);
alter table public.device_place_keys enable row level security;
revoke all on public.device_place_keys from anon, authenticated; -- no policy, no grant: only the functions below touch it
create unique index if not exists device_place_keys_one_active on public.device_place_keys (person_id, device_id) where revoked_at is null;

-- Issue (or rotate) this phone's key. Returns the raw key once. 42501 not allowed / sharing off; 22023 bad device; 53400 more than 10 an hour.
create or replace function public.device_place_key_issue(p_device text, p_label text default null) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  pid uuid;
  raw text;
begin
  if me is null or not public.is_family_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  select pe.id into pid from public.people pe where pe.auth_user_id = me and pe.archived_at is null and pe.kind is null;
  if pid is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if exists (select 1 from public.feed_shares fs where fs.person_id = pid and fs.category = 'place' and not fs.enabled) then raise exception 'not sharing' using errcode = '42501'; end if;
  if p_device is null or length(p_device) not between 8 and 64 then raise exception 'bad value' using errcode = '22023'; end if;
  if public.pin_try(md5('pkey:' || me::text)::uuid, 10, interval '1 hour') > 10 then raise exception 'too many changes' using errcode = '53400'; end if;
  update public.device_place_keys set revoked_at = now() where person_id = pid and device_id = p_device and revoked_at is null;
  raw := 'bpk_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); -- 244 random bits
  insert into public.device_place_keys (person_id, user_id, device_id, key_hash, label)
    values (pid, me, p_device, encode(sha256(convert_to(raw, 'UTF8')), 'hex'), left(p_label, 40));
  update public.device_place_keys set revoked_at = now() -- cap (ML-06): the 5 newest active keys stay
    where id in (select k.id from public.device_place_keys k where k.person_id = pid and k.revoked_at is null order by k.created_at desc, k.id offset 5);
  return raw;
end $$;
revoke execute on function public.device_place_key_issue(text, text) from public, anon, authenticated, service_role;
grant execute on function public.device_place_key_issue(text, text) to authenticated;

-- Revoke by key: idempotent, silent for a key that never existed. Callable without a session on purpose (sign-out, a lost session).
create or replace function public.device_place_key_revoke(p_key text) returns void
  language plpgsql security definer set search_path = '' as $$
declare h text;
begin
  if p_key is null or length(p_key) not between 20 and 200 then return; end if;
  h := encode(sha256(convert_to(p_key, 'UTF8')), 'hex');
  update public.device_place_keys set revoked_at = now() where key_hash = h and revoked_at is null;
  if not found and not exists (select 1 from public.device_place_keys k where k.key_hash = h) then
    if public.pin_try(md5('pkbad')::uuid, 300, interval '1 hour') > 300 then raise exception 'too many changes' using errcode = '53400'; end if;
  end if;
end $$;
revoke execute on function public.device_place_key_revoke(text) from public, anon, authenticated, service_role;
grant execute on function public.device_place_key_revoke(text) to anon, authenticated;

-- The background check-in (D-151): the daily run sends ONLY the battery and that the phone checked in. It never writes lat, lon, accuracy or fixed_at: the runner cannot prove the phone is still at the last point,
-- and re-dating that point would keep a stale place on the map. checked_at is the check-in time; the grey pin (6 h) and the 7-day removal are measured from fixed_at only (family_places and the prune below).
-- Returns true when the key was accepted (battery and check-in time stored, or nothing to store because the person has no point yet) and false for ANY key or person problem (wrong, revoked, expired, switched off, disabled): one answer, nothing to tell them apart.
-- A refusal is an answer, not an error, so the wrong-key counter commits (an error would roll it back). 53400 too soon / more than 300 wrong keys an hour. A null or out-of-range battery (outside 0..100) leaves the known battery and charging as they were (never wipes, never clamps) and does not move battery_checked_at; checked_at always moves.
alter table public.live_locations add column if not exists checked_at timestamptz; -- last check-in of any kind
alter table public.live_locations add column if not exists battery_checked_at timestamptz; -- last time a valid battery was written by a check-in

create or replace function public.live_location_put_device(p_key text, p_battery_pct integer, p_charging boolean) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  kid uuid;
  kperson uuid;
  kuser uuid;
  klast timestamptz;
  pid uuid;
begin
  if p_key is not null and length(p_key) between 20 and 200 then
    select d.id, d.person_id, d.user_id, d.last_put_at into kid, kperson, kuser, klast from public.device_place_keys d
      where d.key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex') and d.revoked_at is null and d.created_at > now() - interval '30 days' and coalesce(d.last_used_at, d.created_at) > now() - interval '30 days'
      for update;
  end if;
  if kid is null then
    if public.pin_try(md5('pkbad')::uuid, 300, interval '1 hour') > 300 then raise exception 'too many changes' using errcode = '53400'; end if;
    return false;
  end if;
  select pe.id into pid from public.people pe join public.app_roles r on r.user_id = pe.auth_user_id
    where pe.id = kperson and pe.auth_user_id = kuser and pe.archived_at is null and pe.kind is null and not r.disabled;
  if pid is null then return false; end if;
  if exists (select 1 from public.feed_shares fs where fs.person_id = pid and fs.category = 'place' and not fs.enabled) then return false; end if;
  if klast is not null and klast > now() - interval '30 minutes' then raise exception 'too soon' using errcode = '53400'; end if;
  update public.device_place_keys set last_put_at = now(), last_used_at = now() where id = kid;
  -- only battery and the check-in time: lat, lon, accuracy_m, fixed_at and updated_at are never written here
  update public.live_locations set
    battery_pct = case when coalesce(p_battery_pct between 0 and 100, false) then p_battery_pct::smallint else battery_pct end,
    charging = case when coalesce(p_battery_pct between 0 and 100, false) then p_charging else charging end,
    battery_checked_at = case when coalesce(p_battery_pct between 0 and 100, false) then now() else battery_checked_at end,
    checked_at = now()
    where person_id = pid;
  return true;
end $$;
revoke execute on function public.live_location_put_device(text, integer, boolean) from public, anon, authenticated, service_role;
grant execute on function public.live_location_put_device(text, integer, boolean) to anon, authenticated;

-- The family map read (0052) gains battery_at, the time the battery was last written (a valid check-in battery or a foreground point, whichever is later), and checked_at, the last check-in of any kind, and the 7-day cut moves from updated_at to fixed_at.
-- The return type changes, so the function is dropped and made again with its grants (ML-21).
drop function if exists public.family_places();
create or replace function public.family_places() returns table(person_id uuid, lat double precision, lon double precision, accuracy_m integer, fixed_at timestamptz, battery_pct smallint, charging boolean, battery_at timestamptz, checked_at timestamptz)
  language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.is_family_member() then return; end if;
  return query
  select l.person_id, l.lat, l.lon, l.accuracy_m, l.fixed_at, l.battery_pct, l.charging, greatest(l.battery_checked_at, l.updated_at), l.checked_at
  from public.live_locations l
  join public.people pe on pe.id = l.person_id
  where pe.archived_at is null and pe.kind is null and pe.auth_user_id is not null
    and exists (select 1 from public.app_roles r where r.user_id = pe.auth_user_id and not r.disabled)
    and not exists (select 1 from public.feed_shares fs where fs.person_id = l.person_id and fs.category = 'place' and not fs.enabled)
    and l.fixed_at > now() - interval '7 days'
  order by l.person_id;
end $$;
revoke execute on function public.family_places() from public, anon, authenticated, service_role;
grant execute on function public.family_places() to authenticated;

create or replace function public.live_locations_prune() returns void
  language sql security definer set search_path = '' as
  $$ delete from public.live_locations where fixed_at < now() - interval '7 days' $$;
revoke execute on function public.live_locations_prune() from public, anon, authenticated, service_role;

-- Switching 'place' off (the person, or the owner: every writer of feed_shares is caught by this row trigger) ends every key of that person at once.
create or replace function public.device_place_keys_on_off() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  update public.device_place_keys set revoked_at = now() where person_id = new.person_id and revoked_at is null;
  return new;
end $$;
revoke execute on function public.device_place_keys_on_off() from public, anon, authenticated, service_role;
drop trigger if exists device_place_keys_on_off on public.feed_shares;
create trigger device_place_keys_on_off after insert or update of enabled on public.feed_shares
  for each row when (new.category = 'place' and not new.enabled) execute function public.device_place_keys_on_off();

-- Retention (ML-06): revoked keys go after 7 days, keys idle or older than 30 days after 37 (they already stop working at 30). Daily at 03:50 Manila (guarded: only when pg_cron exists). Never called by an app role.
create or replace function public.device_place_keys_prune() returns void
  language sql security definer set search_path = '' as
  $$ delete from public.device_place_keys where revoked_at < now() - interval '7 days' or coalesce(last_used_at, created_at) < now() - interval '37 days' or created_at < now() - interval '37 days' $$;
revoke execute on function public.device_place_keys_prune() from public, anon, authenticated, service_role;

do $$ begin
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    execute $c$select cron.unschedule(jobid) from cron.job where jobname = 'device-place-keys-prune'$c$;
    execute $c$select cron.schedule('device-place-keys-prune', '50 19 * * *', 'select public.device_place_keys_prune()')$c$;
  end if;
end $$;

commit;
