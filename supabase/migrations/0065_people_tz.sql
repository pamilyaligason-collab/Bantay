-- Family Bantay S30 (lane L8 Texas): people.tz, the IANA time zone a person's own clock runs on (Asia/Manila by default; America/Chicago for a member in Texas).
-- Needs 0001 (people), 0002 (pin_try). Written only; applied ONLY when the owner says "apply 0065". Apply it BEFORE deploying dose-watch (the new dose-watch also runs without it, everyone then stays Asia/Manila).
-- Safe to run twice. Undo: 0065_people_tz.down.sql.
--
-- * Every existing row keeps 'Asia/Manila', so nothing changes for the Philippines.
-- * Dose-watch reads the zone to judge a dose "late" on the person's own wall clock (Intl at the instant: Texas clock changes handled), and the push quiet hours (10 PM to 6 AM) use the carer's zone.
-- * The column has NO update grant for app users (0001 grants update on display_name only). The one way to change it is set_my_tz(), self only:
--   the phone reports its Intl zone on open. The name is validated against pg_timezone_names; at most 12 changes an hour per person (ML-08). A person cannot change anyone else's.
-- * Readers: the same people_read policy as every other people column (the person and their carers).

begin;

alter table public.people add column if not exists tz text not null default 'Asia/Manila';
alter table public.people drop constraint if exists people_tz_valid;
alter table public.people add constraint people_tz_valid check (char_length(tz) between 3 and 64);

create or replace function public.set_my_tz(p_tz text) returns text
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  z text := btrim(coalesce(p_tz, ''));
begin
  if me is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if char_length(z) not between 3 and 64 or not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = z) then raise exception 'bad zone' using errcode = '22023'; end if;
  if public.pin_try(md5('tz:' || me::text)::uuid, 12, interval '1 hour') > 12 then raise exception 'too many changes' using errcode = '53400'; end if;
  update public.people set tz = z where auth_user_id = me and archived_at is null and tz is distinct from z;
  return z;
end $$;
revoke execute on function public.set_my_tz(text) from public, anon, authenticated, service_role;
grant execute on function public.set_my_tz(text) to authenticated;

commit;
