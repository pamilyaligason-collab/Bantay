-- Official safety alerts (D-25). Written by the alerts-ingest Edge Function with the service role; read by signed-in members.
-- Written only; never applied from a lane.

create table public.safety_alerts (
  id text primary key,
  kind text not null check (kind in ('tcws', 'rainfall', 'thunderstorm', 'heat', 'quake', 'tsunami', 'utility', 'local', 'gdacs', 'volcano', 'air')),
  level text,
  title text not null,
  what text not null,
  where_text text not null,
  when_text text not null,
  do_now text not null,
  source text not null,
  source_url text,
  issued_at timestamptz not null,
  lat double precision check (lat between -90 and 90),   -- null = area-wide, no point (unknown is null, never 0)
  lon double precision check (lon between -180 and 180),
  bulletin text not null,
  previous_bulletin text,
  checklist jsonb,
  timeline jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,                                 -- null = no expiry
  stale boolean not null default false                    -- true while this alert's source is failing: row kept, marked old
);
create index safety_alerts_active on public.safety_alerts (expires_at);

alter table public.safety_alerts enable row level security;
revoke all on public.safety_alerts from anon, authenticated;
grant select on public.safety_alerts to authenticated;
create policy safety_alerts_read on public.safety_alerts for select to authenticated using (true);
-- No write grants or policies: only the service role (alerts-ingest) writes.
