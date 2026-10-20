# Session 7 plan (2026-10-21) - for Lloyd's approval, no app code before "go"

Counts only; no names or health values in this file (public repo).

## Part A - done
- Drive: one new lab PDF moved into its owner's Medical folder; one name alias added to the git-ignored aliases file.
- Import (scripts/records-import.ps1) run 2026-10-21, exit 0: 8 downloaded, 2 extracted (text layer, no vision), remap_needed 0.
- Verified against the PDFs' own text (local pdf.js, counts only):

| Lab file | Tests | Name in PDF | Value in PDF | Unit in PDF | Ref bounds in PDF | DB rows = draft | Person |
|---|---|---|---|---|---|---|---|
| new (p6) | 72 | 72 | 72 | 72 | 120/121 | 72/72 confirmed (auto) | right person |
| already loaded 10-19 | 13 | 13 | 13 | 13 | 18/18 | 13/13 confirmed | right person |
| already loaded 10-19 | 27 | 27 | 27 | 27 | 46/46 | 27/27 confirmed | right person |

- Not done (blocked: deleting files needs Lloyd): the 2 loose root copies (same sha256 as the copies in the person folders) and one 0 KB copy. Harmless to the import (duplicates by hash, zero-byte skipped).

### A-fix: duplicate documents (0019_records_dedupe.sql + .down.sql, written, rehearsed, NOT applied)
The 10-18 Drive-id run and the 10-19 local-path run stored 59 identical files twice (118 documents). v2 after the Opus review (GO_WITH_CHANGES): groups by (sha256, person); a copy is rejected only when nothing is lost (no row a person confirmed, no prescription line the keeper reads differently in drug/frequency/dose/strength/duration, no more rows of a kind than the keeper; a keeper is never rejected); ID numbers and policies are re-pointed, never rejected; every change is logged to `records_dedupe_log` (admin-only read) and `0019_records_dedupe.down.sql` restores it. Known limit: conditions/allergies/profile text are keyed by person and text, not by file (already one row each), untouched.

Rehearsed on live inside begin/rollback (nothing kept):

| | Before | After 0019 |
|---|---|---|
| Duplicate documents rejected | - | 52 |
| (sha256, person) groups with 2 live documents | 59 | 7 (left for Confirm records) |
| Live medicines / medicines whose content changed | 24 | 24 / 0 |
| Live ID-number rows | 15 | 15 |
| Lab rows a person confirmed | 38 | 38 |
| Draft lab rows in Confirm records | 298 | 86 |
| Up then down: rows not restored | - | 0 |

Offline note: rejected documents stay in a phone's cached docs list until its next refresh.

## Part B - findings so far

### B1 Empty "Next up"
- `src/features/today/nextPick.ts:59` returns kind `calm` ("All clear / Nothing needs you right now") and `NextUp.tsx` always draws the green card for it, so Today shows an empty card.
- Fix: pull the pick into a `useNextPick()` hook used by `Today.tsx` (NextUp computes it today, `NextUp.tsx:14`, so Today cannot know); for `calm` with no medicine to review, NextUp renders nothing and Today passes `expanded` to `WeatherCard`, which keeps a one-line calm reassurance and which adds the mockup's weather hero parts (hi/lo, next hours strip, rain window) from the cached forecast. Tests: nextUp.test (calm -> nothing; calm with review > 0 still shows the card), weatherCard.test (expanded parts), Playwright Today at 390px with no meds.

### B2 Weather defaults to Dampas in General Santos - root cause
- `src/features/location/useLocation.ts:33-34`: without asking, GPS is read only when `navigator.permissions` says `granted`.
- In the APK, Capacitor 8.5.3 `BridgeWebChromeClient.onGeolocationPermissionsShowPrompt` answers `callback.invoke(origin, true, false)` (retain=false, node_modules/@capacitor/android/.../BridgeWebChromeClient.java:254-270), so the WebView never records a grant and the state stays `prompt`. Every launch falls back to the saved home zone; `placeNameOf` then prints the zone name. SOS (`src/features/sos/locate.ts`) calls getCurrentPosition directly, which is why it still finds you.
- Failing test written: `src/features/location/resolveLocation.test.ts` (1 failing, 3 guards passing).
- Fix (web only, reaches the APK on deploy): set `loc.gps_ok` after any GPS fix (resolveLocation, `ask()`, and the SOS fix in sos/locate.ts); only when `Capacitor.isNativePlatform()` and the state is `prompt` and the flag is set, read GPS. Web keeps the strict `granted` rule (Chrome "Allow this time" falls back to `prompt`). Error code 1 (PERMISSION_DENIED) clears the flag, so a person who revoked in Android Settings sees the OS dialog at most once (accepted; to be recorded as a decision). One shared GPS promise per launch (Today mounts about 5 `useLocation()`). `resolveLocation` returns the error code so `ZonePicker.tsx:20` and `safety/MapsPanel.tsx:57` stop inferring "blocked" from `permissions.query`.
- Extra tests: web + prompt + flag -> home (no prompt); code 1 clears the flag; 5 mounts -> 1 getCurrentPosition.
- Unverified: the real `permissions.query` value in the WebView (check once over chrome://inspect). Phone check after deploy: tap Current once on Today, reopen Today in General Santos: card reads the nearest zone, not Dampas.

### B3 Icons
- Today: no library, about 47 hand-copied paths in 6 files (shell/Icon.tsx 14, QuickLog 8, SafetyHub 10, ExploreScreen 9, WeatherScreen 5, TopBar/Plan 3), all mockup style 22px / stroke 1.8 / round / outline.
- Recommend **Lucide** (`lucide-react`, ISC, stroke icons with a strokeWidth prop, tree-shaken, medical set: pill, stethoscope, heart-pulse, syringe, thermometer, siren, camera, scan-text). Phosphor draws weights not strokes (cannot match 1.8). Tabler lacks syringe/siren. Material is a font. Anatomy/organ icons: Healthicons (CC0, already noted in the vault research) for ExploreScreen.
- Swap: keep the `<Icon name>` API, map names to Lucide components inside shell/Icon.tsx, then migrate the 5 local maps; add Lucide + Healthicons rows to docs/ASSETS.md.

### B4 Scanner
- ML Kit Document Scanner via `@capacitor-mlkit/document-scanner` 8.2.1 (Apache-2.0, Capacitor >=8, Android only): edge detection, crop, perspective, filters, multi-page, on-device, no camera permission, ~300 KB. Needs an APK release. Web/old APK fallback: the existing camera/file inputs.
- Gap found: phone uploads are never extracted (extraction is the offline import script, Drive files only). Decision for Lloyd: (a) extend extract.mjs/load.mjs to read storage uploads with ingest_status 'new' (same OpenRouter ZDR route, run by Lloyd), or (b) a server function on upload (new privacy surface).
- Gate the native call on `Capacitor.isPluginAvailable('DocumentScanner')` so older APKs fall back to the camera/file inputs.
- Scans go in as documents status 'draft' (cards stay 'confirmed'); one PDF per scan avoids the front/back-only `side` constraint.

### B5 Screen audit vs mockup (Opus, 2026-10-21)
Method: test build (`BANTAY_ALLOW_NO_AUTH=1`), Playwright 390x844, light + dark, 106 mockup and ~150 app shots, DOM/CSS probes, @axe-core/playwright, a < 44 px target scan. Empty data (no signed-in person), so filled states, admin and auth flows are NOT covered. Pixel diffs were not meaningful (different data); comparison is visual + DOM/CSS.

Totals: 41 findings (7 high, 20 med, 14 low). axe: 0 colour-contrast violations either theme; only `label-content-name-mismatch` (Today 4, Family 3, Safety 1) and `region` (each onboarding step).

High (spot-checked in code by the orchestrator where marked ✔):
- S1 ✔ Tab labels compute 17 px / 400 / ink: `.bt button{font:inherit}` (src/styles/app.css:20) beats `.sh-tabs button` (shell.css:37). Mockup 11 px / 600 / muted.
- X1 ✔ Safety "Sources" link renders browser blue, 51x16 target (src/screens/Safety.tsx:59).
- H3 ✔ Stale copy "Family > Records" (Medicines.tsx:86, MetricScreen.tsx:57); Records now live at Health > Papers.
- T1 = B1 empty Next up card. T2 weather card ~190 px, two-line place, action inside the block; mockup is a compact row + separate amber callout with heat band.
- T9 Simple mode keeps top bar + tab bar, no Exit, no icons (elder path).
- H1/H2 ✔ (code) Health links and Medicines body are gated on `personId`; signed out they dead-end. Re-check signed in before fixing.

Med/low (grouped by lane below): Ask bubble 52 vs 62 px; top bar drawn above sub-screen back headers (App.tsx:94); h1 sizes 20-34 px vs 30/20; three back-button styles; avatar 40 px; legacy `.btn` radius 14 / `.pill` 36 px / body 17 px; 3 tokens differ (light ok, light warn, dark red - record as deliberate or align); text glyphs › ↗ ← instead of icons; place label "where you are" vs Safety "Near you · zone"; Quick log headings and synced line missing; I'm OK button too loud; Quick log BP sheet is 2 plain inputs (reuse AddReadingSheet); Weather screen hero/heat chips/7-day gradient/rain colour/action border; Me missing Edit, carer reminders, Print cards, Privacy, version "dev"; Metric title truncates and no Add; Visits checkboxes 32 px; Family people/plan layout gaps; Safety call pill, tile subtitles 2-3 lines, 20 source links 16 px, Sources "Open" 41x19; Medical ID layout; Go-bag checkbox style; IDs empty state says "open once with signal" while online; Ask is a modal sheet not a tab screen; wizard progress/back/radius; Sign in hierarchy (Google primary over PIN); /get/ link 43 px.
Not in the app: Family messages (mockup `msgs`), a carer page layout. Not in the mockup: Safety sub-pages (weather, map, hazards, cards, sos, sources) and wizard steps 1, 2, 4-8.

## Build plan (after approval)

Order: commit PLAN.md, 0019 and the failing test (marked `it.fails` until L3 lands) before cutting lane worktrees. Every wave-1 lane reaches phones on a web deploy (the APK loads the live site); only L8 needs an APK.

Rules: Sonnet 5.5 builds each lane in its own worktree and commits; Opus 5.5 reviews every lane, Fable 5.1 reviews L3 and L6b (privacy/data). Orchestrator merges, runs the gates, and compares 390 px light + dark shots with the mockup before merge (D-66). No two lanes touch the same file.

| Lane | Scope (finding ids) | Files | Tests / pass bar |
|---|---|---|---|
| L1 Shell + tokens | S1-S8, T9 (Simple mode hides top bar + tab bar), O5 | styles/app.css, shell/shell.css, shell/glass.css, App.tsx, shell/TopBar.tsx, shell/SubHeader.tsx, tokens.css (or a D-note for the 3 tokens), get/ page | tab label 11/600/muted measured in Playwright; Ask bubble 62 px; 0 targets < 44 px in the shell; SubHeader API ready (owner lanes adopt it in wave 2) |
| L2 Today | B1/T1, T2, T3, T4, T5, T7, T8, Simple-mode content | features/today/*, screens/Today.tsx (placeName keeps its signature: safety/LiveMaps uses it; QuickLog reuses health/AddReadingSheet with its props frozen) | vitest: calm -> no card, expanded weather, place = nearest zone; Playwright Today empty + with dose; axe 0 on Today and Simple |
| L3 Location fix | B2 | location/useLocation.ts, location/ZonePicker.tsx, location/resolveLocation.test.ts, sos/locate.ts (set flag), safety/MapsPanel.tsx (one line: error code) | the failing test passes, 3 guards + 3 extra tests pass; on Lloyd's phone in General Santos: Conel / "near you" |
| L4 Health | H1-H5 | screens/Health.tsx, health/MetricScreen.tsx, health/Medicines.tsx (not AddReadingSheet.tsx) | signed-in fixture: links reachable; Medicines empty state with Add; no "Family > Records" left (grep = 0) |
| L5 Safety + Weather + IDs | X1-X8, T11 | screens/Safety.tsx, safety/SafetyPages.tsx, safety/*.css (not MapsPanel.tsx), weather/weather.css, weather/WeatherScreen.tsx, medid/*, docs/DocsScreen.tsx (empty state only), gobag/* | 0 targets < 44 px on Safety, Cards, Sources, Medical ID; axe 0 |
| L6a Family, Me, Onboarding, Sign in | F1-F4, H6 (.fm-chk), T13, O1-O4 | family/People.tsx, family/Plan.tsx, family/plan.css, FmAvatar.tsx, screens/Me.tsx, setup/*, screens/SignIn.tsx | axe 0 incl. `region`; wizard progress bar; Sign in: PIN/member path primary |
| Wave 2: L7 Icons (Lucide) + glyphs + SubHeader adoption | B3, S10, S6 | shell/Icon.tsx, the 5 local maps, text glyphs › ↗ ← in every screen, SubHeader in owner screens, package.json, docs/ASSETS.md | bundle diff < +15 KB gz; every icon 22 px / stroke 1.8; visual check vs mockup |
| Wave 2: L8 Scanner | B4 | src/native/scanner.ts (new), docs/api.ts (draft flag), DocsScreen/UploadSheet, extraction per Lloyd's choice, privacy text | vitest pagesToUploads (pages, 15 MB cap, cancel); Playwright web fallback; device test on the next APK (GitHub Actions "Release Android app") |
| Gate (orchestrator) | A-fix | supabase/migrations/0019_records_dedupe.sql | apply only on "apply"; re-run the counts above |

Deferred unless Lloyd asks: Ask as a full tab screen (A1, planned P6), Family messages (F5), carer page, admin/auth screens audit (needs an admin fixture).

After merge: `design-taste-frontend` and `impeccable` passes over the built screens; then 390 px light + dark shots on live data vs the mockup.

## Decisions for Lloyd
1. Apply 0019 (reject 56 duplicate copies)?
2. Phone scans: (a) offline import script reads storage uploads, or (b) a server function on upload?
3. Icons: Lucide (+ Healthicons for anatomy)?
4. Scope: build wave 1 (L1-L6a) now and wave 2 after?
5. Keep or align the 3 tokens that differ from the mockup (light ok, light warn, dark red)?
