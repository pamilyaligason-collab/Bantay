-- Family Bantay S30 (lane L2): integrity_findings, what the nightly integrity-check edge function found wrong or doubtful in the family's records.
-- Needs 0002 (is_admin), 0001 (people). Written only; applied ONLY when the owner says "apply 0064". The app never requires it (a missing table = the System health card says "Not available yet").
-- Safe to run twice. Undo: 0064_integrity_findings.down.sql.
--
-- * FINDINGS ONLY. The function never changes or deletes a reading, lab result or activity row. A person reviews a finding; a fix is a separate, logged step
--   (duplicates only through the existing records_dedupe_log path).
-- * No names: person_id is the people uuid; detail holds the test code, the value, the unit text and the reason (jsonb object, under 2000 characters).
-- * One row per (kind, table_name, row_ref): a rerun refreshes the same row. A finding that no longer applies is marked resolved by the function, and resolved rows are deleted after 90 days (ML-06).
-- * Readers: admins (is_admin()). Writer: the function with the service role. Nobody else sees a row; the client gets select only.
-- * The nightly schedule is applied by the owner after the deploy (ops/sql/integrity_check_cron.sql), not here.

begin;

create table if not exists public.integrity_findings (
  id bigint generated always as identity primary key,
  checked_at timestamptz not null default now(),
  kind text not null check (kind in ('duplicate', 'impossible', 'unit_mismatch', 'tile_mismatch', 'no_unit')),
  table_name text not null check (table_name in ('readings', 'lab_results', 'activity')),
  row_ref text not null check (length(row_ref) between 1 and 120),
  person_id uuid references public.people (id) on delete cascade,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object' and length(detail::text) < 2000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  unique (kind, table_name, row_ref)
);
create index if not exists integrity_findings_status_checked on public.integrity_findings (status, checked_at desc);
create index if not exists integrity_findings_person on public.integrity_findings (person_id);

alter table public.integrity_findings enable row level security;
revoke all on public.integrity_findings from public, anon, authenticated;
grant select on public.integrity_findings to authenticated;
grant select, insert, update, delete on public.integrity_findings to service_role;
drop policy if exists integrity_findings_admin_read on public.integrity_findings;
create policy integrity_findings_admin_read on public.integrity_findings for select to authenticated using (public.is_admin());

commit;
