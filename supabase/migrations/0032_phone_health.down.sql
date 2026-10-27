-- Undo 0032_phone_health.sql. Safe to run twice. Deletes every phone_health row (a phone's alarm status is rebuilt the next time the app opens).
-- Strictly in reverse of the migration order: 0036 to 0033 first, then this one, then 0031 and 0030.
drop policy if exists phone_health_update on public.phone_health;
drop policy if exists phone_health_insert on public.phone_health;
drop policy if exists phone_health_read on public.phone_health;
drop trigger if exists phone_health_stamp on public.phone_health;
drop table if exists public.phone_health;
drop function if exists public.phone_health_carer(uuid);
drop function if exists public.phone_health_stamp();
