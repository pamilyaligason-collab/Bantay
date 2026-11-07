-- Undo 0053_device_place_key.sql: every per-phone key stops working and is deleted, checked_at and battery_checked_at go, and family_places and the prune return to their 0052 form (cut on updated_at). 0052 is otherwise untouched. Safe to run twice.
-- After this the function live_location_put_device no longer exists: PostgREST answers 404 (not 42501, not false) to a phone that still holds a key. The runner treats 404 as "stop" and clears itself (public/runners/bgplace.js).
begin;
set local lock_timeout = '5s';

do $$ begin
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    execute $c$select cron.unschedule(jobid) from cron.job where jobname = 'device-place-keys-prune'$c$;
  end if;
end $$;
drop trigger if exists device_place_keys_on_off on public.feed_shares;
drop function if exists public.device_place_keys_on_off();
drop function if exists public.device_place_keys_prune();
drop function if exists public.live_location_put_device(text, integer, boolean);
drop function if exists public.device_place_key_revoke(text);
drop function if exists public.device_place_key_issue(text, text);
drop table if exists public.device_place_keys;

-- family_places and the prune as 0052 made them (return type changes back, so drop first; grants restated, ML-21)
drop function if exists public.family_places();
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

create or replace function public.live_locations_prune() returns void
  language sql security definer set search_path = '' as
  $$ delete from public.live_locations where updated_at < now() - interval '7 days' $$;
revoke execute on function public.live_locations_prune() from public, anon, authenticated, service_role;

alter table public.live_locations drop column if exists checked_at;
alter table public.live_locations drop column if exists battery_checked_at;

commit;
