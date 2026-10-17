-- Admin dashboard data (lane A3, contract D-16..D-19). Written only; never applied from this lane.
-- Needs public.is_admin() from 0002_auth.sql.
-- PRIVACY (B-7): usage_events holds screen/action/error names only. The client allowlist is mirrored here by a
-- check constraint (letters and underscores only, so a reading like "bp_150" can never be stored). No health values anywhere.

create table public.usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  at timestamptz not null default now(), -- arrival time; an offline phone's queued events are stamped when they sync (ponytail: client time later if needed)
  kind text not null check (kind in ('screen', 'action', 'error')),
  name text not null check (name ~ '^[a-z_]{1,40}$'),
  app_version text check (app_version ~ '^[0-9a-z.+-]{1,20}$')
);
create index usage_events_user_at on public.usage_events (user_id, at desc);
create index usage_events_at on public.usage_events (at desc);

alter table public.usage_events enable row level security;
revoke all on public.usage_events from anon, authenticated;
grant select, insert on public.usage_events to authenticated;

-- Everyone signed in writes their own rows. Only an admin reads them. Nobody updates or deletes.
create policy usage_events_insert on public.usage_events for insert to authenticated
  with check (user_id = auth.uid());
create policy usage_events_read on public.usage_events for select to authenticated
  using (public.is_admin());

-- Admin links carers (D-17: carer links with can_write). An admin may link anyone except themselves, so the admin
-- role alone never grants reading a family member's health data.
create policy carers_admin_read on public.carers for select to authenticated using (public.is_admin());
create policy carers_admin_insert on public.carers for insert to authenticated
  with check (public.is_admin() and carer_id <> auth.uid());
create policy carers_admin_update on public.carers for update to authenticated
  using (public.is_admin() and carer_id <> auth.uid()) with check (public.is_admin() and carer_id <> auth.uid());
create policy carers_admin_delete on public.carers for delete to authenticated
  using (public.is_admin() and carer_id <> auth.uid());

-- Per member: last seen, event count in the window, top 3 screens, active in 7 / 30 days, alerts and sensors on.
-- Output has no health columns by construction.
create function public.admin_usage_summary(days int default 30)
returns table (user_id uuid, last_seen timestamptz, events bigint, top_screens jsonb, active_7 boolean, active_30 boolean, alerts_on boolean, sensors_on boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  days := least(greatest(coalesce(days, 30), 1), 365);
  return query
  select u.user_id,
         max(u.at),
         count(*) filter (where u.at >= now() - make_interval(days => days)),
         coalesce((
           select jsonb_agg(jsonb_build_object('name', s.name, 'count', s.n) order by s.n desc, s.name)
           from (select e.name, count(*) as n from public.usage_events e
                 where e.user_id = u.user_id and e.kind = 'screen' and e.at >= now() - make_interval(days => days)
                 group by e.name order by n desc, e.name limit 3) s
         ), '[]'::jsonb),
         max(u.at) >= now() - interval '7 days',
         max(u.at) >= now() - interval '30 days',
         coalesce((select e.name = 'alerts_on' from public.usage_events e
                   where e.user_id = u.user_id and e.name in ('alerts_on', 'alerts_off') order by e.at desc, e.id desc limit 1), false),
         coalesce((select e.name = 'sensors_on' from public.usage_events e
                   where e.user_id = u.user_id and e.name in ('sensors_on', 'sensors_off') order by e.at desc, e.id desc limit 1), false)
  from public.usage_events u
  group by u.user_id;
end $$;

-- Import status: how many rows each person has. Counts only, never values.
create function public.admin_import_counts()
returns table (person_id uuid, display_name text, readings bigint, consults bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return query
  select p.id, p.display_name,
         (select count(*) from public.readings r where r.person_id = p.id),
         (select count(*) from public.consults c where c.person_id = p.id)
  from public.people p order by p.display_name;
end $$;

revoke all on function public.admin_usage_summary(int), public.admin_import_counts() from public, anon;
grant execute on function public.admin_usage_summary(int), public.admin_import_counts() to authenticated;
