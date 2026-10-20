# Session 6, Part 1: what the app does now, and what we may use

As of 2026-10-20. No app code in this phase. Public repo, so there are no real names, health values or screenshots here.
Members are anonymised. Lloyd approves this part before Part 2 starts.

## 1. Headline
- **Medicines cannot be reminded or logged.** 19 prescriptions (31 items, 5 people) were imported, but `medications` has 0 rows and
  `meds_taken` has 0 rows. None of the items has a generic name, and 8 are unclear. The newest prescription is from 2024-11; none is
  from the last 180 days.
- **Fix #1 (Lloyd, D1): auto-convert every prescription item into a scheduled medicine, with edit, pause and delete.**
  Stale items are handled by a "Still taking it?" review (PART-3 1.3). A generic name is needed before any label lookup
  (openFDA, DailyMed, MedlinePlus).
- Usage tracking is only 4 days old (see HANDOFF.md), so the habit baseline is thin.

## 2. Screenshot audit (22 phone shots, Android; Me and Admin not captured)
| Tab | Top problems |
|---|---|
| Today | Weather fills Next up while the plan shows empty, though Health lists 2 medicines due. Greeting header repeats. |
| Health | It is unclear whose health is shown. Lab rows are heavy and High flags are unexplained. Medicines are buried, with no Take button. |
| Family | Records duplicates Health and asks for 229 items to be checked. People are all grey, with no nudge. |
| Safety | Quick dial placeholder rows render as one-character vertical text and the Add button is clipped (severe). Content is not local: the map shows the wrong island, the news is irrelevant and in all caps, the hospital is in another province. The footer shows `docs/SOURCES.md`. Weather appears on several screens (6 surfaces in code, AUDIT.md C). The Hazards title is truncated. |
| Ask | Gap above the keyboard, no history, and the line "I can mix things up" undermines trust. |
| Everywhere | The bottom nav overlaps content. |

## 3. Code inventory (src/)
Hash routes (`features/shell/routes.ts`). Tabs: Today, Health, Ask (raised button, opens the assistant sheet), Family, Safety.
Me, Inbox and Admin have no tab.

| Screen | Main parts (in order) | Data | Actions |
|---|---|---|---|
| Today | PwaBanner, AlertBand, GreetingBand, NextUp, UpdateCard, AlertsBanner, QuickLog, PlanToday, NearbyList (alerts only), WeekLine. Simple mode: Hero plus I'm OK / Call family / SOS | kv, `ldb.activity`, `ldb.meds`, `fdb.tasks/events`, Open-Meteo | I'm OK, Mark taken, Skip, quick log (BP, sugar, weight, walk, dose, mood), tick task |
| Health | PersonChips, BodyMap, LatestList, Medicines | `hdb.*`, `carers`, confirmed `prescription_items` | Mark taken, open metric |
| Family | Records / Plan / People segments | `records_queue`, documents, labs, prescriptions; `fdb` | Confirm imports, add tasks/events/notes, call/text |
| Safety | ZonePicker, SOS (hold 3 s), Call 911, Medical ID, 10 hub tiles | bundled `hotlines.json`, `places.json`, `hazards.json`; `news_items`; `safety_alerts` | SOS by SMS, dial, maps |
| Me | Profile, sharing, SOS contacts, modes, sensors, passkey | `people`, kv | Edit profile, toggles |
| Ask | Chat, chips, mic, draft cards | n8n webhook, `hdb`, Open-Meteo | Confirm drafts (reading, dose, activity), add task |

**Where medicines come from (root cause of 0 doses):**
1. Scheduled doses come only from free-text profile entries (`people.medicines`). A time is parsed from the text ("Name 8:00");
   the onboarding chips carry no time, so those entries are never due (`health/model.ts:248-270`).
2. `public.medications` (with `schedule` and `source_item_id -> prescription_items`) exists in SQL but nothing in the app,
   edge functions or triggers reads or writes it. **No code converts a prescription into a scheduled medicine.**
3. Confirmed prescription lines appear in Health > Medicines as untimed rows with Mark taken (when the user may mark;
   `Medicines.tsx:27-33,74-75`) and read-only in Records. NextUp, Hero, reminders and `Health.tsx:34` ignore them.
4. A dose is logged through `logMedTaken` -> `ldb.meds` -> outbox `meds_taken`, matched to a slot by name, today only.
5. Native reminders (Android) cover the signed-in person's own timed profile entries only, never people they care for.

**Why weather wins Next up** (`today/nextPick.ts`): the order is dose, plan, storm, weather. But a dose counts only if it has a
time *and* that time has passed. Untimed or later-today doses never show, while weather qualifies at 60% rain or 33 °C, which
is common in a Philippine city (frequency not measured).

**Events** (`features/admin/events.ts`): `dose_logged`, `reading_added`, `sos_sent` (and the `import_*` names) are allowed
but never sent. Natural homes: `logMedTaken`, `logReading`, `SosScreen`. SOS only writes local history.

**Safety is fixed to one place:** 8 of 12 hotlines and all 6 places and hazard cards are tagged for the first home zone;
none for the second. There is no nearby-hospital lookup. The storm map is pinned to 12°N 128°E. This explains the
"wrong island / other province" findings in the screenshots.

## 4. Reference: weather screens in Lloyd's other two apps
Lloyd shared 5 shots (2026-10-20) from a house app and a rental app. They set the bar Bantay's weather should meet.

What they do well:
1. **One hero card**: place name, big temperature, condition plus feels-like, then a 2x3 or 2x4 tile grid (wind, gusts, rain next 6 h, feels like, humidity, UV, air quality).
2. **Plain-language callout** above the detail: "Rain is likely in the next 6 hours (88%)" and a "Rain watch: 2 pm to 5 pm" card. This answers "do I need to act?" before showing numbers.
3. **Next 24 hours** horizontal strip with rain % under each hour, then **7 days** rows with a min to max range bar.
4. **Place toggle** (My location / the house), which suits a family spread over several places.
5. **Source footer in plain words**: "Forecast: Open-Meteo, Map: Windy. Your rounded location is sent only to these weather services."
6. Live map (Windy embed with Rain, Wind, Temp, Waves) and a curated link list (PAGASA, NOAH, Windy and others).

What not to copy:
- Feels like 41 next to UV 6 "High" with no "what to do". A family app should say it: "Heat: drink water, avoid noon sun".
- The house app's sun art competes with the numbers. The tile grid is dense for older members.
- The link list is long and mostly marine (passage planning, ocean charts); family members need PAGASA and NOAH first.
- The rental app's tab bar covers the hourly strip (same overlap bug as Bantay).

## 5. Weather UI research (best practice, 2026-10-20)
Sources are design guides and forums, not controlled studies (confidence MEDIUM).
1. Order: current conditions, then hourly strip, then daily outlook; details behind a tap (progressive disclosure).
2. Show *when* rain starts, not just a rain icon (the strip with % per hour does this).
3. Feels-like needs context: the heat index assumes shade and rest; direct sun adds more. Pair the number with an action.
4. Health-oriented "what to do" lines for heat and air quality tested well in one small study.
5. Light and dark modes both help readability.
6. Local anchor for actions: PAGASA heat index bands (Caution, Extreme caution, Danger, Extreme danger). Re-verify the
   band limits on the PAGASA site before using them.

Sources: [climeradar](https://climeradar.com/blog/designing-an-effective-weather-app-home-screen-1),
[screensdesign](https://screensdesign.com/articles/weather-app-dashboard-design-examples/),
[Fathom](https://fathom.info/latest/6218),
[weatherstationadvisor](https://weatherstationadvisor.com/what-your-weather-app-is-not-telling-you/),
[UMM thesis](https://eprints.umm.ac.id/id/eprint/17215/),
[KDE MR 608](https://invent.kde.org/plasma/kdeplasma-addons/-/merge_requests/608/commits).

## 6. Licence and API table (2026-10-20)
Quotes came from summarising fetches. Check the live terms page before building on any row.
| Source | Verdict | Terms / limits |
|---|---|---|
| PAGASA | Link only | No public API; terms page returned 404. |
| PANaHON | Link only | |
| Project NOAH | Link only | Terms unverified. |
| HazardHunterPH | Link only | |
| DOH | Link only | Site returned 403 to the fetcher. |
| NASA GIBS / Worldview | Usable | Free; the endpoint is unverified. |
| MedlinePlus Connect | Usable | 100 requests per minute per IP; cache results; do not copy pages. |
| openFDA | Usable | CC0. Without a key: 240 per minute and 1,000 per day per IP; a free key raises the day limit to 120,000. |
| DailyMed | Usable | v2 web services. |
| WHO | Quote or link | CC BY-NC-SA: link, or quote short extracts with credit. |
| YouTube | Embed only | `search.list` costs 100 units; the default quota is 10,000 units a day (about 100 searches). Use fixed playlists (`playlistItems.list`, 1 unit). |
| Overpass / OSM | Static extract | ODbL; ship a static extract, not live calls. |
| GDACS | Usable | RSS and CAP feeds. |
| Open-Meteo | Usable, non-commercial | CC BY 4.0; free tier is non-commercial. Bantay is a free family app. |

Risks:
- The drug sources are US-based, so there are no PH brand names; the generic name is the join key.
- Several sources are non-commercial only; fine for a free family app, a blocker if that ever changes.
- There are no published evacuation-centre lists for the family's two areas. Ask the local DRRMO.
- YouTube and openFDA rows were re-checked on 2026-10-20 by web search (the official pages are blocked from the cloud session).

## 7. Decisions (Lloyd, 2026-10-20; see MASTER-PLAN.md)
1. D1: auto-convert all prescription items, with manual edit, pause and delete.
2. D2: one hero card, an action line first, hourly then 7 days, weather shown once.
3. D3: Safety localisation planned in Part 3 (map, news, hospital follow the member's place).
