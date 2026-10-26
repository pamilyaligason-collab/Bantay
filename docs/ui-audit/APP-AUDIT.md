# Family Bantay phone app: UI audit

Audited: `origin/main` a2f4e52 (2026-10-22), no-auth e2e build (`BANTAY_ALLOW_NO_AUTH=1`), Playwright Chromium, made-up seed data (Lola Remedios Santos, Tito Ramon Santos), weather mocked (33°C, 72% humidity), other network blocked, `prefers-reduced-motion: reduce` so scroll-reveal sections render.
Lens: `design-taste-frontend` skill, applied only where it fits a senior health product app (contrast, tap targets, states, shape and colour locks, dark mode, copy audit, em-dash ban). Its landing-page rules (hero, bento, eyebrow counts) and its Fraunces ban are out of scope: Fraunces + Plus Jakarta Sans on cream/green is the approved v6 identity (D-29, D-66) and stays.
Design read: trust-first health app for Filipino seniors with hypertension and their carers. Dials: variance 3, motion 2, density 4.

## How to read the screenshots

All under `docs/ui-audit/app/`. Pattern `<screen>-<width>-<scheme>.png` is the real viewport (390x844 or 360x780). `<screen>-390-<scheme>-full.png` is the same screen with the inner scroller expanded so the whole page shows (the tab bar then sits at the bottom of the long image; sheets do not expand).
Machine checks per screen (tap targets under 48px, text under 16px, sideways scroll, axe WCAG 2 A/AA at 390): `metrics-390-light.json`, `metrics-390-dark.json`, `metrics-360-light.json`, `metrics-360-dark.json`, `metrics-supp-390-*.json`. Re-run with `capture-spec.ts.txt` + `capture-config.ts.txt` (copy into `e2e/` and the repo root of a throwaway checkout).

Global results:
- axe WCAG 2 A/AA: **0 violations on all 36 screens**, light and dark. Good base.
- Sideways scroll: none reported, but one real overflow is hidden by `.scroll { overflow-x: hidden }` (finding G1).
- Em-dash: none in UI copy. En-dash `–` is used as the "no data" value in weather (WeatherScreen.tsx:30, 145-148, 172; WeatherCard.tsx:65; CountUp.tsx:32). A screen reader says "en dash"; a senior sees a stray mark.
- Text under 16px: every screen. 13px is the house size for labels, dates, sub-lines and section heads (40+ rules, list in G3). 10-12px in chart ticks and chips.
- Tap targets: the house minimum is 44px (iOS). For seniors the brief asks for 48px; 61 controls on Quick dial alone sit at 44.

Not rendered (marked so nobody assumes they were checked):
- Next-visit card and follow-up in Doctor visits: the `bantay-visits` seed failed (db not open yet), so only the empty state is shown.
- Signed-in states: sign-in/PIN, Take/Taken buttons on Medicines, Add medicine, Salt today card on Today, Memories turned on (auth build not used).
- SOS after the 3-second hold (would open the SMS flow), Notifications with items, offline bar, error toasts, the Plate sheet below "How much?" (inner sheet scroll), the live site bantay.pages.dev (not compared).
- `#health/metric/bp` is not a real route (my guess); the real one is `#health/metric/bp_systolic`, captured as `health-metric-bp-systolic-*`.

---

## Global findings (all screens)

**G1. Full-width buttons overflow by 32px.** `.btn` and `.btn2` set `width: 100%` plus `padding: 0 16px` without `box-sizing`, so any `<a class="btn">` with `display:flex` sticks out on the right and is clipped by the scroller. Visible on Family > member: "Full report" runs off screen (`family-member-390-light.png`).
Fix `src/styles/app.css:47-48`: add `box-sizing: border-box;` to `.btn` and `.btn2`.

**G2. Tap targets: 44px house minimum, seniors need 48.** Measured at 44: top bar avatar and bell (`shell.css` `.sh-me-btn`, `.sh-iconbtn`), `.pill` and `.seg button` (app.css:102, 117), onboarding chips and step dots (36x44), Ask chips `.as-chip`, Quick dial "i" and Call (`.sf-i`, `.sf-callbtn` 68x44), body-system rail `.an-rb` (anatomy.css:74), Me switches (54x44), Theme and Language segments, Videos topic chips, Weather place segments. Under 44: `.hv-modes` fine, but `a.mid-add` "Add" on Medical ID is 32px wide, "Sources" link on Safety is 51x16 (Safety.tsx:65 inline 13px), "WHO fact sheet" link 121x21 (nutrition), "Read more" on lab detail 88x24, `.an-pill` 32px (anatomy.css:66), `.lr-verdict` 32px (health.css:98), `.nu-band` 36px (nutrition.css:8), `.as-chip-static` 36px (assistant.css:29), `.sync-pill` 28px (shell.css:25, has a ::before hit area). Not a problem: `.fm-chk` 32px box has a 48px `::before` (plan.css:37) and `.hv-open` 28px links cover the whole row via `::before` (health.css:47).
Fix: add `--tap: 48px` to `:root` in `src/styles/app.css:6` and replace `min-height: 44px` with `min-height: var(--tap)` in the shared rules (`.pill`, `.seg button`, `.sh-iconbtn`, `.sh-me-btn` 48x48, `.switch`/`.sh-switch` height 48). Feature files follow in their lanes. Primary actions (Call, Save, I'm OK) stay at 52-64.

**G3. Type floor is 13px.** Used for meaning-carrying text, not just decoration: `.sec` (app.css:45), `.eyebrow` (98), `.sec-h a`/`.link` (101, a 13px link is a 13px tap target), `.chip` (108), `.dl > span` (133), top bar date `.sh-top-date` (shell.css:21), `.sh-sub` (68), tab labels 13px (shell.css:47), My week `.td-tile-l/.td-tile-v span/.td-tile-s` (today.css:209-213), `.td-chip` 12px (220), `.td-k` weather eyebrow (25, 183), `.hv-nl`, `.hv-last`, `.hv-state`, `.lr-h` (health.css:14, 63, 72, 92), KPI `.kp-sub`, `.kp-chip` (m7a.css:15-16), chart ticks `.mc-t` **10px** (m7a.css:51), `.vs-date small` 12px (m7a.css:75), `.fm-week small` **11px** (family.css:15), `.fm-note .sub` 12px (45), `.sf-chk` 12px (safety.css:101), `.queued-badge` 12px and `.offline-bar` 13px (offline.css:2, 5), `.sos-err` and `.dt-err` 13px (error text!).
Fix: in app.css add `--fs-small: 15px; --fs-label: 15px; --fs-body: 17px;` and raise every rule above to 15px minimum (chart ticks 13px, error text 16px). Keep uppercase eyebrows only where they already exist, at 14px with `letter-spacing: .04em` (13px uppercase grey is the hardest text in the app to read).

**G4. Off switches are nearly invisible.** Off track is `var(--line)` (#E4DCCB) on `--card` (#FFFCF6), about 1.2:1, below WCAG 1.4.11's 3:1 for controls (axe does not test this). See `settings-me-390-light-full.png`: five sharing switches read as blank.
Fix `src/styles/app.css:120` and `src/features/shell/shell.css:82`: off track `background: var(--card2); box-shadow: inset 0 0 0 2px var(--muted);` (dark mode inherits the tokens). Optionally print "On"/"Off" next to each switch for seniors.

**G5. The verdict word changes between screens for the same number.** Same person, same day:
- BP 148/92: "High" on Health KPIs and Vitals, "A bit high" on the body map (147/92 avg) and on Lola's report.
- Fasting sugar 112: "A bit high" on KPIs and body map, "High" in Vitals.
Five sources write these words: `kpisLogic.ts:41-42`, `model.ts:142`, `vitals.ts:62-65`, `labsLogic.ts:10`, `ranges.ts:112`, plus `readingPreview.ts:29-46` and the family report. A senior reading "High" then "A bit high" for one reading loses trust in both.
Fix: one `verdictWord(test, value, family)` in `src/features/health/ranges.ts` used by all of them; BP keeps the 3 steps (Usual / A little raised / High, very high > 180/120), sugar and labs use Low / In range / A bit high / High with the same cut-offs everywhere. Add a unit test that feeds 148/92 and 112 through every caller and expects one word.

**G6. Medicine adherence has two numbers.** Health KPI and Visit summary: "5 of 6" / "83% (5 of 6)". Lola's report: "5 of 12 doses" with six amber X days (`family-report-390-light-full.png`), because the report counts Amlodipine 8 PM (never logged) and the KPI does not. Also a day where Losartan was taken shows the same X as a day where nothing was taken.
Fix: one adherence function in `src/features/health/` used by `Kpis.tsx`, `visitSummaryLogic.ts:108` and `family/reportLogic.ts` (Report.tsx:40). Report cells: three states (all taken = green tick, some = half-filled amber with "1 of 2", none = red X), not two.

**G7. Heat: two "feels like" numbers.** Today and Weather say "Feels like 39°" (Open-Meteo `apparent_temperature`) while the advice and the Weather banner use the app's own heat index, "Heat index 46° · Danger" (`weather-390-light-full.png`). Same screen, 7 degrees apart, and the 39 sits in the "Extreme caution" band while the advice is "Danger".
Fix `src/features/today/WeatherCard.tsx:47` to `const fl = heatIndexC(wx.temp, wx.humidity) ?? wx.feels` and `src/features/weather/WeatherScreen.tsx:141` to print `deg(hi)`; label it "Heat index" in both places so the word matches the PAGASA band chips.

**G8. The "Scan papers here too" coach mark never goes away and covers content.** `TabBar.tsx:40` shows it on Today until the Ask sheet is opened once. It sits over "Your week" (`today-390-light-full.png`) and in Simple mode over the **SOS** button label (`today-simple-390-light.png`).
Fix: never show it in Simple mode, and auto-hide after 8 seconds or on the first scroll/tap (set `seen`). In `shell.css:139` keep `pointer-events: none`.

**G9. Tagalog is thin.** i18n (`src/lib/i18n.ts`) covers only the medicine reminder, weather lines, dial headers and SOS status. Tab labels, headings, verdict words, buttons, onboarding (8 steps, English), the Health library ("English only for now") and the Ask chat are English. First-aid tiles carry Tagalog sub-lines for most topics but not Stroke, CPR, Heat stroke, Seizure (`safety-390-light-full.png`). Meal names are already bilingual (Almusal / Breakfast), which is the right pattern.
Fix: bilingual labels (Tagalog under English, 15px muted) on the five tabs, the verdict words (Mataas / Medyo mataas / Normal / Mababa), I'm OK ("Okay ako"), Call 911, SOS sub-line, and the four missing first-aid tiles (Stroke: "Istrok", CPR: "CPR (kamay lang)", Heat stroke: "Atake sa init", Seizure: "Kombulsyon"). Have a native speaker check every string before shipping.

**G10. Stale and developer copy.** "confirm imported results in Family > Records" (`MetricScreen.tsx:63`) and "confirm a prescription in Family > Records" (`Medicines.tsx:87`): Records moved to Health > Papers. Me shows "App dev / Not checked yet / Check for updates" to every senior (`settings-me-390-light-full.png`). Papers timeline uses ISO dates "2026-10-22" while every other screen says "Oct 22" or "Tue 20 Oct".
Fix: change both strings to "Health > Papers"; rename the Me row to "App version" with the version and hide the dev wording; format Papers dates with the same helper the KPIs use.

**G11. Dead and duplicate CSS that fights the v6 components.** `app.css` defines `.seg` twice (93-95 and 116-118), `.pill` twice (49 and 102), `.tile` twice (42: 30px square, 109: 56px circle), and keeps the old tab bar `.tabs`, `.tab-ask-dot` (55-58, 89-92, 11px labels) that no component uses. The second `.seg` (2 columns) beats `m7a.css:26`, which is why finding H3 happens.
Fix: delete app.css:42, 49, 55-58, 89-95; keep the v6 blocks.

**G12. Radius scale is loose.** 21 different radii in feature CSS (2, 3, 4, 5, 6, 8, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 28, 30, 999). v6 reads as cards 20-24, inner rows 14-16, controls pill. Fix within v6: tokens `--r-card: 24px; --r-tile: 20px; --r-field: 14px; --r-pill: 999px` in tokens.css, and move rules to them when a lane touches a file (no big-bang sweep).

---

## Screen by screen

### Onboarding (`onboarding-1-390-light.png`, `onboarding-2-390-light.png`, `-dark`, `-360-*`)
Works: one question per step, "Step 2 of 8" plus dots, Skip always visible, big Continue, chips instead of typing, "Don't know" and "Not sure" options, dark mode solid.
Problems:
- 8 steps before the app; a senior who is handed the phone hits About me (blood type, allergies, conditions) first. Steps are skippable but nothing says so on the step itself. Fix: on step 1 add one line "You can skip any step and do it later in Me" (Wizard step header, `src/features/setup/`).
- Step dots are buttons 36x44 (`.wz-dot`), too small and easy to mis-tap into a later step. Fix: make dots non-interactive (`aria-hidden`, no button) and keep Back/Continue.
- Back chevron is grey on cream at step 1 (disabled look) and only 44px. Fix: hide it on step 1, 48px elsewhere.
- Jargon: "Sulfa drugs", "Aspirin/NSAIDs", "Latex". Fix: "Sulfa (antibiotic)", "Aspirin or pain pills like ibuprofen".
- English only (G9).

### Today (`today-390-light.png`, `today-390-light-full.png`, `today-390-dark-full.png`, `today-360-*`)
Works: weather card with a plain action line ("Stay indoors 11 AM-3 PM...") is the best component in the app; Quick log 3x3 with icon over label at 17px; I'm OK is a 64px button; family line is plain words; dark mode keeps hierarchy.
Problems:
- I'm OK sits at y≈930, below the fold at 844, under Quick log, Family and Plan. For a senior it is the daily task. Fix: in `src/screens/Today.tsx:57-58` render `GreetingBand` right after `WeatherCard` (or give QuickLog a collapsed 2-row default).
- Quick log icons are 22px glyphs in a 30px pale square with muted tone; the label carries everything. Water uses a wine-glass glyph (`icon: 'glass'`, QuickLog.tsx:23), which reads as alcohol. Fix: icon 26px, tile 40px; use a tumbler/water-drop glyph from Tabler (`IconGlassFull` or `IconDroplet`) for Water.
- Weather eyebrow "WEATHER · DAMPAS · AS OF 8:24 AM" is 13px uppercase with two middle dots (today.css:25). Fix: "Dampas, 8:24 AM" at 15px sentence case.
- Heat numbers disagree (G7). Coach mark covers "Your week" (G8).
- Top bar date 13px (G3).

### Today sheets: Plate (`today-plate-sheet-390-light.png`), Water (`today-water-sheet-390-light.png`), BP (`today-bp-sheet-390-light.png`)
Works: bilingual meal names, salty extras with mg, labels above inputs, big Save, Close as a word not an X.
Problems:
- Plate: disabled "Save meal" is grey-green with white text (about 2.4:1); "Same as yesterday" disabled outline is similar. A senior cannot tell disabled from faded. Fix in `nutrition.css`: disabled = `background: var(--card2); color: var(--muted);` plus a line above it saying what is missing ("Tap a dish first"), which already exists, so move it directly above the button and make it 16px.
- Plate: "Tap a dish to put it on your plate" but the dishes are below the fold, under salty extras and "How much?". Fix: order Which meal, dishes, How much, Salty extras.
- BP sheet: placeholders "120" and "80" look like filled values (`QuickLog.tsx:107`). Seniors save without typing or think the app measured them. Fix: empty placeholder, hint under the field "Example: 120", unit "mmHg" inside the field, and a third optional Pulse field.
- Water sheet: fine; button 56px. Keep.

### Today, Simple mode (`today-simple-390-light.png`)
Works: huge I'm OK, Call family, SOS buttons; Exit at top and bottom.
Problems:
- The full tab bar and the Ask bubble still show and cover the bottom: SOS is half under the tab bar and the coach mark sits on it (G8). Fix: hide `.tabbar` and the hint when `mode.simple` is on (add `data-simple` on `.bt` from Today and `.bt[data-simple] .tabbar { display: none }`), or reserve the three buttons above the fold.
- "SOS" is a link to `#safety` (`SimpleToday.tsx:57`), so it needs a second tap plus a 3-second hold. Fix: render `SosButton` directly in Simple mode.
- Simple mode is only reachable from Me (G gap list).

### Health (`health-390-light.png`, `health-390-light-full.png`, `health-360-light.png`, dark)
Works: person chips, a plain headline insight, KPI cards with big numbers and a word, body map with value chips, labs grouped "Ask about / In the usual range / Not compared", number lines with "You" marker, disclaimers.
Problems:
- H1. The insight is clamped to 2 lines (`health.css:4-5`). At 360 the headline itself is cut: "A few numbers need a look this…", and the sub-line always ends in "A…". Fix: delete `-webkit-line-clamp` on `.hv-insight` and `.hv-sub`; write the sub-line shorter instead.
- H2. "My KPIs" is business jargon. Fix: "My numbers" (Tagalog "Aking mga numero").
- H3. The Vitals Latest/Average/Normal toggle wraps "Normal" onto a second row (`health-390-light-full.png`, Vitals). Cause G11. Fix `src/features/health/m7a.css:26`: selector `.seg.hv-modes`.
- H4. Verdict words disagree within the page (G5).
- H5. The page is 4,500px: header, KPIs, body map, three link cards, Medicines, Vitals, Labs, Learn tiles, three more link rows. Body map, KPIs and Vitals show the same four numbers three times. Fix (within v6, no new pattern): keep KPIs and Labs on the page, move Vitals (with its toggle) into each metric page, and merge "Explore your body / Move / Food and salt" and "Learn" tiles into one "More for your health" list. "Your body" in Learn duplicates "Explore your body".
- H6. Disclaimer printed twice (after Vitals and after Labs). Keep one at the end.
- H7. "Papers · Add your first paper" while labs exist (labs came from local readings without a paper file). Fix: show the count of papers or "Lab results and prescriptions" without "first".
- Previous switch next to "Vitals" has no explanation; off state invisible (G4).

### Medicines (`health-meds-390-light-full.png`)
Works: Today / Active / Paused grouping, times in bold, counts on the right.
Problems (viewer without mark rights, so Take buttons not rendered):
- No "what it is for" line. Seniors on 3+ pills ask this most. Fix: show `purpose` (or the condition from the prescription) under the name in `Medicines.tsx` rows.
- "Not yet" at 8:24 for an 8:00 AM dose gives no urgency. Fix: "Due 24 min ago" in amber after the time passes.
- Time chips (`.md-tag`, 13px) in Active repeat Today. Fix: 15px.

### Food and salt (`health-nutrition-390-light-full.png`)
Works: honest empty states ("left blank, not counted as zero"), salt next to BP on the same 7 days, WHO limit with grams.
Problems:
- "Salt today" card shows "0 ml of 1,500 ml": the water panel sits inside the salt card with no visible heading (`WaterPanel.tsx:24` has only `aria-label`). Reads as salt in millilitres. Fix: add `<b className="nu-k">Water today</b>` as the first child at WaterPanel.tsx:25, or move water into its own card in `NutritionScreen.tsx:60`.
- BP chart ticks "162.7 / 138.5 / 114.3" at 10px (`MetricChart.tsx:40-45`, `m7a.css:51`). Fix: round ticks to whole mmHg (and to 5s), 13px.
- "Use Meal on Today to add what was eaten" is a dead end. Fix: a "Log a meal" button that opens the Plate sheet here.
- "WHO fact sheet" link is 21px tall (G2).

### Lab detail (`health-lab-detail-390-light-full.png`)
Works: question list "Questions to ask your doctor" with "Add to visit list", source shown, last results with direction.
Problems: "Your last 2 results" and "Readings" show the same two rows. Fix: drop the Readings block when it has 3 or fewer rows. "Read more" link 24px tall. Value uses serif with serif unit; fine within v6.

### Metric page, BP top number (`health-metric-bp-systolic-390-light-full.png`)
Works: latest with word, week/month, morning/evening split, source of range, readings list.
Problems: ticks 162.7/138.5/114.3 at 10px (as above); monthly average "147.4 mmHg" (BP is never written with decimals, round); the green normal band hugs the bottom so every point looks far off with no 130/140 reference line. Fix in `MetricChart.tsx`: round ticks, add a dashed line at the guide's high value with its number. The two-segment controls stack (This week/This month, Morning/Evening) look identical; make the second one chips.

### Doctor visits (`health-visits-390-light-full.png`) and Summary (`health-visit-summary-390-light-full.png`)
Works: Bring checklist with 48px hit area, "Prepare visit summary" big button; summary is clear, honest about its source, share as picture.
Problems:
- No way to add a visit by hand ("Visits from your doctor's papers show here"). Fix: "Add a visit" button (date, doctor, place) in the empty state.
- Question field: placeholder example is cut off ("...high enough to chang") and the label is 15px grey. Fix: label 16px ink, placeholder shorter ("Your question").
- The Add button looks disabled (grey `btn2`). Fix: green when the field has text.
- Next-visit card not rendered (seed failed).

### Papers (`health-papers-records-390-light-full.png`)
Works: trend picker, timeline grouped by day, doctor visit rows.
Problems: ISO dates (G10); BP split into two lines "top number: 148 / bottom number: 92" instead of "148/92"; trend defaults to the bottom number; chart labels small; nothing on this page is an actual paper (photo). Fix in `Records.tsx`: join systolic/diastolic into "Blood pressure 148/92", default trend to top number, and show a thumbnail row of scanned pages at the top.

### Explore your body (`health-body-390-light.png`)
Works: plain-word system text, dots on the figure.
Problems: the system rail is nine icon-only 44px circles (`anatomy.css:74`); a senior cannot tell "Hormones" from "Kidneys". Fix: horizontal chips with words (reuse `.seg.vd-topics` from m7a.css:104) above the figure, or a label under each icon at 13px minimum.

### Library, Videos, Refill (`health-library-390-light.png`, `health-videos-390-light.png`, `health-refill-390-light.png`)
Works: library personalised to the person's medicines; refill is plain.
Problems: Videos show a blank green gradient with a play button, then "Open in YouTube", then the title: the title should come first and the thumbnail should show what the video is (static poster from `videos.json`). Topic chips scroll off-screen ("Min…") with no cue; wrap them to two rows instead. Library is English only (G9). Refill rows say "Not counted yet" with no action; add "Count pills" when the viewer can edit.

### Ask (`ask-sheet-390-light.png`, `ask-jack-chat-390-light.png`, `ask-scan-390-light.png`, dark)
Works: three 76px choices with icon, title and plain sub-line; Cancel as a full-width button; chat warns "I can be wrong... call 911"; scan page is short and clear.
Problems:
- The choice says "Talk to Jack Jack", the chat header says "Ask Bantay". Pick one name per screen. Fix: chat header "Jack Jack" with the mascot avatar, sub-line "Bantay helper".
- "Scan a paper" appears three times in the chat (chip, camera icon, and the Ask sheet). Drop the chip.
- Ask sheet icon tiles use three tones (green, purple, blue). Within v6 keep one tone (`--soft` + `--green`) for all three.
- "For PDF files use Health > Papers" is an underlined 15px link; fine, keep.

### Safety (`safety-390-light-full.png`, `safety-390-dark.png`, `safety-firstaid-choking-390-light-full.png`, `safety-dial-390-light.png`, `safety-medid-390-light-full.png`, `safety-gobag-*`, `safety-warnings-*`)
Works: SOS hold with "Cannot hold? Use a button instead", Call 911 red at 64px, IDs row, "Call 911 first if..." banner, first-aid pages are excellent (numbered steps, "Call 911 when" box, video).
Problems:
- First-aid order does not follow risk for this audience: Stroke and Dengue lead, Heart attack is row 4 after Heavy bleeding. Fix (data order in `src/data/safety` / `FirstAid.tsx`): Stroke, Heart attack, Choking, CPR, Fainting, Low blood sugar, Heat stroke, then the rest.
- The 18 first-aid tiles and the 10 hub tiles (Warnings, Weather, Quick dial...) share one style and run together; the page is 3,000px. Fix: put a heading "Places and plans" before the hub tiles and give hub tiles the `.grp` row style instead of tiles.
- Four tiles lack Tagalog (G9).
- Quick dial: header chip says "Dampas" while the list says "Your home area is Tagbilaran" with no reason given. The "check" badge is 12px with no explanation (`safety.css:101`). The "i" button is an italic serif letter. Call buttons 68x44. Fix: line "Showing numbers for Tagbilaran (your home area)"; badge text "Not yet checked" at 13px+ with a one-line legend at the top; Tabler `IconInfoCircle`; Call 56px tall.
- Medical ID: "Add" links 32px wide, five identical "Not added Add" rows. Fix: one "Fill in my Medical ID" button above the card when 3+ are empty; keep the per-row Add at 48px.
- Disclaimer paragraph under the hub is 13px inline (`Safety.tsx:65`). Fix: 15px via a class.

### Family (`family-390-light-full.png`, `family-plan-390-light-full.png`, `family-member-390-light.png`, `family-report-390-light-full.png`)
Works: today's check-in with I'm OK, roll call with "5 to check" and no health numbers on the list (privacy), report is complete, print button, privacy note, Memories off by default and explained.
Problems:
- Member page: "Full report" overflows the right edge (G1).
- Roll call has no Call button. A carer's first action on "No check-in today" is to call. Fix: a 48px phone button on each row when a number is saved (People.tsx).
- Report: verdict words and dose count disagree with Health (G5, G6). Weight "No range to compare" box is outlined and taller than the others; use the same chip.
- Plan: filter chips "Mine only / Later / Done" are unclear and 44px. Fix: "Only mine", "Coming up", "Done" with a selected state.
- Status dot on avatars is tiny and grey; it carries "checked in or not". Fix: drop it (the text says it) or make it 12px with a tick.

### Me / Settings (`settings-me-390-light-full.png`)
Works: "Family can see my" grouping, plain explanations ("Everything starts off"), Simple mode described in words.
Problems: off switches invisible (G4); "App dev" row (G10); Theme and Language segments 44px; Language only affects reminders, which the sub-line admits; no text size setting (gap list); Setup checklist "8 things left" bar is a filled grey track with no fill.

### Weather (`weather-390-light-full.png`)
Works: action banner first, PAGASA heat bands with the current one outlined, official sources listed.
Problems: heat index 46 vs feels like 39 (G7); "–" as no data (use "No data"); band chips 13px grey on grey; "Home 1 / Home 2" should show the saved place names.

### Notifications (`notifications-390-*.png`)
Rendered empty only. Not assessed beyond that.

---

## Gaps a senior or carer will hit

1. **No text size control.** No in-app setting and no check that the layout survives Android font scale 130-200%. Add "Text size: Normal / Large / Extra large" in Me that scales a root `--fs` multiplier, and run the no-sideways spec at 1.3x.
2. **Simple mode is hidden in Me**; offer it in onboarding ("Make the app simpler?") and as a link on Today.
3. **Tagalog UI** beyond reminders (G9).
4. **Disabled vs available** is not readable (Plate Save, visit Add); every disabled button needs a reason line.
5. **Late doses** have no "late" state on Medicines or Today.
6. **Calling family** from the roll call and member page.
7. **Adding a doctor visit** by hand.
8. **Error and offline states** were not visible in this run; error text is 13px (`.sos-err`, `.dt-err`); raise to 16px with an icon.
9. **One source of truth for numbers** (G5, G6, G7). These are the trust breakers.

---

## Top 15 (ranked by impact x effort)

| # | Change | Where | Effort | Lane |
|---|---|---|---|---|
| 1 | `.btn/.btn2` `box-sizing: border-box` (Full report overflow) | app.css:47-48 | S | A |
| 2 | Coach mark: hide in Simple mode, auto-dismiss | TabBar.tsx:40, shell.css:139 | S | D |
| 3 | One heat number (Heat index) on Today and Weather | WeatherCard.tsx:47, WeatherScreen.tsx:141 | S | D |
| 4 | Unify verdict words with one helper + test | ranges.ts, kpisLogic.ts, model.ts, vitals.ts, labsLogic.ts, reportLogic.ts | M | B |
| 5 | Unify dose adherence + 3-state report cells | Kpis.tsx, visitSummaryLogic.ts, reportLogic.ts, Report.tsx, report.css | M | B |
| 6 | Remove insight line-clamp | health.css:4-5 | S | C |
| 7 | Fix Vitals toggle wrap; delete duplicate/dead CSS | m7a.css:26, app.css:42,49,55-58,89-95 | S | C + A |
| 8 | Label water in Salt card | WaterPanel.tsx:25 | S | C |
| 9 | Off-switch contrast 3:1 | app.css:120, shell.css:82 | S | A |
| 10 | `--tap: 48px` and raise shared controls | app.css, shell.css (then feature CSS per lane) | M | A |
| 11 | Type floor 15px, chart ticks 13px, errors 16px | app.css, shell.css, today.css, health.css, m7a.css, family.css, safety.css | M | A/C/D per file |
| 12 | Simple mode: hide tab bar, real SOS button, I'm OK higher on full Today | SimpleToday.tsx:57, Today.tsx:57, today.css | M | D |
| 13 | BP charts: whole-number ticks, guide line, no decimals | MetricChart.tsx:40-47, MetricScreen.tsx | S | C |
| 14 | Stale "Family > Records" copy, ISO dates, "App dev" row, BP as 148/92 in Papers | MetricScreen.tsx:63, Medicines.tsx:87, Records.tsx, Me.tsx | S | C (+ Me.tsx in A) |
| 15 | Tagalog: tabs, verdict words, I'm OK, 911/SOS, 4 first-aid tiles | i18n.ts, TabBar.tsx, safety data | L | E (after B and D merge) |

Next after these: body-system rail labels (anatomy.css:74, S), Quick dial clarity (S), first-aid order (S), Health page de-duplication (H5, M), text size setting (M), Call button on roll call (S), Add a visit (M).

## Build lanes (no two lanes touch the same file)

- **Lane A: shared shell and tokens** (Sonnet). Files: `src/styles/app.css`, `src/styles/tokens.css`, `src/features/shell/shell.css`, `src/screens/Me.tsx`, `src/features/setup/*.css`, `src/features/assistant/assistant.css`, `src/features/safety/safety.css`, `src/features/family/family.css`, `src/features/family/plan.css`. Items 1, 7 (app.css part), 9, 10, 11 (these files), 14 (Me row), Quick dial and Medical ID sizes. Check: `e2e/look.spec.ts`, `no-sideways-scroll.spec.ts`, `contrast.test.ts`, screenshot compare vs this audit.
- **Lane B: health numbers, one source of truth** (Sonnet build, Fable review: health logic). Files: `src/features/health/ranges.ts`, `kpisLogic.ts`, `model.ts`, `vitals.ts`, `labsLogic.ts`, `readingPreview.ts`, `Kpis.tsx`, `visitSummaryLogic.ts`, `src/features/family/reportLogic.ts`, `Report.tsx`, `report.css`. Items 4, 5. Check: unit tests that one reading gives one word on every caller; `family-report.spec.ts`, `health-labs.spec.ts`, `visits.spec.ts`.
- **Lane C: Health screens** (Sonnet). Files: `src/features/health/health.css`, `m7a.css`, `medicines.css`, `MetricChart.tsx`, `MetricScreen.tsx`, `Medicines.tsx`, `LatestList.tsx`, `src/screens/Health.tsx`, `src/screens/Records.tsx`, `src/features/records/records.css`, `src/features/nutrition/*`, `src/features/anatomy/*`. Items 6, 7 (m7a part), 8, 11 (these files), 13, 14, body rail labels, Plate sheet order and disabled state. Check: `health-*.spec.ts`, `nutrition-auth.spec.ts`.
- **Lane D: Today, Simple mode, weather, tab bar** (Sonnet). Files: `src/screens/Today.tsx`, `src/features/today/*` (incl. `today.css`, `QuickLog.tsx`, `SimpleToday.tsx`, `WeatherCard.tsx`), `src/features/weather/*`, `src/features/shell/TabBar.tsx`. Items 2, 3, 11 (today.css), 12, BP sheet placeholders, water icon. Check: `today.spec.ts`, `weather.spec.ts`, `tabbar-overlap.spec.ts`, `ask-sheet.spec.ts`.
- **Lane E: Tagalog labels** (Sonnet, native-speaker review). Runs after B and D merge because it touches `TabBar.tsx` and verdict words. Files: `src/lib/i18n.ts`, safety first-aid data, wizard step copy. Item 15.

Every lane: re-run `capture-spec.ts.txt` and compare against the PNGs here in light and dark at 390 and 360.
