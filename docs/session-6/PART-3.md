# Session 6, Part 3: information architecture plan

As of 2026-10-20. Implements Lloyd's decisions D1-D3 (MASTER-PLAN.md). Ordered by build priority.
File references are to the current code (PART-1 section 3). Gaps found by the audit are folded in (AUDIT.md).

## 0. Navigation (unchanged shape, fixed behaviour)
Tabs stay: Today, Health, Ask (raised), Family, Safety. Me and Inbox from the top bar.
Fixes everywhere: content gets bottom padding equal to the tab bar height so nothing hides under it; the greeting
header shows once (Today only); sub-screens use the shared `SubHeader` with a back button.

## 1. Medicines: prescription -> scheduled medicine (D1, priority 1)

### 1.1 One source of truth
`public.medications` becomes the only schedule. Everything that used to read `people.medicines` (NextUp, Hero,
reminders, Medical ID `medid/card.ts:32`, Health) reads `medications`. Writers of `people.medicines` (wizard,
`MemberPage.tsx:90`, import loader) switch to `medications`; the column stays read-only for one release, then goes.

| Source | How it enters `medications` | `confirmed_source` |
|---|---|---|
| Imported prescription item | Auto-convert (1.2) | `rx_auto` |
| Profile medicine text | One-time copy in the same migration (0 people have any today) | `profile` |
| Added by hand | Edit sheet Add button | `manual` |

### 1.2 Auto-convert (migration `00xx_medications_from_rx.sql`, applied by Lloyd; reversible)
Where it runs: one SQL function `rx_to_medications(p_person uuid default null)`, called once by the migration for
everyone, and by a trigger when a `prescription_items` row is inserted or confirmed (future imports). Not in the client.

1. **One medication per person per drug.** Key = person + normalised `drug_raw` (lower case, strength and form
   words stripped). 5 person+drug groups repeat today: the newest `rx_date` wins (null dates rank oldest); every
   contributing item is linked in a new table `medication_sources(medication_id, item_id)`.
2. **Times from frequency text** (no item contains a clock time today):
   - once a day / OD / QD / daily / morning -> 08:00; bedtime / HS / at night -> 21:00
   - twice a day / BID -> 08:00, 20:00; three times / TID -> 08:00, 14:00, 20:00; four times / QID -> 08:00, 12:00, 16:00, 20:00
   - as needed / PRN -> `as_needed = true`, no times
   - missing or not understood (13 + 4 today) -> **no time**, `needs_time = true`, no reminder; shows "Set a time"
3. **Status.** Course with an end in the past -> `stopped` (`stopped_on` set). Everything else -> `active`, with
   `review = true` (1.3).
4. **Unclear items** keep `drug_raw` as the name and get `needs_check = true`.
5. **Visibility.** Converted rows are written `status = 'confirmed'`, `confirmed_source = 'rx_auto'` (Lloyd's D1 is the
   confirmation), so read-only carers see them; the source item keeps its own status.
6. **Idempotent.** Partial unique index on (person, normalised name) where `deleted_at is null`; rows with
   `edited_at` set are never overwritten; a deleted medication keeps a tombstone (`deleted_at`) so re-import does not
   bring it back. Down migration drops rows with `confirmed_source = 'rx_auto'` and `edited_at is null`.
7. **Quantity** maps to `stock_qty` only when it is a plain number; `per_day` = number of times.

Schedule shape v1 (`schedule jsonb`): `{"v":1,"times":["08:00","20:00"],"needs_time":false,"needs_check":false,
"review":true}`. Times are local clock strings; the app converts to minutes (`model.ts:243`) in one helper.

New columns on `medications`: `deleted_at`, `edited_at`. New table `medication_changes(medication_id, by, at, field,
old, new)` for history (B-7: stored in the database, never sent in notifications).

### 1.3 "Still taking it?" review (default chosen, Lloyd to confirm)
The newest prescription is about 11 months old and 6 have no date, so every converted active medicine carries
`review = true`:
- It shows "From a prescription dated MMM YYYY. Still taking it?" with **Yes / Change / Stopped**.
- **Default: reminders stay on for reviewed-or-timed medicines** (Lloyd chose auto-convert). If a review is still
  open after 3 days, the reminder for that medicine pauses and Today shows "N medicines to check" to the person and
  their carers. Alternative if Lloyd prefers: reminders off until reviewed.
- Today shows one card "N medicines to check" until the list is reviewed.

### 1.4 Screens
- **Health > Medicines** (per person): Today (doses with Take / Skip), Active, Paused, Past. Each row opens the
  **edit sheet**: name, strength, dose, times (chips Morning 08:00, Noon 12:00, Afternoon 14:00, Evening 20:00,
  Night 21:00, Custom), As needed, Pause, Stop, Delete (Undo toast), source line. Add button for a manual medicine.
- **Today > Next up**: the next dose due in the next 3 hours, or missed in the last 2 hours, for me and the people I
  care for. Upcoming counts, not only overdue (fixes PART-1 "why weather wins").
- **Medical ID**: active medicines from the same table.
- **Wizard medicines step**: writes `medications` with a time chip per medicine.

### 1.5 Data, sync, permissions, reminders
- Dexie: `medications` table in `bantay-log`; sync spec in `sync/tables.ts` with `cursor: 'updated_at'`,
  merge-duplicates and `deletedAt` soft delete (same pattern as `family_tasks`).
- Edit rights: the person, admins (`records_editor`) and writer carers. Logging a dose: unchanged (person or writer
  carer, `0003:88-89`); admins are viewers for doses (kept on purpose).
- `meds_taken` gains `medication_id` and `slot` (nullable for old rows); matching moves from name to id. Skips become
  `meds_taken` rows with `skipped = true` so they sync (today they are per device, `NextUp.tsx:66`). The assistant's
  `log_med_taken` resolves the name to a `medication_id` first.
- Reminders (`health/reminders.ts`) read active, timed medications for me **and** the people I care for (carer
  setting "Remind me for ..."); notification text stays generic (B-7). Id range widened from 31000-31099.
- Events: `dose_logged`, `dose_skipped`, `med_added`, `med_edited`, `med_paused`, `med_deleted`, `reminder_opened`
  (PART-2). Adherence is measured from `meds_taken`, not events.

## 2. Today (priority 2)
Order: Alert band (only when an alert applies to my place) -> **Next up** (dose first) -> **Family status**
(everyone's "OK today" and doses done, one row each) -> **Weather line** (one compact card: temp, condition, and
the action line; tap opens Weather) -> Quick log -> Plan today -> Week line.
Weather leaves Next up except for a storm within 500 km; it appears once on Today, as the weather line.
Simple mode: Next dose (big Taken button), I'm OK, Call family, SOS.

## 3. Weather (D2, priority 3)
### 3.0 Where weather lives (6 surfaces today, AUDIT.md C)
| Surface | Becomes |
|---|---|
| Weather screen (new `#weather`) | The only full weather view (hero card) |
| Today Next up (`NextUp.tsx:69,90`) | Removed, except storm within 500 km |
| Today weather line (new) | One compact line: temp, condition, action line; opens `#weather` |
| Simple-mode Hero (`Hero.tsx:32`) | Action line only, when one applies |
| Safety tile (`SafetyHub.tsx:69`) + Safety weather page (`SafetyPages.tsx:220-221`) | Tile opens `#weather`; Windy/Ventusky move behind "Open live map" |
| Assistant card (`Assistant.tsx:157`) | Kept, reads the same cached forecast |

### 3.1 Data
Open-Meteo request (`weather.ts:15`) adds: current `relative_humidity_2m`, `apparent_temperature`,
`wind_speed_10m`, `wind_gusts_10m`, `uv_index`; hourly `precipitation_probability`, `temperature_2m`; daily
`temperature_2m_min/max`, `uv_index_max`; `forecast_days=7`; `timezone=auto` (fixes Manila-only when abroad). One fetch,
cached, shared by every surface. Heat index computed in a pure helper (Rothfusz with the low-humidity adjustments),
unit tested. Air quality from alerts-ingest when present.

### 3.2 Screen
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
Everything follows `resolvePlace()` (GPS, else chosen home zone). Zones stay in `geo.ts:13-17` and must match
`alerts-ingest/parse.ts` (the zone twin test guards this).
| Item | Today | Plan |
|---|---|---|
| Hotlines (Quick dial) | 8 of 12 tagged zone 1, none zone 2 | Add zone 2 hotlines; national numbers (911, Red Cross) tagged `all`; show zone first then national. |
| Places (hospital, evacuation) | 6, all zone 1 | Add zone 2 hospitals (static OSM extract per zone, ODbL credit); evacuation centres "ask your barangay/DRRMO" until a list exists. |
| Hazard cards | zone 1 only | Add zone 2 (flood, landslide, quake, storm surge as applicable from HazardHunterPH). |
| Storm map | pinned 12N 128E | Centre on my place; storm track overlay unchanged. |
| News | top 5 from `news_items`, no zone column, all caps | Add `zone` to `news_items`; n8n tags by place keywords and adds a zone 2 feed; app shows my zone, sentence case, max 3. |
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
