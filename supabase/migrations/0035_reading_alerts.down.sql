-- Undo 0035: stop the family alert on dangerous readings. Readings and existing carer_alerts rows stay. Run before the 0034..0030 downs.
drop trigger if exists readings_alert on public.readings;
drop function if exists public.readings_alert();
