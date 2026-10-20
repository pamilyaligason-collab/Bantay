-- Undo 0014_medications_live.sql. Keeps every medication a person wrote or edited; removes rows the converter made
-- that nobody touched, and rows a person deleted (the tombstone would otherwise come back as a live medicine).
-- meds_taken keeps its rows; the medication_id, slot and skipped columns go. Safe to run twice.
drop trigger if exists prescription_items_convert on public.prescription_items;
drop trigger if exists medications_edit_stamp on public.medications;
drop trigger if exists medications_log_changes on public.medications;
drop trigger if exists meds_taken_same_person on public.meds_taken;
drop function if exists public.prescription_items_convert();
drop function if exists public.rx_to_medications(uuid);
drop function if exists public.medications_edit_stamp();
drop function if exists public.medications_log_changes();
drop function if exists public.meds_taken_same_person();

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'medications' and column_name = 'origin') then
    delete from public.medications where deleted_at is not null or (origin in ('rx', 'profile') and edited_at is null);
  end if;
end $$;

drop table if exists public.medication_changes;
drop table if exists public.medication_sources;
drop index if exists public.medications_one_per_drug;
drop index if exists public.meds_taken_medication;
alter table public.medications drop column if exists origin, drop column if exists deleted_at, drop column if exists edited_at;
alter table public.medications alter column schedule set default '[]';

alter table public.meds_taken drop column if exists medication_id, drop column if exists slot, drop column if exists skipped;
revoke update on public.meds_taken from authenticated;
grant update (name, taken_at) on public.meds_taken to authenticated;

drop function if exists public.rx_times(text);
drop function if exists public.rx_prn(text);
drop function if exists public.rx_days(text);
drop function if exists public.text_times(text);
drop function if exists public.normalise_drug(text);
