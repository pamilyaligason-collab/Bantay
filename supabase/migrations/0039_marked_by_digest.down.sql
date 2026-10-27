-- Undo 0039_marked_by_digest.sql. Drops the opt-out table (everyone gets the 8 PM summary again) and the marked_by column. Safe to run twice.
drop function if exists public.set_digest(boolean);
drop table if exists public.carer_prefs;
drop trigger if exists meds_taken_marked_by on public.meds_taken;
drop function if exists public.meds_taken_marked_by();
alter table public.meds_taken drop column if exists marked_by, drop column if exists marked_by_name;
revoke update on public.meds_taken from authenticated;
grant update (name, taken_at, medication_id, slot, skipped) on public.meds_taken to authenticated;
