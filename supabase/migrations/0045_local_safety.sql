-- Family Bantay: local safety data (evacuation centres, health facilities, police, fire, DRRMO and local hotlines) keyed by PSGC code,
-- with per-province region packs for local-first download and a coverage table. Design: docs/local-data/APP-INTEGRATION.md, sources: docs/local-data/RESEARCH.md.
-- Needs 0002 (is_admin), 0023 (is_family_member). Applied live 2026-11-01 (the owner: "Yes, apply 0045"). Safe to run twice. Undo: 0045_local_safety.down.sql.
--
-- * Words: status = does the cited source confirm the fact (confirmed / not_confirmed). last_verified_at + verified_by = when and by whom the row was last
--   checked against that source. Only checked rows are public (anon and members read them; the app shows not_confirmed rows with a "not confirmed" badge).
-- * The seed CSVs (supabase/seed/local-data/) are the source of truth: `refresh.mjs import --apply` makes the table equal to them, so an admin
--   edit or an accepted report is written into the CSV (reviewed in a PR), never only into the table.
-- * Writes: admins over REST, the refresh job with the service role (bypasses RLS). Members never write places; they send a report to safety_reports, an admin
--   accepts or rejects it, and an accepted report becomes a place edit by hand or by the import script.
-- * Packs are files in the public bucket region-packs at <province_code>/<sha256>.json (places) and <province_code>/hazards-<sha256>.pmtiles
--   (hazards), immutable so caches never go stale; region_packs lists them per layer.

-- ---------- coverage: one row per pack unit (province, HUC, ICC, Pateros) ----------
create table if not exists public.coverage (
  psgc_code text primary key check (psgc_code ~ '^\d{10}$'),
  name text not null check (length(name) between 2 and 80),
  kind text not null check (kind in ('province', 'huc', 'icc', 'municipality')),
  region_code text check (region_code ~ '^\d{10}$'),
  priority integer not null check (priority > 0), -- work order, 1 = first
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done')),
  verified_at date, -- last full review of this unit's rows
  neighbours text[] not null default '{}', -- pack codes the app prefetches after this one
  notes text check (length(notes) <= 1000)
);

-- ---------- places and hotlines ----------
create table if not exists public.safety_places (
  id text primary key check (id ~ '^[a-z0-9-]{3,80}$'),
  province_code text not null references public.coverage (psgc_code),
  psgc_code text check (psgc_code ~ '^\d{10}$'), -- city/municipality, or barangay when known
  kind text not null check (kind in ('evac', 'hospital', 'rhu', 'bhs', 'clinic', 'police', 'fire', 'coastguard', 'redcross', 'drrmo', 'hotline', 'other')),
  name text not null check (length(name) between 2 and 200),
  address text check (length(address) <= 300),
  phones text[] not null default '{}' check (cardinality(phones) <= 8), -- exactly as the source prints them
  lat double precision check (lat between 4 and 22),
  lon double precision check (lon between 116 and 127.5),
  capacity integer check (capacity > 0),
  status text not null default 'not_confirmed' check (status in ('confirmed', 'not_confirmed')),
  source text not null check (length(source) between 2 and 300),
  source_url text check (source_url ~ '^https?://'),
  licence text not null check (length(licence) between 2 and 120),
  source_date date, -- the date the source itself carries (page date, table "as of"), when it shows one
  last_verified_at date, -- the day a person or the review read this row on its source; null = not checked, so not public
  verified_by text check (length(verified_by) <= 80),
  confidence text not null check (confidence in ('high', 'medium', 'low')),
  notes text check (length(notes) <= 1000),
  check ((lat is null) = (lon is null)),
  check ((last_verified_at is null) = (verified_by is null)),
  check (status <> 'confirmed' or source_url is not null)
);
create index if not exists safety_places_province on public.safety_places (province_code);

-- ---------- region packs ----------
create table if not exists public.region_packs (
  province_code text not null references public.coverage (psgc_code),
  layer text not null default 'places' check (layer in ('places', 'hazards')), -- hazards: NOAH flood/landslide/storm-surge PMTiles (docs/local-data/HAZARDS.md)
  version integer not null check (version > 0),
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'), -- sha256 of the file bytes
  size_bytes integer not null check (size_bytes > 0),
  row_count integer not null check (row_count >= 0), -- places: rows; hazards: features
  storage_path text not null check (storage_path = province_code || '/' || case layer when 'places' then checksum || '.json' else 'hazards-' || checksum || '.pmtiles' end),
  built_at timestamptz not null default now(),
  primary key (province_code, layer, version)
);

-- ---------- community reports (moderated) ----------
create table if not exists public.safety_reports (
  id uuid primary key default gen_random_uuid(),
  place_id text references public.safety_places (id) on delete set null,
  province_code text check (province_code ~ '^\d{10}$'),
  kind text not null check (kind in ('new_place', 'wrong_phone', 'closed', 'moved', 'other')),
  body text not null check (length(body) between 3 and 1000),
  phone text check (length(phone) <= 40),
  lat double precision check (lat between 4 and 22),
  lon double precision check (lon between 116 and 127.5),
  reported_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((lat is null) = (lon is null))
);
create index if not exists safety_reports_pending on public.safety_reports (created_at) where status = 'pending';

-- ---------- RLS ----------
alter table public.coverage enable row level security;
alter table public.safety_places enable row level security;
alter table public.region_packs enable row level security;
alter table public.safety_reports enable row level security;

revoke all on public.coverage, public.safety_places, public.region_packs, public.safety_reports from anon, authenticated;
grant select on public.coverage, public.safety_places, public.region_packs to anon, authenticated;
grant insert, update, delete on public.coverage, public.safety_places to authenticated; -- narrowed to admins by the policies below
grant select on public.safety_reports to authenticated;
grant insert (place_id, province_code, kind, body, phone, lat, lon) on public.safety_reports to authenticated;
grant update (status, reviewed_by, reviewed_at) on public.safety_reports to authenticated;

drop policy if exists coverage_read on public.coverage;
create policy coverage_read on public.coverage for select to anon, authenticated using (true);
drop policy if exists coverage_admin on public.coverage;
create policy coverage_admin on public.coverage for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists safety_places_read on public.safety_places;
-- two policies: anon may not execute is_admin() (0002), and Postgres checks that permission even when the first half of an OR is true
create policy safety_places_read on public.safety_places for select to anon using (last_verified_at is not null);
drop policy if exists safety_places_read_member on public.safety_places;
create policy safety_places_read_member on public.safety_places for select to authenticated using (last_verified_at is not null or public.is_admin());
drop policy if exists safety_places_admin on public.safety_places;
create policy safety_places_admin on public.safety_places for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists region_packs_read on public.region_packs;
create policy region_packs_read on public.region_packs for select to anon, authenticated using (true);
-- no write policy: only the service role (refresh job) writes packs

drop policy if exists safety_reports_read on public.safety_reports;
create policy safety_reports_read on public.safety_reports for select to authenticated using (reported_by = auth.uid() or public.is_admin());
drop policy if exists safety_reports_insert on public.safety_reports;
create policy safety_reports_insert on public.safety_reports for insert to authenticated
  with check (public.is_family_member() and reported_by = auth.uid());
drop policy if exists safety_reports_review on public.safety_reports;
create policy safety_reports_review on public.safety_reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin() and reviewed_by = auth.uid() and status <> 'pending');

-- ---------- public bucket for pack files (reads by public URL, writes by the service role only) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('region-packs', 'region-packs', true, 52428800, array['application/json', 'application/vnd.pmtiles', 'application/octet-stream']) -- 50 MB: a province's hazard tiles
on conflict (id) do nothing;
