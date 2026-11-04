-- Phase 2 lane A (D-107, D-108): alert tiers. WRITTEN ONLY; the owner applies it. Re-runnable.
-- 1. safety_alerts.kind gains 'eonet' (NASA EONET events, awareness only, never a notification). The check is widened, nothing else about the table changes.
-- 2. safety_digests: one row per Manila day, built at 06:45 by the alerts-digest function from the last 24 h of safety_alerts. Counts and titles only, no person data.
-- Needs 0007 (safety_alerts) and 0023 (is_family_member). Other whitelists of this kind (ML-28): src/features/safety/alerts.ts AlertKind, supabase/functions/alerts-ingest/parse.ts AlertRow.kind;
-- 0041_rollcall.sql lists a subset of kinds for storm roll calls and needs no change.

alter table public.safety_alerts drop constraint if exists safety_alerts_kind_check;
alter table public.safety_alerts add constraint safety_alerts_kind_check
  check (kind in ('tcws', 'rainfall', 'thunderstorm', 'heat', 'quake', 'tsunami', 'utility', 'local', 'gdacs', 'volcano', 'air', 'eonet'));

create table if not exists public.safety_digests (
  day date primary key,                                       -- the Manila day the digest was built for
  body jsonb not null check (jsonb_typeof(body) = 'object' and pg_column_size(body) <= 16384),
  built_at timestamptz not null default now()
);

alter table public.safety_digests enable row level security;
revoke all on public.safety_digests from public, anon, authenticated;
grant select on public.safety_digests to authenticated;
grant select, insert, update, delete on public.safety_digests to service_role;   -- the alerts-digest function (upsert, and the 30-day prune of its own table)
drop policy if exists safety_digests_read on public.safety_digests;
create policy safety_digests_read on public.safety_digests for select to authenticated using (public.is_family_member());
-- No write policy for members: only the service role writes.
