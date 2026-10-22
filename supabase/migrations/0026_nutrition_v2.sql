-- Family Bantay: more nutrients on a meal row, plus a doctor-set potassium limit and sex on the goal row (session 9, W1 nutrition). Written only; Lloyd applies it. Safe to run twice. Undo: 0026_nutrition_v2.down.sql.
-- Needs 0024_nutrition.sql.
--
-- Rules
-- * Every new column is nullable. Unknown is null, never 0 (B-5). An old phone that does not send them leaves them null; a new phone sends them.
-- * food_entries keeps the snapshot rule: the numbers are already multiplied by the portion on the phone.
-- * nutrition_goals.potassium_mg is a LIMIT a doctor set (for example for kidney disease). Null means no limit; the app then shows potassium as a target to reach, not a limit.
-- * nutrition_goals.sex is only used to pick the NIH reference intake (it differs for women and men). Null means the app asks.
-- * RLS, grants and triggers are the ones 0024 made; this file adds columns only.
-- Sources for the reference intakes (public domain): NIH Office of Dietary Supplements fact sheets (calcium, iron, magnesium, vitamin D, vitamin B12, potassium), National Academies DRI tables. See docs/SOURCES.md.
begin;

alter table public.food_entries
  add column if not exists carbs_g numeric check (carbs_g is null or carbs_g >= 0),
  add column if not exists fat_g numeric check (fat_g is null or fat_g >= 0),
  add column if not exists sat_fat_g numeric check (sat_fat_g is null or sat_fat_g >= 0),
  add column if not exists fiber_g numeric check (fiber_g is null or fiber_g >= 0),
  add column if not exists sugars_g numeric check (sugars_g is null or sugars_g >= 0),
  add column if not exists calcium_mg numeric check (calcium_mg is null or calcium_mg >= 0),
  add column if not exists iron_mg numeric check (iron_mg is null or iron_mg >= 0),
  add column if not exists magnesium_mg numeric check (magnesium_mg is null or magnesium_mg >= 0),
  add column if not exists vitd_ug numeric check (vitd_ug is null or vitd_ug >= 0),
  add column if not exists b12_ug numeric check (b12_ug is null or b12_ug >= 0);

alter table public.nutrition_goals
  add column if not exists potassium_mg integer check (potassium_mg is null or potassium_mg between 500 and 6000),
  add column if not exists sex text check (sex is null or sex in ('female', 'male'));

commit;
