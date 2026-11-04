# Local safety data: app integration and refresh job

Status: **built behind `FLAGS.localPacks` (off), 2026-11-05, branch `claude/p2-l-packs`.** Home packs are bundled; the outlines file `public/geo/units.json` is not shipped yet (run `scripts/local-data/units.mjs` on the geoBoundaries download), so away from the home areas the app says "Not checked for this place yet". Schema `supabase/migrations/0045_local_safety.sql` (applied live 2026-11-01; seeds imported and packs published the same day), job `scripts/local-data/refresh.mjs`
(self-test `src/features/safety/localData.test.ts`), seeds `supabase/seed/local-data/`. Sources and licences: `RESEARCH.md`. Order: `COVERAGE.md`.

## 1. What changes for a member

The Safety pages, the Rescue map and the Hotlines list show the evacuation centres, health facilities, police, fire, DRRMO and local hotlines
**for the province the phone is in**, from data already on the phone. No signal needed after the first download. Moving to another province
switches the list on its own. Home zones (Bohol, South Cotabato, General Santos City) are always on the phone.

## 2. Data on the server

| Thing | Where | Who reads | Who writes |
|---|---|---|---|
| Places + hotlines | `public.safety_places` (PSGC-keyed, one source per row) | anyone, rows with `last_verified_at` | admins; the job (service role) |
| Pack units and work status | `public.coverage` | anyone | admins; the job |
| Pack list | `public.region_packs` (code, version, sha256, size, path) | anyone | the job only |
| Pack files | public bucket `region-packs`: `<code>/<sha256>.json` (immutable, cached 1 year) + `index.json` (cached 5 min) | anyone, by URL | the job only |
| Member reports | `public.safety_reports` (pending → accepted / rejected) | the reporter, admins | members insert their own; admins review |

Pack file (format 1, canonical JSON, same rows give the same bytes):
`{format, province, name, neighbours[], places[{id, psgc, kind, name, address, phones[], lat, lon, capacity, status, source, url, licence, dated, verified, confidence}]}`.
`dated` is the date the source itself carries; `verified` is the day a person or review read the row on that source. Only rows with `verified` are published.
`index.json`: `{format, built, packs[{code, name, version, checksum, size, rows, path, neighbours[], hazards?}]}` (`hazards`: HAZARDS.md section 3). Every pack carries the attribution its
rows need (each row's `licence`); packs with OSM-derived coordinates are offered under ODbL (RESEARCH.md, point 2).

## 3. App side (to build, one lane)

1. **Dexie** (`src/db.ts`): add `version(3)` with one table `packs: 'code'` holding `{code, version, checksum, places, fetchedAt, usedAt, pinned}`.
   Only adds a table; v1/v2 rows are untouched.
2. **Which province am I in, offline**: ship `public/geo/units.json`, province + HUC polygons simplified to about 300 KB (geoBoundaries PHL
   ADM2, CC BY 3.0 IGO, credit on the About page; HUC outlines from the same set or the PSA/NAMRIA COD-AB once its licence is read). A pure
   `unitAt(lat, lon)` does point-in-polygon with a bounding-box pre-check. Outside every polygon (at sea, abroad): keep the last unit.
   **Hysteresis**: switch only after two GPS fixes at least 2 minutes apart both fall in the new unit, so a road along a border does not flap.
3. **Download order** (`src/features/safety/packs.ts`, runs after login and on unit change, never blocks the UI):
   1. fetch `index.json` (5 min cache; offline: skip);
   2. the current unit, if missing or its checksum differs: fetch `<path>`, check `sha256(bytes) === checksum` with `crypto.subtle`
      (a mismatch is thrown away and retried on the next run), store;
   3. the home units, pinned (Bohol, South Cotabato, General Santos City);
   4. the current unit's `neighbours`, only on Wi-Fi or when the member taps "Download nearby areas" (Capacitor Network plugin; on the web,
      `navigator.connection.saveData` false).
   Packs are small (a full province is expected well under 200 KB), so no partial updates: a new version replaces the old one whole.
4. **Clean-up**: unpinned packs not used for 60 days are deleted. Settings shows "Safety data on this phone: N areas, X KB, updated <date>"
   with a delete button per area.
5. **Read path**: `entriesFor(unit)` turns pack rows into today's `Entry` shape, so `spotsFor`, `splitSpots`, `forZone` callers keep working:
   - kind: `evac` → group "Evacuation centres"; `hospital/rhu/bhs/clinic` → "Health and hospitals"; `police` → "Police"; `fire` → "Fire";
     `drrmo/coastguard/redcross/hotline/other` → "Rescue" (hotline list). `kindOf()` in `rescuemap/logic.ts` gains a `kind` field check
     before its name regexes.
   - status: `confirmed` → `CONFIRMED`; `not_confirmed` → `UNVERIFIED` (the existing "not confirmed" badge).
   - `phone` = first of `phones` **only when `dialable()`** (scripts/local-data/lib.mjs: +63/0 plus 9-10 digits, or a 3-5 digit short code);
     otherwise the number shows as copyable text with no call button. 7-digit landlines without the area code, ranges ("to 51") and
     "/ 4869" tails are not dialable as printed (30 seed rows today, listed by `validate`); a reviewer adds a dialable form to the CSV.
   - "Checked <verified>" under each entry, and "Source dated <dated>" when the source carries a date. "May be out of date" shows when
     `verified` is older than 365 days **or** `dated` is older than 2 years (the 2015 Bohol fire table reads "Source dated 2015-12-15, may be out of date").
   - Family overrides (`safety.overrides`) keep working: pack ids are stable slugs.
6. **First run with no signal**: the build step `node scripts/local-data/refresh.mjs packs --from-csv --out src/data/safety/packs` bakes the three
   home packs into the bundle, so a fresh install offline still has home data. The bundled copy is used only when Dexie has no pack for that unit.
   Its checksum can differ from the server pack (the CSV path has no neighbours list), so it is never compared, only replaced.
7. **Report a problem**: a button on each entry and "Add a place" on the map insert into `safety_reports` through the outbox (works offline,
   sends later). An admin desk list shows pending reports; accepting one means editing the seed CSV in a PR (no auto-apply).

### What replaces the static files

| File today | After |
|---|---|
| `src/data/safety/places.json` (6 rows, no coordinates, Dampas only) | Deleted. Its rows are in `bohol.csv` (same facts, re-cited). |
| `src/data/safety/hotlines.json` | Local rows (zones `tagbilaran`, `gensan`, and later `davao`, `cebu`, `manila`) move into packs and are deleted from the file once their unit is **done**. National and non-local sets stay static: `ph`, `ofw`, `tele`, `texas`. |
| `HOTLINE_AREAS` + `pickLocalSet` in `location/geo.ts` | Kept for the static sets above; a unit with a pack wins over a circle area. Circles for Davao, Cebu, Manila are removed when their units are done. |
| `src/data/safety/hazards.json` | **Kept** for earthquake, volcano and tsunami (HazardHunterPH is all rights reserved, no API). Flood, landslide and storm surge move to NOAH hazard packs (`layer = 'hazards'`, HAZARDS.md). |
| `AdminScreen`, `SafetyHub`, `SafetyPages`, `rescuemap/logic.ts` imports of the JSON files | Read through `entriesFor(currentUnit)` + the static national sets. |

### Privacy

The province is worked out on the phone. The server never receives GPS for this feature; pack downloads are anonymous public URLs, so the
storage CDN sees an IP address and which province file was fetched, nothing else. Reports carry the reporter's id (needed for moderation) and an
optional point the member chose.

## 4. Refresh job

`.github/workflows/local-data-refresh.yml`, weekly (Monday 02:00 Asia/Manila) and on demand. It does nothing until the repository has
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` secrets (the owner sets them; never in the app). Steps:

1. `validate`: seed CSVs are well formed (also run in CI with the unit tests).
2. `check-sources`: GET each distinct `source_url` once, 1.5 s apart, own user agent. Failing URLs are listed with their row ids.
   It never scrapes or parses pages: a changed number is found by a person re-reading the page.
3. `stale --days 180`: rows not checked in 180 days (and rows never checked) are listed. The list goes to the job summary; a person re-checks
   them and updates `last_verified_at`. The app shows "may be out of date" at 365 days.
4. `packs --upload`: rebuild every unit from published rows; only units whose sha256 changed get a new version, a new file and a
   `region_packs` row; `index.json` is rewritten.

Seed changes (new rows, re-checks, accepted reports) flow: edit CSV → PR review → `refresh.mjs import --apply` (the owner's OK, service role) →
next job run builds the packs. **The CSVs are the source of truth**: import upserts every CSV row and deletes table rows that are not in the
CSVs, so an edit made only in the database is undone by the next import.

## 5. Rollout (each step needs the owner's OK where marked)

1. PSGC tables are built from the pinned psgc.cloud snapshot (`node scripts/local-data/psgc.mjs`); when a person downloads the PSA masterlist, diff and re-pin.
2. Done 2026-11-01: **0045 applied** (the owner: "Yes, apply 0045"), recorded as version 0045.
3. Done 2026-11-01 (the owner: "Yes, import and upload"): 125 coverage rows, 207 places (173 published), 8 places packs + 2 hazard packs + `index.json`, all read back from the public URLs. This machine has no service-role key, so it ran through the logged-in Supabase CLI (`db query`, `storage cp`) with the rows `import` builds; a read-only `packs` run afterwards says every unit is `same`.
4. Build the app lane (section 3) behind the existing Safety pages; tests for `unitAt`, hysteresis, checksum reject, Entry mapping.
5. Add the refresh workflow secrets; watch the first scheduled run.
6. Continue province by province per `COVERAGE.md`.
