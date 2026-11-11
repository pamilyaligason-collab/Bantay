-- Family Bantay S30: stop exact duplicate sensor readings at the door.
-- Live 2026-11-11: 10,412 heart_rate rows were exact copies (same person, test, value, unit and taken_at instant, new client_id each time),
-- arriving from more than one phone or a reset local store; 1,526 in one day. They were soft-deleted and logged in records_dedupe_log
-- (old_status 's30-hr-exact-dup', old_ref = kept id; undo: set deleted_at = null for those row_ids).
-- This trigger skips a new row that is an exact copy of a live row. The phone's insert still succeeds (0 rows), so the outbox clears.
-- Lab mirrors (lab_result_id) and rows without a value are never skipped. Safe to run twice. Undo: 0066_readings_exact_dup_guard.down.sql.

create or replace function public.readings_skip_exact_dup() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  if new.lab_result_id is null and new.value is not null and new.deleted_at is null and exists (
    select 1 from public.readings r
    where r.person_id = new.person_id and r.test = new.test and r.taken_at = new.taken_at
      and r.value = new.value and lower(coalesce(r.unit, '')) = lower(coalesce(new.unit, ''))
      and r.deleted_at is null and r.lab_result_id is null) then
    return null;
  end if;
  return new;
end $$;
revoke execute on function public.readings_skip_exact_dup() from public, anon, authenticated;

drop trigger if exists readings_skip_exact_dup on public.readings;
create trigger readings_skip_exact_dup before insert on public.readings
  for each row execute function public.readings_skip_exact_dup();
