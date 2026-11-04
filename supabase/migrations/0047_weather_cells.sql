-- Weather blend cache (v13 lane Q, D-105..D-108). Written only; the owner applies it (0047; 0045 is local safety data, 0046 is the family files).
-- weather_cells: one row per ~1.1 km cell (lat/lon rounded to 2 decimals), the blended forecast the weather-blend function returns, kept 30 minutes.
-- weather_stations: the METAR bias check per airport (RPVT, RPMR, RPVM), refreshed at most hourly.
-- Rules
-- * Only the service role (the weather-blend function) reads or writes: RLS on, grant to service_role only, no policy. The app never reads these tables;
--   a readable cell list would show family members roughly where and when others opened weather.
-- * Coordinates are a 1 km cell, never a member's exact position; nothing here names a person. The function deletes cells a day past expiry.
-- Safe to run twice.
begin;

create table if not exists public.weather_cells (
  lat numeric(5,2) not null check (lat between 4 and 22),
  lon numeric(5,2) not null check (lon between 116 and 127),
  payload jsonb not null,
  met jsonb, -- MET Norway's last parsed answer and its Expires time, so the cell never asks MET again before Expires
  sources text[] not null default '{}',
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (lat, lon)
);

create table if not exists public.weather_stations (
  station text primary key check (station ~ '^RP[A-Z]{2}$'),
  name text not null,
  observed_at timestamptz not null,
  temp_c numeric(4,1) not null, -- the observation only; the bias is worked out per cell on each request
  updated_at timestamptz not null default now()
);

alter table public.weather_cells enable row level security;
alter table public.weather_stations enable row level security;
revoke all on public.weather_cells, public.weather_stations from anon, authenticated;
-- Explicit, so a project whose default privileges differ cannot silently lose the cache (every open would then call the paid source). Same style as 0048 and 0049.
grant select, insert, update, delete on public.weather_cells, public.weather_stations to service_role;

commit;
