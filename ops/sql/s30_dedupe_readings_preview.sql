-- Family Bantay S30 (lane L2): PREVIEW of a duplicate-readings cleanup. READ ONLY: every statement here is a select. Nothing is deleted, updated or inserted.
-- Run it in the Supabase SQL editor (or read-only through the MCP) and send the numbers to the owner. A later cleanup is a separate file, written and run only after approval.
--
-- Rule (the same group the nightly integrity-check uses): readings of one person, one test, one value and one unit, taken in the same minute, are one group.
-- Keep the EARLIEST row of each group (oldest taken_at, then lowest id); every other row of the group is a duplicate that a cleanup would remove.
-- Left out on purpose: rows already soft-deleted, and rows that carry lab_result_id (a lab value mirrored into readings: the lab result is the record, never touched here).
-- The group is a calendar minute here; the function uses "within 60 seconds of the kept row", so its count can differ by a few rows at minute edges.
--
-- How a cleanup would work (not done here): copy each removed id to records_dedupe_log (tbl 'readings', row_id = the removed id, old_ref = the kept id), then set deleted_at = now() on it
-- (a soft delete, the way the app already hides readings). Setting deleted_at back to null restores a row, and the log says which rows were touched.

-- 1. Per test: how many groups hold duplicates, how many rows are kept and how many would be removed.
with r as (
  select id, person_id, test, value, lower(coalesce(unit, '')) as u, taken_at,
         row_number() over (partition by person_id, test, value, lower(coalesce(unit, '')), date_trunc('minute', taken_at) order by taken_at, id) as rn,
         count(*)     over (partition by person_id, test, value, lower(coalesce(unit, '')), date_trunc('minute', taken_at)) as n
  from public.readings
  where deleted_at is null and lab_result_id is null and value is not null)
select test,
       count(*) filter (where rn = 1 and n > 1)  as groups_with_duplicates,
       count(*) filter (where rn = 1 and n > 1)  as rows_kept,
       count(*) filter (where rn > 1)            as rows_that_would_be_removed,
       count(*)                                  as rows_checked
from r
group by test
having count(*) filter (where rn > 1) > 0
order by rows_that_would_be_removed desc, test;

-- 2. The total, and how much of the table it is.
with r as (
  select row_number() over (partition by person_id, test, value, lower(coalesce(unit, '')), date_trunc('minute', taken_at) order by taken_at, id) as rn
  from public.readings
  where deleted_at is null and lab_result_id is null and value is not null)
select count(*) filter (where rn > 1) as rows_that_would_be_removed, count(*) as readings_checked,
       round(100.0 * count(*) filter (where rn > 1) / nullif(count(*), 0), 1) as percent_of_readings
from r;

-- 3. How the first 20 would be logged in records_dedupe_log (ids only: no names, no values). The cleanup would insert exactly these columns for every removed row.
with r as (
  select id, taken_at,
         row_number() over (partition by person_id, test, value, lower(coalesce(unit, '')), date_trunc('minute', taken_at) order by taken_at, id) as rn,
         first_value(id) over (partition by person_id, test, value, lower(coalesce(unit, '')), date_trunc('minute', taken_at) order by taken_at, id) as keep_id
  from public.readings
  where deleted_at is null and lab_result_id is null and value is not null)
select 'readings'::text as tbl, id as row_id, null::text as old_status, keep_id as old_ref
from r
where rn > 1
order by taken_at, id
limit 20;
