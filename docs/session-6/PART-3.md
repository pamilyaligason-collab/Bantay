# Session 6, Part 3: information architecture plan

As of 2026-10-20. Implements Lloyd's decisions D1-D3 (MASTER-PLAN.md). Ordered by build priority.
File references are to the current code (PART-1 section 3). Gaps found by the audit are folded in (AUDIT.md).

## 0. Navigation (unchanged shape, fixed behaviour)
Tabs stay: Today, Health, Ask (raised), Family, Safety. Me and Inbox from the top bar.
Fixes everywhere: content gets bottom padding equal to the tab bar height so nothing hides under it; the greeting
header shows once (Today only); sub-screens use the shared `SubHeader` with a back button.

## 1. Medicines: prescription -> scheduled medicine (D1, priority 1)

### 1.1 One source of truth
`public.medications` becomes the only schedule. Profile medicine text and prescription lines feed it; nothing
else schedules a dose.

| Source | How it enters `medications` | `confirmed_source` |
|---|---|---|
| Imported prescription item | Auto-convert (1.2), server side, idempotent on `source_item_id` | `rx_auto` |
| Profile medicine text (wizard, Me) | One-time migration, then the wizard writes `medications` directly | `profile` |
| Added by hand (new Add button) | Edit sheet | `manual` |

### 1.2 Auto-convert rules (SQL function `rx_to_medications(person)` + trigger on `prescription_items`)
1. One medication per person per normalised drug name (lower case, strength stripped). If several prescriptions
   carry the same drug, the newest `rx_date` wins; older items are linked as history, not duplicated.
2. Frequency text to times (Asia/Manila):
   - once a day / OD / QD / morning -> 08:00; at night / HS / bedtime -> 21:00
   - twice a day / BID -> 08:00, 20:00
   - three times / TID -> 08:00, 14:00, 20:00
   - four times / QID -> 08:00, 12:00, 16:00, 20:00
   - as needed / PRN -> `as_needed = true`, no times
   - missing or not understood (13 of 31 today) -> 08:00 with `needs_time = true` in `schedule`
3. Duration: if the course has an end (`duration` like "7 days") and that end is in the past, `med_status = 'stopped'`
   with `stopped_on` set; otherwise `active`.
4. Items flagged unclear keep `drug_raw` as the name and get `needs_check = true`.
5. Never overwrite a row a person has edited (`confirmed_at` not null); re-running is a no-op for those rows.
6. Writes an audit row (who, when, from which item) through the existing `created_by` and `confirmed_*` columns.

Schedule shape (`schedule jsonb`): `{"times":["08:00","20:00"],"days":"daily","needs_time":false,"needs_check":false}`.

### 1.3 The "Check medicines" step (makes stale auto-conversions safe)
Because the newest prescription is from 2024-11, every auto-converted medicine shows a small "From a prescription
dated MMM YYYY. Still taking it?" line until someone confirms, edits, pauses or deletes it. Today shows one card,
"N medicines to check", for the carer (P1, P3) and for the person; it disappears when the list is reviewed.
Reminders fire only for active medicines; unreviewed ones still remind (Lloyd chose auto-convert) but say
"(from prescription)" in the edit sheet, never in the notification text.

### 1.4 Screens
- **Health > Medicines** (per person): sections Today (doses with Take / Skip), Active, Paused, Past. Each row
  opens the **edit sheet**: name, strength, dose, times (chips: Morning 08:00, Noon 12:00, Afternoon 14:00,
  Evening 20:00, Night 21:00, or custom), as needed, Pause, Stop, Delete (with Undo toast), source line.
  An Add button creates a manual medicine.
- **Today > Next up**: shows the next dose due in the next 3 hours or any missed in the last 2 hours, for me and for
  the people I care for. Upcoming doses count, not only overdue ones (fixes PART-1 "why weather wins").
- **Medical ID**: lists active medicines from the same table.
- **Wizard medicines step**: writes `medications` rows with a time chip per medicine (no untimed chips).

### 1.5 Data and sync
- Dexie: new `medications` table in `bantay-log`; sync spec in `sync/tables.ts` (pull and push, carers may write
  for the people they care for, same rule as `meds_taken`).
- `meds_taken` gains `medication_id` and `slot` (nullable for old rows); "taken" is matched by id, not by name.
- Reminders (`health/reminders.ts`) read active `medications`, not profile text.
- Events: `dose_logged`, `dose_skipped`, `med_reviewed`, `med_edited`, `med_paused`, `med_deleted` (PART-2).

## 2. Today (priority 2)
Order: Alert band (only when an alert applies to my place) -> **Next up** (dose first) -> **Family status**
(everyone's "OK today" and doses done, one row each) -> **Weather line** (one compact card: temp, condition, and
the action line; tap opens Weather) -> Quick log -> Plan today -> Week line.
Weather leaves Next up except for a storm within 500 km; it appears once on Today, as the weather line.
Simple mode: Next dose (big Taken button), I'm OK, Call family, SOS.

## 3. Weather (D2, priority 3)
One screen, `#weather` (Safety's weather tile and Today's weather line both open it; the old duplicate panels go).
1. **Place toggle**: My location / Home 1 / Home 2 (from `HOME_ZONES`).
2. **Action line first**, plain words, from the worst of:
   - Heat index (computed from temperature and humidity, Rothfusz formula) mapped to PAGASA bands: Caution,
     Extreme caution, Danger, Extreme danger, each with one action ("Drink water often", "Avoid noon sun",
     "Stay indoors 11 am-3 pm"). Band limits re-checked on the PAGASA site before build.
   - Rain watch: "Rain likely 2-5 pm (88%)" from the hourly probability.
   - UV 8+: "Strong sun: shade and a hat 10 am-3 pm".
   - Active warning for my place (from `safety_alerts`).
3. **Hero card**: place, big temperature, condition, feels like, high/low, updated time. No decorative art competing
   with the numbers.
4. **Detail tiles** (2 columns): rain next 6 h, wind and gusts, humidity, UV.
5. **Next 24 hours** strip with rain % under each hour.
6. **7 days** rows with a low-high range bar and rain %.
7. **Links** (short): PAGASA, Project NOAH, PANaHON. Live map (Windy) behind "Open live map".
8. **Footer**: "Forecast: Open-Meteo. Your rounded location is sent only to the weather service."

## 4. Safety localisation (D3, priority 4)
Everything follows `resolvePlace()` (GPS, else chosen home zone).
| Item | Today | Plan |
|---|---|---|
| Hotlines (Quick dial) | 8 of 12 tagged zone 1, none zone 2 | Add zone 2 hotlines; national numbers (911, Red Cross) tagged `all`; show zone first then national. |
| Places (hospital, evacuation) | 6, all zone 1 | Add zone 2 hospitals; evacuation centres "ask your barangay/DRRMO" until a list exists. |
| Hazard cards | zone 1 only | Add zone 2 (flood, landslide, quake, storm surge as applicable from HazardHunterPH). |
| Storm map | pinned 12N 128E | Centre on my place; storm track overlay unchanged. |
| News | top 5 from `news_items`, not local, all caps | Filter by place keywords in the n8n feed, sentence case, max 3, "why this matters" line. |
| Quick dial layout | placeholder rows render vertical text, Add clipped | Fix row layout; hide empty placeholders; Add button full width. |
| Footer | shows `docs/SOURCES.md` | "Sources" link to an in-app page. |
| Hazards title | truncated | Allow wrap. |

**Data Lloyd must supply (ping):** zone 2 hotlines and nearest hospitals; confirm zone 2 area name. Until then
the zone 2 view shows national numbers plus "Add local numbers" for admins.

## 5. Health, Family, Records tidy (priority 5)
- Health header says whose health it is ("Showing: Name") with the person chips; Medicines section first, then
  vitals, then labs. Lab High/Low flags get a one-line plain meaning and the range.
- Records moves under Health as "Papers" (it duplicates Health inside Family today). Family = People + Plan.
- Records check queue: confirm by document ("Confirm all 12 from this paper") instead of 229 single items; the
  queue shows a progress count.
- People: grey avatars get a nudge ("Not checked in today: send a hello").

## 6. Ask (priority 6)
Fix the gap above the keyboard; keep the last 20 messages on the device; replace "I can mix things up" with
"I can be wrong. Check with your doctor for medical decisions." Add a screen event for Ask.

## 7. Out of scope this build
Brand names for PH drugs (no open source), live hospital lookup (Overpass is static only), evacuation lists (none
published), YouTube search (quota; fixed playlists only).
