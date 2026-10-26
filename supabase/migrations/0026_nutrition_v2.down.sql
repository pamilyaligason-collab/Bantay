-- Undo 0026_nutrition_v2.sql. Safe to run twice. THIS DELETES the extra nutrient numbers on every logged meal, every doctor-set potassium limit and every saved sex. Meals, water and salt goals stay.
begin;
alter table public.food_entries
  drop column if exists carbs_g, drop column if exists fat_g, drop column if exists sat_fat_g, drop column if exists fiber_g, drop column if exists sugars_g,
  drop column if exists calcium_mg, drop column if exists iron_mg, drop column if exists magnesium_mg, drop column if exists vitd_ug, drop column if exists b12_ug;
alter table public.nutrition_goals drop column if exists potassium_mg, drop column if exists sex;
commit;
