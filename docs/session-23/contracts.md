# Session 23 release contract

Base: origin/main f6242877. One owner per file. Shared names below; nothing else crosses lanes.

| Lane | Owns (only these files plus their own tests) | Must not touch |
|---|---|---|
| A DOSE-DAY | matchDoses callers: family/CarerCards.tsx, family/MemberPage.tsx, family/reportLogic.ts, family/weekSeries.ts, health/GlanceGrid.tsx, health/Medicines.tsx, inbox/build.ts, inbox/MissedDoseActions.tsx, nudge/pillboxLogic.ts, today/nextPick.ts, today/useMyTakes.ts; Snooze: today/snoozeCard.ts, today/useSnoozed.ts, today/NextUp.tsx | health/meds.ts (read only), sync/ |
| B SOS-HOLD | features/sync/sync.ts | anything else |
| C LAB-LAZY | health/labsLogic.ts, health/library/LabExplain.tsx, Article.tsx, Library.tsx (labGlossary.ts wording read only) | health/meds.ts |
| D NEWS-RADIUS | supabase/functions/world-news/rules.ts | src/ |
| E WATER-WORD | nutrition/WaterPanel.tsx, nutrition/WaterSheet.tsx | water goal math |
| F UNITS-CITIES | scripts/local-data/units.mjs, public/geo/units.json, docs for it | src/ |
| G BG-PLACE | package.json + lockfile, capacitor.config.*, android/, new src/features/family/bgPlace*.ts, one hook line in family/placeApi.ts, privacy policy text | other family/ files |

## Shared names
- `manilaDay(v: string | Date): string` from `src/features/health/meds.ts` is the one Manila-day helper for dose code (lane A). Do not add another.
- `SNOOZE_MAX = 3` exported from `src/features/today/snoozeCard.ts` (lane A, D-148). Same number as `REPEATS` in reminders.ts.
- `MISSED_QUIET_MS` stays 30 min (D-148): no change.
- Urgent tables: `TABLES[t].urgent` in sync.ts (lane B). An urgent row is never dead-lettered for any error class.
- APK version 2.8.0, versionCode 2008000 (lane G, D-149), passed by scripts/release-apk.ps1.
- 0053 names (lane G, D-150, D-151): `live_location_put_device(text, integer, boolean) returns boolean` (key, battery, charging; a null or out-of-range battery keeps the known battery and charging); columns `live_locations.checked_at` (last check-in of any kind) and `live_locations.battery_checked_at` (last valid battery from a check-in); `family_places()` returns `battery_at` (`greatest(battery_checked_at, updated_at)`) and `checked_at`; `device_place_keys.user_id uuid not null` (the issuing login, must equal `people.auth_user_id` on every write); a key also dies 30 days after `created_at`. Client: `Place.batteryAt`, `Place.checkedAt` in placeApi.ts.
