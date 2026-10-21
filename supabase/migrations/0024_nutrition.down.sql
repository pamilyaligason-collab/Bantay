-- Undo 0024_nutrition.sql. Safe to run twice. THIS DELETES every logged meal, drink and salt goal (the three tables are dropped). Export first if they matter.
begin;
drop table if exists public.food_entries;
drop table if exists public.water_entries;
drop table if exists public.nutrition_goals;
drop function if exists public.nutrition_touch();
commit;
