-- Undo 0065_people_tz.sql. Safe to run twice. Removes the zone column and its setter; dose-watch then reads everyone as Asia/Manila again (it falls back when the column is missing).
begin;
drop function if exists public.set_my_tz(text);
alter table public.people drop constraint if exists people_tz_valid;
alter table public.people drop column if exists tz;
commit;
