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
reminders, Medical ID `medid/card.ts:32`, Health, inbox `inbox/build.ts`) reads `medications`. Writers of
`people.medicines` (wizard `setup/steps.ts` and `setup/DetailsSheet.tsx`, `admin/MemberPage.tsx:90` and
`admin/api.ts`, `sync/profile.ts`, the import loader) switch to `medications`; the column stays read-only for one
release, then goes.

The database only accepts `confirmed_source` `user` or `auto`, and re-stamps it to `user` on any edit
(`0013_records_autoconfirm.sql:63,96-101`). So the origin goes in a new column `origin`:

| Source | How it enters `medications` | `origin` | confirm stamp |
|---|---|---|---|
| Imported prescription item | Auto-convert (1.2) | `rx` | `confirmed_source='auto'`, `confidence=1` |
| Profile medicine text | One-time copy in migration 0014 (0 people have any today) | `profile` | same |
| Added by hand | Edit sheet Add button | `manual` | `user` (signed-in editor) |

### 1.2 Auto-convert (migration `0014_medications_live.sql`, applied by Lloyd; reversible)
Where it runs: one SQL function `rx_to_medications(p_person uuid default null)`, called once by the migration for
everyone, and by a trigger when a `prescription_items` row is inserted or confirmed (future imports). Not in the client.

1. **One medication per person per drug.** Key = person + `normalise_drug(drug_raw)` (lower case, strength and form
   words stripped; declared IMMUTABLE so it can back an index). 5 person+drug groups repeat today: the newest `rx_date` wins (null dates rank oldest); every
   contributing item is linked in a new table `medication_sources(medication_id, item_id)`.
2. **Times from frequency text** (no item contains a clock time today):
   - once a day / OD / QD / daily / morning -> 08:00; bedtime / HS / at night -> 21:00
   - twice a day / BID -> 08:00, 20:00; three times / TID -> 08:00, 14:00, 20:00; four times / QID -> 08:00, 12:00, 16:00, 20:00 (16:00 has its own chip, 1.4)
   - as needed / PRN -> `as_needed = true`, no times
   - missing or not understood (13 + 4 today) -> **no time**, `needs_time = true`, no reminder; shows "Set a time"
3. **Status.** Course with an end in the past -> `stopped` (`stopped_on` set). Everything else -> `active`, with
   `review = true` (1.3).
4. **Unclear items** keep `drug_raw` as the name and get `needs_check = true`.
5. **Visibility (decided by D1, Lloyd may reverse).** Converted rows are written `status = 'confirmed'`,
   `confirmed_source = 'auto'`, `confidence = 1`, `origin = 'rx'`, so read-only carers see them (they only see
   confirmed rows, `0008:21,537`); the source item keeps its own status.
6. **Idempotent.** Partial unique index on (person, normalised name) where `deleted_at is null`; rows with
   `edited_at` set are never overwritten; a deleted medication keeps a tombstone (`deleted_at`) so re-import does not
   bring it back. Down migration drops rows with `origin in ('rx','profile')` and `edited_at is null`.
7. **Quantity** maps to `stock_qty` only when it is a plain number; `per_day` = number of times.

Schedule shape v1 (`schedule jsonb`, default changes from `'[]'` to `'{"v":1,"times":[]}'`):
`{"v":1,"times":["08:00","20:00"],"needs_time":false,"needs_check":false,"review":true,"review_since":"2026-10-21"}`.
Times are local clock strings; the app converts to minutes (`model.ts:243`) in one helper.

New columns on `medications`: `origin`, `deleted_at`, `edited_at`. New table `medication_changes(medication_id, by, at, field,
old, new)` for history (B-7: stored in the database, never sent in notifications).

### 1.3 "Still taking it?" review (Lloyd confirmed "keep", 2026-10-20)
The newest prescription is about 11 months old and 6 have no date, so every converted active medicine carries
`review = true`:
- It shows "From a prescription dated MMM YYYY. Still taking it?" with **Yes / Change / Stopped**.
- **Default: reminders stay on for reviewed-or-timed medicines** (Lloyd chose auto-convert). If a review is still
  open 3 days after `review_since`, the reminder for that medicine pauses and Today shows "N medicines to check" to the person and
  their carers.
- Today shows one card "N medicines to check" until the list is reviewed.

### 1.4 Screens
- **Health > Medicines** (per person): Today (doses with Take / Skip), Active, Paused, Past. Each row opens the
  **edit sheet**: name, strength, dose, times (chips Morning 08:00, Noon 12:00, Afternoon 14:00, Late afternoon
  16:00, Evening 20:00, Night 21:00, Custom), As needed, Pause, Stop, Delete (Undo toast), source line. Add button for a manual medicine.
- **Today > Next up**: the next dose due in the next 3 hours, or missed in the last 2 hours, for me and the people I
  care for. Upcoming counts, not only overdue (fixes PART-1 "why weather wins").
- **Medical ID**: active medicines from the same table.
- **Wizard medicines step**: writes `medications` with a time chip per medicine.

### 1.5 Data, sync, permissions, reminders
- Dexie: `medications` table in `bantay-log`; sync spec in `sync/tables.ts` with `cursor: 'updated_at'`,
  merge-duplicates and `deletedAt` soft delete (same pattern as `family_tasks`).
- Edit rights: the person, admins (`records_editor`) and writer carers. Logging a dose: unchanged (person or writer
  carer, `0003:88-89`); admins are viewers for doses (kept on purpose).
- `meds_taken` gains `medication_id`, `slot` and `skipped` (nullable or defaulted for old rows; the update grant at
  `0003_sync.sql:83` widens to these columns); matching moves from name to id. Skips become
  `meds_taken` rows with `skipped = true` so they sync (today they are per device, `NextUp.tsx:66`). The assistant's
  `log_med_taken` resolves the name to a `medication_id` first.
- Reminders (`health/reminders.ts`) read active, timed medications for me **and** the people I care for (carer
  setting "Remind me for ..."); notification text stays generic (B-7). Id range widened from 31000-31099.
- Events: the single list is PART-2 section 4. Adherence is measured from `meds_taken`, not events.

## 2. Today (priority 2; order set by Lloyd 2026-10-20)
1. **Next up + medicines to check**: one card. The next dose due in 3 hours (or missed in the last 2) with Taken /
   Skip; a footer row "N medicines to check" when reviews are open.
2. **Weather** card: temp, condition, place, rain window, and the action line; opens `#weather`. An alert band for my
   place, when one applies, sits inside this card.
3. **Quick log**: six icon buttons (3 x 2, 72px tall, icon above label): BP (gauge), sugar (drop), weight (scale),
   walk (walker), dose (pill), mood (smile). Icons reuse the v6 symbol set; each button has an aria-label.
4. **My week** health KPIs, last 7 days, for the signed-in person (or the person picked in Health): blood pressure
   average with range chip, fasting sugar average, weight change, steps a day vs goal, doses on time (x of y from
   `meds_taken` vs schedule), resting heart rate (if sensors are on). Each tile has a 7-day sparkline and opens the
   matching Health metric. Tiles with no data for this person are hidden, never shown as zero; a "next reading due"
   line nudges H6.
5. **Family** line: "Family: 2 of 3 OK today" plus the one thing that needs attention; opens Family (full list there).
6. **Plan today**: tasks and events, Open plan.
7. **More**: I'm OK today, alerts setup, Ask hint, update and install banners, week line.

Weather leaves Next up except for a storm within 500 km (then Next up shows the storm). Simple mode: next dose (big
Taken button), I'm OK, Call family, SOS, plus the weather action line.

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
cached, shared by every surface. `location/place.ts` passes the place's own timezone. Heat index computed in a pure helper (Rothfusz with the low-humidity adjustments),
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

### 4.1 Quick dial: one local set (Lloyd 2026-10-20)
Six local sets ship as defaults: **General Santos, Tagbilaran, Davao, Cebu City, Manila, Texas (USA)**, plus
**Philippine national**, **OFW** and **Teleconsult** sets. Numbers and sources: `HOTLINES.md` and
`hotlines-proposed.json` in this folder (each row has a source URL, status CONFIRMED or UNVERIFIED, and a read date).

Which set shows (pure function `pickLocalSet(position)`, unit tested):
1. Take the phone position (GPS if allowed, else the chosen home zone, as today in `resolvePlace()`).
2. If it is inside exactly one area, show **that one local set only**. Areas: a 30 km circle round each Philippine
   city centre (25 km for Manila, so it does not swallow nearby cities), and the Texas state bounding box. If two
   circles overlap, the nearest centre wins.
3. If it is inside no area:
   - in the Philippines (existing PH bounding box): show **national + OFW + teleconsult** and an "Add local numbers"
     button for admins;
   - abroad, not Texas: show **OFW** (DMW/OWWA, DFA, the nearest Philippine embassy finder link) and an online
     source for the local emergency number of that country, never a guessed number.
4. Order on screen: local set (if any), then national (PH only), then OFW, then teleconsult. Group headers say why a
   set shows ("You are in Davao", "You are outside our local lists").
5. The home-zone alert logic (`HOME_ZONES`, twin of `alerts-ingest`) is unchanged; hotline areas are a separate list
   (`HOTLINE_AREAS` in `location/geo.ts`) so adding a city never changes alert watching.
6. Each number keeps `status`; UNVERIFIED rows show a small "check" mark, and admins can edit any row
   (`safety_overrides`, already synced). A yearly re-check is a release task.

## 5. Health, Family, Records (priority 5)
### 5.1 Health tab structure (mockup screens health, metric, addreading, anatomy, library, article, videos, papers)
1. Person chips + "Showing: Name".
2. **My KPIs** grid shows the **latest** record per measure with its time ("126/80 · today 7:30 AM"): BP, fasting
   sugar, weight, steps, doses on time, resting heart; sparkline + range chip; opens the metric detail (30-day chart with normal band, AM/PM toggle, readings list, Add reading, Share with doctor).
3. **Body map** (kept from v6) shows the **7-day average** per measure, coloured by status, opening **Explore your body** (`features/anatomy/*`, kept and extended): system chips,
   organ highlight, "what it does" in 2 lines, "your numbers" link, "medicines that act here", "learn more".
4. **Medicines** summary (ring: 2 of 3 today), opening Health > Medicines.
5. **Vitals** with range bars and a toggle **Latest | Average | Normal**: Latest and Average move the marker and
   value; Normal shows the standard ranges (BP normal below 120/80, elevated 120-129 systolic; fasting sugar
   70-100 mg/dL (3.9-5.6 mmol/L), shown in mg/dL like v2 and the lab papers; resting pulse 60-100 bpm) with a one-line explanation. Ranges come from `health/ranges.ts` and are
   re-checked against the source cited there before build. Labs keep plain-language flags.
6. **Learn**: Health library (MedlinePlus Connect summaries keyed by condition and generic name, cached; source and
   "not medical advice" line; English/Filipino) and Videos (curated fixed playlists, YouTube embed, no search API).
7. Papers (records) with progress ring; Refills; Doctor visits.

### 5.2 Tidy
- Health header says whose health it is ("Showing: Name") with the person chips; Medicines section first, then
  vitals, then labs. Lab High/Low flags get a one-line plain meaning and the range.
- Records moves under Health as "Papers" (it duplicates Health inside Family today). Family = People + Plan.
- Records check queue: confirm by document ("Confirm all 12 from this paper") instead of 229 single items; the
  queue shows a progress count.
- People: grey avatars get a nudge ("Not checked in today: send a hello").

## 6. Ask (priority 6)
Fix the gap above the keyboard; keep the last 20 messages on the device; replace "I can mix things up" with
"I can be wrong. Check with your doctor for medical decisions." Add a screen event for Ask.

## 7. Feature map: nothing is removed
The mockup (version 6) is the v2 mockup with every v2 screen kept and the S6 changes layered on; its "Feature map"
screen lists each feature as Kept, Improved, Moved or New and taps through to it. Section 8 lists the new features.
| Area | Kept | Improved | Moved | New |
|---|---|---|---|---|
| Today | Quick log, Plan, I'm OK, alert band, update/install banners, week line | Weather card, Next up, family line, simple mode | | My week KPIs |
| Health | Body map, Explore body, metric screens, trends | Medicines (edit, pause, delete, reminders), lab flag meaning | Papers (Records) from Family | |
| Family | People, member page, call/text, Plan (tasks, events, notes) | Check-in nudge | Records -> Health | |
| Safety | SOS hold + SMS, I'm safe, Call 911, Medical ID, go-bag, practice | Warnings, news, storm map, rescue map, quick dial, places, hazards (local) | Weather page -> Weather screen | |
| Ask, Me, other | Me settings, Inbox, Docs, Admin, sign-in, wizard, sync, updates | Ask history, keyboard gap | | |
Only duplicates go: weather inside Next up, the second weather panel in Safety, the family list on Today.

## 8. New features (Lloyd 2026-10-20: "more comprehensive"), priority 7
All use tables that already exist; no new external services.
| Feature | What the user sees | Data | Persona |
|---|---|---|---|
| Missed-dose alert to carer | "Lola Rosa has not marked her 8 AM dose (2 h)" push to writer carers; generic text on the lock screen (B-7) | `medications`, `meds_taken`; new edge function `dose-watch` on a 15-min schedule; advisory: the slot is claimed before the push, so a push lost on the network is not repeated (all-network-error sends release the claim); only confirmed medicines (review not true) are watched | P1, P3 |
| Reminder actions | Lock-screen reminder with Taken / Snooze 15 min / Open; Taken logs without opening the app | Capacitor LocalNotifications action types | P2 |
| Refill and stock | "7 days left: refill by Oct 27", add to Plan; go-bag "medicines for 7 days" check | `medications.stock_qty`, `per_day`, `stock_set_at` | P3 |
| Doctor visits | Next visit card, "bring" checklist, follow-ups created from `prescriptions.follow_up_on` | `appointments` (0 rows today; `source_prescription_id` exists) | P3, P1 |
| Visit summary | One page for the doctor: 30-day BP/sugar trends, active medicines, adherence; share as image/PDF from the phone | readings, `medications`, `meds_taken` | P3 |
| Health metric detail | 30-day chart with the normal band, morning/evening toggle, plain-language summary, add reading sheet | readings, `health/ranges.ts` | P2, P3 |
| Papers progress | "180 of 229 checked" ring; confirm all items from one paper | `records_queue` | P1, P3 |
| Storm tracker graphic | Track, cone and distance to each home; signal legend | GDACS rows already ingested | P1, P4 |
| SOS status | Who received the location (sent / delivered when SMS reports it), I'm safe | `sos.history` (local) | all |
| Go-bag progress | Illustrated checklist by category | `gobag/state.ts` | P4 |
| Offline state | "Offline, showing 7:05 PM data"; Taken still works and shows "queued" | outbox | P1 |
| Inbox | Grouped notifications by type with unread dots | existing inbox | all |
| Language | English / Filipino for the medicine, weather and safety lines (strings only, start with those three areas) | new string table | P2 |
| Medical ID on lock screen | Toggle to show the ID card from the lock screen (Android) | `medid` | all |

## 9. Out of scope this build
Brand names for PH drugs (no open source), live hospital lookup (Overpass is static only), evacuation lists (none
published), YouTube search (quota; fixed playlists only).
