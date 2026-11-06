-- Undo 0052_live_location.sql: the place table, its functions and the prune job go; feed_share_set and the feed_shares category list return to 0050.
-- Every place switch row and every stored point is lost (a later up starts with everyone sharing and no points). Safe to run twice.
begin;

do $$ begin
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    execute $c$select cron.unschedule(jobid) from cron.job where jobname = 'live-locations-prune'$c$;
  end if;
end $$;
drop function if exists public.live_locations_prune();
drop function if exists public.family_places();
drop function if exists public.live_location_put(double precision, double precision, integer, timestamptz, integer, boolean);
drop table if exists public.live_locations;

delete from public.feed_shares where category = 'place';
alter table public.feed_shares drop constraint if exists feed_shares_category_check;
alter table public.feed_shares add constraint feed_shares_category_check check (category in ('bp', 'lab', 'photo', 'status'));

-- feed_share_set back to its 0050 body
create or replace function public.feed_share_set(p_person uuid, p_category text, p_on boolean) returns void
  language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  login uuid;
begin
  if me is null or not public.is_family_member() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_person is null or p_on is null or p_category is null or p_category not in ('bp', 'lab', 'photo', 'status') then raise exception 'bad target' using errcode = '22023'; end if;
  if public.pin_try(md5('feed:' || me::text)::uuid, 30, interval '1 hour') > 30 then raise exception 'too many changes' using errcode = '53400'; end if;
  select pe.auth_user_id into login from public.people pe where pe.id = p_person and pe.archived_at is null and pe.kind is null;
  if not found then raise exception 'bad target' using errcode = '22023'; end if;
  if login is not null then
    if not (login = me or (not p_on and public.is_owner())) then raise exception 'not allowed' using errcode = '42501'; end if;
  elsif not public.is_owner() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.feed_shares as f (person_id, category, enabled, agreed_at, agreed_text, updated_at, updated_by)
    values (p_person, p_category, p_on, case when p_on then now() end, case when p_on then 'feed-2026-11' end, now(), me)
  on conflict (person_id, category) do update set
    enabled = excluded.enabled,
    agreed_at = case when excluded.enabled and not f.enabled then excluded.agreed_at else f.agreed_at end,
    agreed_text = case when excluded.enabled and not f.enabled then excluded.agreed_text else f.agreed_text end,
    updated_at = now(), updated_by = me;
  insert into public.audit_log (actor, tbl, person_id, action, fields) values (me, 'feed_shares', p_person, 'feed_share', array['enabled']);
end $$;
revoke execute on function public.feed_share_set(uuid, text, boolean) from public, anon, authenticated, service_role;
grant execute on function public.feed_share_set(uuid, text, boolean) to authenticated;

commit;
