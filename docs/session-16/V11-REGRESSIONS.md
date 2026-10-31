# Mockup v11: regression review against the live app and approved v9 (2026-10-30)

Read-only review. Inputs: `docs/session-16/mockup-v11.html` at commit 0eea90a (group "v11 · Session 16 redesign rev 3 (for approval)", 41 sections incl. `v11-hues`), the 34 v9 frames removed in 0eea90a (read from `git show 86bec8f:docs/session-16/mockup-v11.html`), live shots `docs/session-16/shots/live/*.png`, code under `src/`, PLAN.md rev 5, DESIGN-AUDIT.md, RESEARCH-GRAPHICS.md, vault 02-DECISIONS (D-38, D-66, D-71, D-91, D-96..D-100).

Line numbers for the mockup are from commit 0eea90a. The working copy of `mockup-v11.html` was being edited during this review, so its lines have moved.

**Answer to Lloyd: yes, it is a reversion.** The v11 Today weather hero is a pale tinted strip: `.y-sky` is a 38% blue tint over the card colour (mockup:1402), the temperature is 32 px (mockup:1357), and the card is capped at 300 px (mockup:1339). It has no scene, no hourly strip and no Jack. Live 2.6.1 has all of these (`today-light.png`, `WeatherCard.tsx:77-96`, `scene.css:12-44`), and so did the approved v9 `today-full` (its `l2-scene` / `l2-sun` / `l2-heat` layers and Jack art). RESEARCH-GRAPHICS.md:9 says **"Keep SVG WeatherScene"**, but PLAN rev 5 dropped it. PLAN.md:137 sizes the card at "~168 px", and lane L9 (PLAN.md:416, 474) builds a new `look/Sky.tsx` gradient. A `look/Sky.tsx` already exists and is used by SignIn, so the new one duplicates it and leaves the richer `weather/WeatherScene.tsx` unused.

**Root cause.** DESIGN-AUDIT measured an older weather card ("56 px 31°, two pills stacked, full-width Open weather button", DESIGN-AUDIT.md:56), not the live dark scene. Several audit rules then flattened everything into one card grammar:
- the ≤ 280 px hero cap;
- "serif only on the h1 and the hero number" (DESIGN-AUDIT.md:116);
- the "Four card types, nothing else" rule (PLAN.md:119);
- `data-nofab="1"` on every v11 frame, which hides Jack.

The density and wording wins are real and should be kept. The visual layer was thrown away along with the old layout.

**Evidence limit.** The live shots are one 390×844 viewport each, not full pages, so anything below the fold on live is checked in code, not in a picture. Items marked **(unverified)** could not be confirmed in a picture or a file line.

---

## Summary table (blocker and major first)

| # | Regression | Sev | v11 frame(s) | Evidence (live / approved) | Fix for v12 |
|---|---|---|---|---|---|
| R1 | Weather hero lost the animated sky scene, 56 px serif temperature, condition line, rain/heat action box with Jack, 3-slot hourly strip and "as of" time; it is now a flat pale-blue strip | **Blocker** | today-s16, -alertsoff, -quake, -storm, viewas-bar | `today-light.png`; `WeatherCard.tsx:77-96`; `scene.ts:11-17` (SKY, SCRIM .58); `scene.css:12-44`; v9 `today-full` (86bec8f:2025, `l2-scene`); RESEARCH-GRAPHICS.md:9 | Weather hero spec below: reuse `WeatherScene`, expanded 232 px / compact 196 px, Today calm ≈ 1023 px |
| R2 | PLAN L9 builds a new `look/Sky.tsx` CSS gradient in place of the shipped `WeatherScene` (sun, stars, clouds, fog, rain, flash, heat). `look/Sky.tsx` already exists | **Blocker (plan)** | (plan) | PLAN.md:416, 474; `src/features/look/Sky.tsx` (used by `App.tsx`, `SignIn.tsx`); `src/features/weather/WeatherScene.tsx` | L9 extends `WeatherScene` (moon, drift layers, heat shimmer, off-screen pause). No new Sky component for Today |
| R3 | Jack is gone from every v11 frame: `data-nofab="1"` on all 41 sections hides the Jack button (mockup:3141), there are 0 `<img>`, and onboard-1 has a "placeholder circle" | **Blocker** | all 40 + v11-hues | Jack button on every live tab (`*-light.png`, `shell/JackFab.tsx`); about 20 `JackArt` moments (`WeatherCard`, `NextUp` well-done, Learn reading, Watch, Listen, Medicines, Plan, Messages, SignIn hello, setup get-help); D-91 | Show the Jack button on every tab frame. Draw the real Jack art where live has it (see the per-frame list). Never on alerts, storm or SOS (D-91, C-7) |
| R4 | Quick log "More" tile removed: Dose taken, Food, Walk and Move can no longer be logged from Today | Major | today-s16 (+ all Today) | `QuickLog.tsx:17-26` (6 tiles + MORE sheet); `today-light.png` (More tile); PLAN.md:142 lists 5 tiles + I'm OK; no decision | 3×2 grid: BP, Sugar, Weight, How are you? + small I'm OK, Water, More. Same height as v11's row (96 px tiles × 2 ≈ 200; v11 row ≈ 120: +80 px, fits the budget) |
| R5 | Next up lost "Skip" (only Take / Snooze) | Major (medicine) | today-s16-alertsoff, -quake, -storm, viewas-bar | `NextUp.tsx:92` (Skip when every slot has a medicine id); v9 `today-full` "Skip today"; PLAN.md:141; no decision | Take (primary) + Snooze / "In 10 min" + Skip as a 48 px text button. Keep the done morph with Jack well-done (`NextUp.tsx:96`) |
| R6 | Health body picture flattened: the live frosted anatomy (`BodyMap`: organs, glow on results that need a look, 7 metric points incl. Sleep, Mood, Steps) became an 88×140 outline + 4 numbers | Major | health-A, -B, -AB, -acting | `health/BodyMap.tsx:8-30`, `anatomy/Silhouette.tsx`; D-38 "body picture stays"; v9 `health-home` (86bec8f:2099) six numbers + body picture | BodyHero keeps the v11 2×2 averages but draws the real `Silhouette` with its glows at 96×180, still ≤ 240 px |
| R7 | Health lost its headline sentence, the nudge rings (BP / Meals / Move this week) and the family streak; the nudge is a 64 px row | Major | health-A, -B, -acting, -empty | `health-light.png` (rings, "start your streak"); `Health.tsx:92` `insightHeadline`; v9 `nudge-home` (86bec8f:2486, AM/PM rings, streak 12, Jack) approved; W-22 shortened the copy only | Nudge row → 88 px row with 3 mini rings (SVG, `look/Ring.tsx` from L9) + "Log". One-line headline under the chips (≤ 2 lines) |
| R8 | Family faces lost the status ring and ✓ / ! / – corner icon (colour plus shape), and the legend | Major (a11y) | family-s16, -empty-needs, -faces-sheet, -acting | `family-light.png` (rings, legend "OK today · Needs a look"); v9 `family-home` (86bec8f:3356); mockup:1433 `.y-face .av` has no ring | 48 px avatar + 3 px status ring + 16 px corner glyph. Ring draws in 400 ms on check-in (static under reduced motion) |
| R9 | Family Messages and Plan lost their own entry: the Home / Messages / Plan segments are gone and Messages is reachable only from a face sheet or a Needs-you-now row. The v9 messages, thread, plan and add-to-plan frames were deleted with no replacement | Major | family-s16 | `family-light.png` (segments); `screens/Family.tsx` (`FamilySeg`, `FamilyMessages`, `Plan`); v9 `family-msgs` / `-thread` / `-plan` / `-add` (86bec8f:3381+); D-97 does not drop messages | Add a "Messages" row (latest message preview + unread badge) under the faces, or keep a 2-segment "Home · Messages". Re-add the messages, thread and plan frames to the "Current app" group |
| R10 | Breathe patterns contradict the shipped logic: v11 shows Calm = in 4 out 6, Box, Even, Long out; live has Relax (4/6), Sleep (4-7-8) and Calm (box 4-4-4-4), each with a why and a source. The Sleep pattern and the source lines are gone | Major | breathe-pick, -run, -run-reduced | `breathLogic.ts:7-13`; PLAN.md:150 "Logic stays in breathLogic.ts"; v9 `today-breathe` (86bec8f:2059) | Draw the 3 real patterns as 3 tiles (one column of 3 or a 2+1 grid) with the tag and a one-line source |
| R11 | Storm frame is inconsistent and lost its links: at 1:40 with "Magandang gabi" the hero still shows "Sunny till 2 PM" and a sun icon; the storm block dropped the source link, All warnings, the Go-bag progress link and "Track the storm" | Major (safety) | today-s16-storm | `StormCard.tsx:56-81` (See the source, All warnings, See who has checked in, Go-bag n of N); v9 `today-storm` (86bec8f:2047) storm scene + "Track the storm" | Storm frame: night storm scene (rain + flash), forecast copy, no Jack. WarningCard gets "What to do" (as in quake) + a "PAGASA · 11:00 AM · Source" line + a Go-bag row |
| R12 | Discover Learn lost the "Your benefits" (PhilHealth Konsulta) shelf | Major (feature missing) | discover-learn-s16 | `discover/learn/Screen.tsx:10,62`; v9 `learn-home` (86bec8f:2818) | A 5th Learn tile "Your benefits · PhilHealth, Senior ID" (2×2 + 1 full width) |
| R13 | Settings says "Daily summary · One short note at 7 AM" for everyone; live is the "8 PM summary" for carers only ("who still has medicine to take") | Major (wrong behaviour) | settings-alerts | `notify/DigestToggle.tsx:10,55`; `me-light.png` | "8 PM summary · Who still has medicine to take" (carers only) |
| R14 | Mockup coverage lost: the Weather screen, Storm tracking, Today offline, dose-done morph, alarm-fixed toast, Quick log sheet, My week, the carer SOS banner and the Health nudge hub were removed in 0eea90a with no v11 frame. PLAN still keeps them ("as now", "offline = cached + last good line", AlarmFixedToast / IncomingSos above weather) | Major (contract) | (none) | `git show 0eea90a --stat`; grep of v11 for these titles = 0; PLAN.md:135, 137 | Put the v9 frames back under "Current app · not changed by this redesign", or redraw them in v12 with the new hero |
| R15 | The design-system gate itself caps richness: the ≤ 280 px hero, "four card types", serif only on h1 + 1 number, `.y-sky` defined as a tint | Major (cause) | all | PLAN.md:119; DESIGN-AUDIT.md:56, 116; mockup:1339, 1402 | Add a fifth type, "Scene hero" (one per tab, may carry art/animation, ≤ 240 px compact). Record it as a decision (amends D-96 card grammar) |
| R16 | Quick log tile says "Mood"; D-100 and v9 say "How are you?" | Minor | today-s16 + all Today, viewas-bar | D-100 text "next to How are you"; `QuickLog.tsx:21`; storm variant "Is everyone safe?" (`QuickLog.tsx:111`) | "How are you?" (storm: "Is everyone safe?") |
| R17 | Salt line under Quick log not drawn | Minor (unverified intent) | today-s16 | `QuickLog.tsx:12,115` `SaltLine`; v9 "Salt 1,300 of 1,500 mg"; PLAN "as now" | One 32 px line under the grid |
| R18 | The glass frame (D-71) is not drawn: the mock tab bar and sheets are solid `var(--card)` | Minor (mock only) | all tab frames, sheets | mockup:97 `.tabbar`, `.y-sheet`; `styles/glass.css:49-55` | Mock tab bar, scrolled top bar and sheets with the `--glass-bg` + blur 20 px tokens |
| R19 | The Discover pick hero has no illustration, although its note claims "8 px parallax on the pick illustration" | Minor | discover-s16 | mockup discover-s16 hero (one icon chip only) | Real Jack cooking art (shipped `JackArt` 'cooking') or a CC0 dish drawing, 96 px, right side |
| R20 | Medical ID: the "Show on lock screen" switch moved to "Settings", but no Settings frame shows it; the v9 lock-screen card preview and "Wallet card" are gone | Minor (unverified) | medid-dense, -empty | `medid/MedicalId.tsx:48`; v9 `safety-medid` | Keep the switch on Medical ID (where live has it) or draw it in a Settings group |

---

## Per-frame review (v11 · 40 frames)

Severity per item: B = blocker, M = major, m = minor. "Keep" = a v11 win that v12 must keep.

### Today

**today-s16 (calm)**
1. B: the weather hero is flat (R1). Live: dark sky scene, sun glow, 31° serif at about 56 px, "Partly cloudy", feels/band/high/low line, rain action box with Jack in a raincoat, hourly 9 AM / 12 PM / 3 PM with rain %.
2. B: no Jack button (R3). Live shows the Jack head button bottom-right on every tab.
3. M: Quick log has no More tile (R4). m: "Mood" label (R16). m: no salt line (R17).
4. Keep: greeting + date in a one-line top bar, the W-2 summary "Sunny till 2 PM, rain after 3. Bring an umbrella.", the whole card as the link, the SOS hold at 92 px, the 72 px breath row, Plan rows, the setup row under More, the 959 px height.
5. v12: weather hero per spec (232 px expanded, because calm has no Next up); Quick log 3×2 with More; Jack button; the breath row's leaf chip gets a 2 s "breathing" scale pulse (static under reduced motion). Target ≈ 1023 + 80 (More row) ≈ 1100. If over, drop the "More" heading label (saves 32 px).

**today-s16-alertsoff**
1. B: same flat hero (R1). With Next up present the hero uses the 196 px compact state.
2. M: Next up has no Skip (R5) and no done morph or Jack well-done.
3. Keep: the amber alerts-off card right under weather with its consequence line (F-4) and no motion on alerts.
4. v12: compact hero 196 px, alerts card, Next up with Take / Snooze / Skip.

**today-s16-quake**
1. B: flat hero (R1); in a quake the scene still follows the weather (the quake is not weather), with no Jack because a warning is on screen (D-91 rank 80+).
2. Keep: the red WarningCard with a 48 px close, "Checked 2 min ago · Hide: still in Safety.", the FamilyNotice as a 72 px row, no pulse on alerts.
3. v12: compact hero, no Jack, same alert stack. m: the WarningCard can use the shipped icon set's quake glyph at 32 px (already there).

**today-s16-storm**
1. M: the hero copy and icon are wrong for the state (sunny at night during Signal No. 2) (R11).
2. M: the storm block lost the source, All warnings, the Go-bag link and Track the storm (R11).
3. Keep: StormBlock "I'm OK / Need help" 2-up, 4 one-line Do-now rows (W-12), the status line (W-10), closing keeps the roll call.
4. v12: night storm scene (sky `#0B1636 → #1B2333`, 24 rain streaks, one flash every 7 s, no sun or moon), forecast copy "Rain and strong wind" + "Feels 31°", no Jack; WarningCard + "What to do", a source line and a Go-bag row (n of N packed).

**viewas-bar**
1. B: the same flat hero (R1) and no Jack button.
2. Keep: the amber acting bar with one reason line, disabled controls showing "View only".
3. v12: compact hero (the scene is the viewed person's place, labelled "Mama's place").

### Breathe

**breathe-pick**
1. M: the patterns do not match the code (R10).
2. Keep: the 2-column tiles, minutes chips, buzz row and short safety line (W-15).
3. v12: 3 tiles Relax / Sleep / Calm with their real tags and a one-line source; the selected tile gets a slow 6 s gradient drift in green (static under reduced motion).

**breathe-run**
1. Keep: the layered orb (4 rings + core, "HOLD 3", 02:51) is a real upgrade over live and matches Lloyd's ref "breathing orb".
2. v12 upgrade: a full-sheet backdrop radial gradient in green that brightens and dims with the orb phase (±6% lightness); for the Sleep pattern after sunset use the night SKY pair from `scene.ts`; the rings get soft blur edges (CSS `filter: blur(2px)` on the outer two only).

**breathe-run-reduced**
1. Keep as drawn: flat rings and a text count. Add only the static backdrop gradient.

**breathe-mood**
1. Keep: the 3 faces "Worse / Same / Better" (W-16, decided) and the check-draw.
2. m: no Jack. Live and v9 show Jack well-done or celebrate on success moments. v12: Jack 'well-done' at 96 px in place of the 72 px check chip, with the check-draw on a small badge.

### Health

**health-AB (comparison sheet)**
1. Keep as the picker. Redraw both sides with R6 and R7 fixed so Lloyd compares rich versions.

**health-A (stacked heroes)**
1. M: the outline body (R6). M: no headline, rings or streak (R7).
2. Keep: chips, 7-day averages 2×2, + Reading / Scan, the Progress sparkline, Medicines "2 of 4 left today", Labs "4 to ask about · 2 Oct", the 16:9 video poster, the "More in Health" tiles, no Papers door (D-100).
3. v12: BodyHero with the real `Silhouette` and glows (a glow on BP when 132/84 is above the guide), a 3-ring nudge row, a one-line headline. Height ≈ 1269 + 24 ≈ 1293 (budget 1300).

**health-B (compact grid)**
1. M: R6 and R7 as in A.
2. Keep: the 2×2 At a glance tiles (they are denser than live's 3-tile nudge grid, which leaves an orphan cell in `health-light.png`).
3. v12: the Progress tile carries a mini ring instead of only a sparkline; real body figure; target ≤ 1050.

**health-empty**
1. Keep: one empty hero + grid (F-9).
2. m: no art. v12: the faint `Silhouette` with no glows behind the "No readings yet" text (that is today's live `BodyMap` empty look).

**health-acting**
1. Same as B plus the acting bar. Keep the bar, "+ Reading" enabled for a carer.

**health-labs-s16, health-labs-empty-s16, health-labdetail-s16**
1. Keep: v9 restored with items 1-7 (D-90 / D-91 labs design). No regression found against v9 `health-labs` / `-empty` / `-labdetail`.
2. m: the empty state uses an icon only. Live `LabsList.tsx:77` uses `EmptyState` with an icon too, so this is parity, not a loss.

### Discover

**discover-s16**
1. m: the pick hero has no art (R19). m: the season card is a 72 px row (PLAN.md:195 decided it), so the do-now bullets and the MedlinePlus source moved one tap deeper. Keep the source line on the season sub-page.
2. Keep: no eyebrow, the 5 tappable tiles, 709 px.
3. v12: the pick hero gets art + an 8 px parallax; a season gradient on the season row (rainy: blue-grey with 6 slow rain streaks reusing `wxs-rain`; Undas: warm amber candle glow), static under reduced motion.

**discover-learn-s16**
1. M: no Your benefits (R12). m: no Jack reading (live `discover/learn/Screen.tsx` mounts `JackArt` 'reading').
2. Keep: the 2×2 tiles.

**discover-watch-s16**
1. Keep: the poster row + playlist rows + Live TV.
2. m: posters are gradient blocks; fine for a mock. Check that the v9 rule "Opens in YouTube, official channel, no embedding" (v9 `fun-watch`) is still stated. PLAN W-23 says "tap = play inline (LiteVideo)", so this changed from v9 by plan, not by a decision **(unverified whether intended)**.

### Family

**family-s16**
1. M: no status rings (R8). M: no Messages entry (R9).
2. Keep: the dense ID card (56 px avatar, name · age · blood, allergy chip, stat strip, Show to a doctor, Scan / Papers 2), Needs you now only when it has items, I'm OK in the faces header (D-100), the week strip + Month toggle, Memories as a row.
3. v12: rings + glyphs on the faces; a "Messages · Ate Joy: Dinner at 6? · 2 new" row under the faces; the ID card gets a subtle amber-to-cream gradient and a 1 px inner edge (it is the tab's hero); the Jack 'family-hug' art only in the Needs-you-now empty state (`family-s16-empty-needs`).

**family-s16-empty-needs**
1. As above. Keep: Needs you now not drawn at all.

**family-faces-sheet**
1. Keep: See their stats only when allowed / Send a message.
2. m: the sheet is solid; D-71 makes sheets glass (R18).

**family-papers**
1. Keep: "Confirm 2" / "Fix" (F-13), the trust lines. This is v9 `health-papers` moved under Family (D-100), with no loss except the eyebrow sub-line "Photos and PDFs" (m).

**family-acting**
1. Keep: faces filtered, reason once in the bar.

### Medical ID, Settings, View as

**medid-dense / medid-dense-empty**
1. Keep: dense fields and the "Add …" chips.
2. m: the lock-screen switch and preview (R20); v9 listed 2 emergency contacts, v11 shows 1 (fixture only).

**settings-s16**
1. Keep: the account row, the Simple mode row, 8 group rows with one-line values (far denser than live `me-light.png`).
2. m: no art, which is correct for settings.

**settings-display**
1. Keep.

**settings-alerts**
1. M: the wrong digest copy (R13).

**settings-acting**
1. Keep: locks + "View only".

**viewas-pick**
1. Keep. **viewas-sos**: keep (no Jack and no scene on SOS, which is correct).

### Onboarding

**onboard-1**
1. B (part of R3): the Jack art is a placeholder circle. Live `SignIn.tsx` / `StartDone.tsx` use `JackArt` 'hello'. v12: draw the real 'hello' sticker at 112 px (PLAN.md:296 already says "Jack art 112 px").

**onboard-2, -3, -4, -5**
1. Keep: the copy and permission-in-context. m: onboard-4 could show a small static sky chip for the chosen place (the same SKY pair), as a preview of the weather hero.

**onboard-5-done**
1. m: the check-draw only; live `StartDone` shows Jack 'hello'. v12: Jack 'celebrate' with the check-draw.

**v11-hues**
1. Keep: five hue families with contrast numbers. Add a sixth swatch, "Scene", showing the 4 SKY pairs + SCRIM with their white-text ratios.

---

## Today weather hero: spec for v12

Build on the shipped `src/features/weather/WeatherScene.tsx` + `scene.ts` + `scene.css`. Do not add a new `Sky` component.

**Size (390 px wide).**
- Expanded (calm, no Next up): **232 px**.
- Compact (Next up, alerts-off or a warning on screen): **196 px**. That is v11's 168 + 17%. Live compact is about 116 px by CSS (`today.css:165-170`, **unverified in a shot**), so 196 is about 1.7× live compact and well under live expanded (≈ 415 px in `today-light.png`).

**Today budget.**
- Calm: 959 − 168 + 232 = 1023, plus the R4 More row (about 80 px) ≈ 1100. Meets the ≤ 1100 target; if it goes over, hide the "More" heading text.
- Alerts-off: 921 + 28 + 80 ≈ 1029 (budget 1150).
- Quake: about 1177 (budget 1400). Storm: about 1195 (budget 1500).

**Content, top to bottom.**
1. Kicker: "General Santos · as of 9:00" (13 px, 600).
2. Temperature: 56 px serif expanded, 44 px compact. The condition "Partly cloudy" (17 px, 700) sits beside it.
3. The W-2 line: "Sunny till 2 PM, rain after 3. Bring an umbrella." (15 px).
4. Pills inline: "Feels 38° · Extreme caution" and "Drink water".
5. Expanded only: the action box (cream, ink text) with Jack 'ready-for-rain' or 'drink-water' at 56 px. Never on a warning, a heat band of Danger or above, or a storm (D-91, `WeatherCard.tsx:70-71`).
6. A 3-slot hourly strip (time, 22 px sky icon, rain %): a row of 56 px expanded, 40 px compact.

The whole card is the link to `#weather`, with a chevron top right.

**Layers.** Every layer is `aria-hidden`, CSS and inline SVG only, with no canvas and no WebGL on Today.

| Layer | When | How | Status |
|---|---|---|---|
| Sky gradient | always | `SKY[tod]` from `scene.ts:11-16` (night / dawn / day / dusk from the place's sunrise and sunset). Overcast greys the gradient by 40% | shipped |
| Sun + glow | clear or partly, day / dawn / dusk | `.wxs-sun`, 54 px radial + 40 px glow, 7 s pulse | shipped |
| Moon + glow | clear or partly, night | new: 40 px disc `#F4F1E6` with a 28 px soft glow `rgba(244,241,230,.35)`, and a crescent mask by phase (optional) | **add** |
| Stars | night, clear or partly | `.wxs-stars` twinkle 4 s | shipped |
| Clouds | partly (2), overcast (4), rain or storm (3, darker fill) | `.wxs-cloud` SVG. Two depths drift at 70 s and 110 s (parallax). Set a negative `animation-delay` so clouds start in view | shipped; **add depth + delay** |
| Fog | fog | `.wxs-fog`, 3 blurred bands | shipped |
| Rain streaks | drizzle (12), rain (24), storm (32) | `.wxs-rain i`, 12° slant, 0.9 s fall | shipped |
| Lightning | storm | `.wxs-flash`: one double flash every 7 s, peak opacity .55 (well under 3 flashes a second, WCAG 2.3.1). No flash under reduced motion | shipped |
| Heat glow | heat index ≥ Danger (`isHot`) | `.wxs-heat` orange bottom glow | shipped |
| Heat shimmer | `isHot` only | new: a 40%-height band at the bottom, `repeating-linear-gradient` of 2 px transparent lines, `translateY` ±2 px over 1.6 s, opacity .18. Transform only | **add** |

**Text contrast.**
- White text only, on a scrim block behind the text (`scene.ts:17` SCRIM .58, `today.css:275` veil), plus `text-shadow 0 1px 8px rgba(0,0,0,.55)` on the number.
- Gate: ≥ 4.5:1 for body text against the lightest stop of every SKY pair after the scrim. The lightest stop is the dawn bottom `#F2A57A`, and the day bottom is `#86C3F2`. `scene.test.ts` already asserts this; extend it to the moon glow and the heat glow.
- The light theme uses the same scene. Do not tint it with the v11 pale blue.

**Motion rules.**
- `prefers-reduced-motion`: `scene.css:43-44` already stops every animation. v12 adds fixed static positions (sun and moon in place, clouds at 20% / 60% x, rain hidden and replaced by a static 8-streak SVG) so the frozen frame still reads as the condition.
- Pause when the card is off-screen (IntersectionObserver) and when the page is hidden (`visibilitychange`, as in `look/Sky.tsx`).
- No scene animation while the SOS screen, Simple SOS or an IncomingSos is up (PLAN M2-3).
- Cost: 0 KB beyond the CSS already shipped, plus about 1 KB for the moon and shimmer.

**Mock frames to draw.** Day partly (calm, expanded); day rain (compact, with Next up); night clear (moon, stars); storm (no Jack); Danger heat (shimmer, no Jack); the reduced-motion static frame. Each in light and dark.

---

## Other places where a dynamic background or richer hero fits (from RESEARCH-GRAPHICS.md)

1. **Health body hero:** the real frosted `Silhouette` with organs. A glow pulses (3 s, opacity .6 to 1) on a metric that needs a look. A mini progress ring under each of the 4 numbers draws in 600 ms. Hue: green. Research line 11 (body highlighter) is not needed, because the shipped anatomy art is better.
2. **Breathe orb:** the orb is kept, and the sheet gets a full-bleed radial backdrop that breathes with it. The Sleep pattern uses the night sky. React Bits `Orb` / particles: no, not worth the WebGL cost.
3. **Discover pick hero:** an illustration (Jack cooking, reading or watching by pick type) with an 8 px parallax, and a season gradient (rainy streaks, Undas candle glow, summer heat).
4. **Family:** the faces row with animated status rings (check-in = ring draw + a small check-draw); a soft amber gradient on the ID card. No moving background (the calendar is dense).
5. **Onboarding:** the real Jack art on 1 and 5-done; a static sky preview chip on 4.
6. **Night-clear Aurora (React Bits, WebGL2):** optional, high-end only, never on Safety or SOS (PLAN.md:474). Do not use it in v12 mocks; the CSS moon and stars cover night.
7. **Safety:** no animated background on purpose (the no-canvas rule). Keep the live red SOS ring glow (`safety-light.png`), which is static.

---

## A. Approved v9 frames removed in 0eea90a: what v11 lost without a decision

| v9 frame | Replaced by | Lost without a decision |
|---|---|---|
| today-full | today-s16 | Weather scene + Jack (R1, R3); "Skip today" (R5); salt line (R17); More tile (R4); "How are you?" label (R16). Greeting inside the card: changed by plan (top bar), OK |
| today-dose-done | none | the done morph frame ("Taken 9:02 · Saved. This card folds away", with Jack well-done in live `NextUp.tsx:96`) (R14) |
| today-weather | none | the whole Weather screen reference: rain map + scrubber, 48 h hourly, 10-day, outlook (R14). Live `weather-dark.png` matches it partly |
| today-storm-track | none | Storm tracking (R14, R11) |
| today-alarmfix | none | the alarm-fixed toast (still in PLAN row 0) (R14) |
| today-storm | today-s16-storm | storm scene as the hero, "Track the storm", source (R11). "No I am OK card" in v9 was reversed by D-100: OK |
| today-offline | none | the offline state of the hero ("as of 2:05 PM, may be out of date") and the queued items list (R14) |
| today-log | none | the Quick log sheet with 6 tiles + More: Walk, Move, Pain, Sleep, Temperature (R4, R14) |
| today-breathe | breathe-* | Relax / Sleep / Calm patterns + sources (R10). The 1-5 mood scale → 3 faces: decided (W-16) |
| today-week | none | My week (7-day dose tiles, week plan) (R14) |
| lock-sos | none | the carer SOS banner (D-78) has no frame (R14) |
| health-home | health-A / B | headline, family streak, six numbers incl. Sleep and Steps, "1 medicine to check: Still taking it?", the body picture (R6, R7). The Browse grid → "More in Health": decided |
| health-labs, -labs-empty, -labdetail | *-s16 | none (kept, items 1-7) |
| health-papers | family-papers | the "Photos and PDFs" sub (m). The move itself: decided (D-100) |
| health-library | (Discover Learn) | the per-condition short list ("For Mama's conditions") (m, **unverified** whether Library keeps it) |
| nudge-home | none | the guided morning/evening check with rings, Jack, family streak (R7) |
| learn-home | discover-s16 / learn | the Your benefits shelf (R12); season card bullets + source (moved by plan, m); Jack reading (m) |
| fun-watch | discover-watch-s16 | source + "Opens in YouTube" per card **(unverified intent; PLAN W-23 plays inline)** |
| safety-medid | medid-dense | the lock-screen preview, Wallet card, second contact (R20) |
| family-home | family-s16 | status rings + legend (R8); Home / Messages / Plan segments (R9); the "Answer for Papa" and "Fix Papa's phone" rows are in Needs you now per PLAN (CarerCards): OK **(unverified in frame: only the missed-dose row is drawn)** |
| family-msgs, family-thread | none | Messages, voice notes, photos, quick replies "All good / On my way" (R9, R14) |
| family-plan, family-add | family-s16 calendar + "Full plan" | tasks with ticks and notes (shared / only me) have no frame; Add has no frame (R14) |
| family-member | (Current app "Member page" kept) | none |
| start-who / pin / done / done-fix | onboard-1..5 | Jack art (R3); the phone-fix variant (Papa's battery saver) has no v11 equivalent **(unverified: PLAN m2-2 covers the alarm test only)** |
| start-me | settings-s16 | none found; all rows map to groups |
| start-update | settings-s16 About | the update sheet (version, size, what changed, Install / Later) has no frame (m) |
| start-dependent | (Member page) | none |

## B. Feature parity: live → v11 / PLAN rev 5

| Live feature (file) | v11 frame / PLAN | Status |
|---|---|---|
| Weather scene, hourly, action box + Jack (`WeatherCard.tsx`) | today-s16 / PLAN.md:137 | **MISSING (R1)** |
| Next up: Took it / Skip / In 10 min / multi-pick / done morph (`NextUp.tsx`) | Take / Snooze | **Skip MISSING (R5)**; multi-pick not drawn (unverified) |
| Quick log 6 tiles + More (Dose taken, Food, Walk, Move) + salt line (`QuickLog.tsx`) | 5 tiles + I'm OK | **More MISSING (R4)**; salt not drawn |
| SOS hold, SelfCare, PlanToday, SeeWeek | yes | OK |
| AlertBand / StormCard / AlertCardToday | WarningCard / FamilyNotice | OK, but storm links are MISSING (R11) |
| AlarmFixedToast, IncomingSos | PLAN row 0 | no frame (R14) |
| AlertsBanner, UpdateCard, PwaBanner, NearbyList, WeekLine | PLAN row 11 "More" | only the setup row is drawn **(unverified)** |
| Jack button on every tab (`shell/JackFab.tsx`) + Ask sheet | hidden on every frame | **MISSING in the mock (R3)**; PLAN keeps AskSheet (PLAN.md:414) |
| Health: PersonChips, Kpis, MedicinesSummary, LabsRow | yes | OK |
| Health: insight headline (`Health.tsx:92`), NudgeCard rings + streak, BodyMap anatomy, LatestList, MedReview "Still taking it?" (`MedReview.tsx`) | — | **headline, rings, streak MISSING (R7); BodyMap flattened (R6)**; LatestList and MedReview not drawn **(unverified: may sit in Readings / Medicines)** |
| Health Papers / Library / Videos | Family / Discover | moved (D-100, plan): OK |
| Discover: PickCard, SeasonCard, 5 subs | yes | OK (season as a row, by plan) |
| Learn: Medicine wiki, Recipes, Library, Learn together, Your benefits | 4 tiles | **Your benefits MISSING (R12)** |
| Family: Home / Messages / Plan segments, check-in, roll-call rings, CarerCards, Report, Member page, Memories | ID card, faces, calendar, Memories; Member page + Report in the Current app group | **Messages entry (R9), rings (R8)** |
| Me: identity, Simple mode, carer rows, sharing, SOS contacts, Medical ID, Alerts, 8 PM summary, push, Privacy, call permission, alarm health, quiet hours, text size, theme, language, setup checklist, sensors, update / admin, passkey, switch, forget | settings-s16 + groups (PLAN.md:218-236) | all mapped; **digest copy wrong (R13)**; call permission row (`Me.tsx:57-65`) maps to Alerts per PLAN, not drawn **(unverified)** |
| Medical ID "Show on lock screen" (`MedicalId.tsx:48`) | text only | **R20** |
| Safety hub, SOS, first aid, go-bag, IDs | Current app group, unchanged | OK |

## C. Could not verify

- Live content below the fold: the shots are one viewport each.
- The live compact weather card height (estimated from CSS).
- Whether NearbyList, WeekLine, Update and the PWA banner render under v11's "More".
- Where LatestList and MedReview land in Health.
- Whether the Watch inline player is intended over "Opens in YouTube".
- The phone-fix onboarding variant.
- Whether the Library keeps the per-condition list.

---

## Top 12 upgrades for v12

1. Rebuild the Today weather hero on the shipped `WeatherScene` (expanded 232 / compact 196 px, 56 px serif temperature, hourly strip, action box + Jack) and add a moon, cloud depth and heat shimmer. Draw 6 condition frames. (R1)
2. Re-plan L9: extend `WeatherScene`; drop the new `look/Sky.tsx` for Today. (R2)
3. Put Jack back: the Jack button on every tab frame and the real `JackArt` in the weather action box, Next up done, breathe-mood, Learn, empty states and onboard-1 / 5-done. Never on alerts, storm or SOS. (R3)
4. Add a "Scene hero" card type to the design rules (one per tab, may animate, contrast-gated), so the density rules stop flattening heroes; log it as a decision. (R15)
5. Quick log back to 3×2 with More (Dose taken, Food, Walk, Move), the "How are you?" label and the salt line. (R4, R16, R17)
6. Next up: Take / Snooze / Skip and the done morph with Jack well-done. (R5)
7. Health: the real frosted anatomy body with glows in the BodyHero, the 3-ring nudge row, a one-line headline and the streak. (R6, R7)
8. Family: status rings + glyphs on the faces, a Messages row with preview and badge, and the ID card gradient. (R8, R9)
9. Breathe: the real Relax / Sleep / Calm patterns with sources, plus a backdrop that breathes with the orb. (R10)
10. Storm frame: a night storm scene with forecast copy, and the WarningCard with What to do, the PAGASA source and the Go-bag row. (R11)
11. Content fixes: the Your benefits Learn tile, the "8 PM summary" carer copy, and the lock-screen switch on Medical ID. (R12, R13, R20)
12. Restore mock coverage (Weather screen, Storm tracking, offline, dose-done, alarm toast, Quick log sheet, My week, carer SOS banner, Messages / thread / plan / add, nudge hub) under "Current app", and draw the D-71 glass tab bar and sheets. (R14, R18)

---

## v12 verification (2026-10-30)

**Verdict: FIX_FIRST.** Three new major regressions and two partials must be fixed first. Each is a small mock or plan edit.

### How this was checked

- **What was rendered:** the 54 frames of group "v12 · Session 16 redesign (for approval)" in a snapshot of the working copy of `docs/session-16/mockup-v11.html`. Headless Playwright 1.64.1 clicked each frame's index button and used the page's `#t-light` / `#t-dark` toggle, at 390 px wide, light and dark, with the phone expanded to full height.
- **Shots:** 108 PNGs in the session scratchpad, `v12/<id>-<theme>.png`.
- **Page heights:** measured with `section.scrollHeight`. The measured values match each frame's own "Page height" note.
- **DOM checks:**
  - text that spills past its card;
  - text clipped with an ellipsis;
  - Jack button state per frame;
  - a v11 → v12 diff of the visible words in every frame that has the same id.
- **Compared against:** the live shots and code cited below.

### R items

| R | Status | Frame | Evidence |
|---|---|---|---|
| R1 weather hero | closed | today-s16, -alertsoff, -quake, -storm, viewas-bar, today-sky-states | Scene hero on a dark sky, serif temperature, the W-2 line, an action box with Jack (calm only), and a 3-slot hourly row. today-sky-states shows dawn, day, dusk, night (moon and stars), rain, storm and Danger heat |
| R2 plan reuses WeatherScene | closed (plan) | — | PLAN.md:8, 161, 427, 462 now name `weather/WeatherScene.tsx` |
| R3 Jack | closed | the Jack button is on every tab frame; it is off on the quake, storm, storm-track and SOS frames (D-91) | Jack art appears in: today-s16, dose-done, offline, nudge-hub, breathe-mood, discover-s16, discover-learn-s16, family-s16-empty-needs, onboard-1, onboard-5-done |
| R4 Quick log More | **partial** | closed on today-s16 / -alertsoff / -quake / -storm / today-log; **open on viewas-bar** | viewas-bar still has the v11 6-in-a-row with "Mood" and no More (`viewas-bar-dark.png`) |
| R5 Skip | closed (but see the R4 viewas-bar row) | today-s16-alertsoff, -quake, -storm, today-offline, today-alarmfix | Take / Snooze / Skip. viewas-bar shows only locked Take / Snooze |
| R6 body picture | closed | health-A, -B, -acting | A frosted figure with organ glows; a glow on BP |
| R7 headline, rings, streak | closed | health-A, -B; nudge-hub | A headline line plus a 3-ring "This week · Family streak 12 days · Log" row |
| R8 face rings | closed | family-s16, -empty-needs, -faces-sheet, -acting | Rings with ✓ / ! / – glyphs and a legend |
| R9 Messages / Plan entry | closed | family-s16 (rows), family-messages, -thread, -plan, -add | See new item N2: the messages model is wrong |
| R10 breathe patterns | closed, one minor | breathe-pick | Relax, Calm (box), Sleep (4-7-8) with a why and a source each. Minor: Sleep does not look disabled (only its text says so); live hides it (`breathLogic.ts:18` `SLEEP_478_ENABLED=false`) |
| R11 storm | closed | today-s16-storm, today-storm-track | Night storm scene, no Jack. WarningCard has PAGASA · See the source, All warnings, Go-bag 6 of 9, Track the storm |
| R12 Your benefits | closed | discover-learn-s16 | A full-width tile |
| R13 digest copy | closed | settings-alerts | "8 PM summary · Carers only" |
| R14 coverage | closed, minor gaps | today-weather, -storm-track, -offline, -dose-done, -alarmfix, -log, -week, -sos-banner, nudge-hub, family-messages / thread / plan / add | Still not drawn: the update sheet, the phone-fix onboarding variant, and the Today "More" rows (NearbyList, WeekLine, Update, add to home) |
| R15 Scene hero type | **partial** | — | In PLAN.md:7, 141, but `02-DECISIONS-bantay.md` has 0 hits for "Scene hero". Log it as a decision |
| R16 "How are you?" | **partial** | closed on the Today frames; **open on viewas-bar** ("Mood") | |
| R17 salt line | closed | Today frames | |
| R18 glass | closed | tab bar, toast, sheets | `--glass-bg` + blur, with a reduced-transparency fallback |
| R19 Discover art | closed | discover-s16 | Jack cooking on the pick hero |
| R20 lock-screen switch | closed | medid-dense | |

### Section A (v9 losses) and section B (feature parity)

All v9 frames listed in section A now have a v12 frame, except the update sheet and the phone-fix onboarding variant (both minor).

Section B items that were open:
- MedReview: stays in the Current-app group (health-meds, family-answer).
- LatestList: not drawn **(unverified)**.
- The Watch "Opens in YouTube" decision: only on fun-livetv **(unverified intent)**.
- Today "More" rows: not drawn (minor).

### New regressions in v12

| N | Regression | Sev | Frame | Evidence | Fix |
|---|---|---|---|---|---|
| N1 | The new Weather screen frame drops three live controls. (1) The place switcher "Use my location / Home 1 / Home 2", which is the N-2 location fix. (2) The PAGASA heat-index band strip. (3) The Rain next 6 h, Wind, Humidity and UV tiles | Major | today-weather | `shots/live/weather-dark.png`; `weather/WeatherScreen.tsx:12, 41, 55-87`. "Use my location" appears only in onboard-4; "Humidity" appears 0 times | Put the place switcher above the hero, the 4-band heat strip under it, and a 2×2 tile grid before the rain map. That adds about 260 px; the budget is 1700 |
| N2 | Family Messages is drawn as a list of per-person threads (Ate Joy / Papa / Lola + New message). Live has one shared family chat | Major (wrong model) | family-messages, family-thread | `family/Messages.tsx:17, 102` ("One shared thread for everyone", migration 0027); v9 family-msgs "6 people, one shared chat" | Draw the single shared chat with mixed senders as the Messages screen |
| N3 | Health and Family heights break PLAN rev 5. The mock notes say the budgets were "raised", but PLAN.md:23 says Health A ≤ 1300, B ≤ 1050, Family ≤ 1450 "unchanged", and the acceptance lines (PLAN.md:211, 242) gate on those numbers | Major (contract) | health-A 1424, health-B 1194, health-acting 1262, family-s16 1609, family-s16-empty-needs 1495, family-acting 1549 | Measured `scrollHeight`; PLAN.md:23, 211 | Either get Lloyd's OK and update PLAN.md:23 and the acceptance lines, or trim. For Family, put Messages and Plan into one 2-up row (about −80 px). For Health B, drop the Progress tile ring, which repeats the BP ring (about −50 px) |
| N4 | The W-22 nudge copy "Morning BP not logged" is gone from Health A / B / acting. "This week · Log" does not say what to log | Minor | health-A, -B, -acting | v11 → v12 text diff | Sub line: "Morning BP not logged · Family streak 12 days" |
| N5 | The calm hero lost the "Drink water" advice under Extreme caution | Minor | today-s16, -alertsoff, viewas-bar | v11 → v12 text diff | Add "· Drink water" to the feels line at ≥ Extreme caution |

### Defects carried over from v11 (not new; fix anyway)

- **medid-dense:** the card text spills 17 px past `.y-hero` max-height 300, so "Atorvastatin 20 mg" is clipped under the Call card (DOM check; the same happens at 0eea90a). Fix: `max-height: none` on that card.
- **Greeting:** the h1 is cut to "Magandang umaga, …" on 8 Today frames (the same happens at 0eea90a). Fix: wrap to 2 lines.

### Kept from v11 (checked, no loss)

- The alerts-off card is first under weather.
- The WarningCard close and "Hide: still in Safety".
- The acting bar with one reason line (viewas-bar, health-acting, family-acting, settings-acting).
- Today calm at 1069 px is within ≤ 1150 (PLAN.md:23).
- Today alerts-off 1047, quake 1192 and storm 1402 are within budget.
- W-1 / W-2 / W-4 / W-10 / W-12 / W-15 / W-16 wording is unchanged where it is used.
- Labs frames are unchanged.

### Not verified

- Reduced motion (the frames use CSS only; no emulation pass was run).
- The season gradient and Scene swatch (the builder notes they are not drawn).
- The contrast ratio of the white text on the new sky states (not measured).

---

## v12 re-verification (2026-10-30, 56 frames)

**Verdict: FIX_FIRST.** There is one contract item to fix, a set of numbers in PLAN.md. The mock itself is ready.

### How this was checked

- I re-rendered all 56 v12 frames in light and dark (Playwright, 390 px, full height, theme toggle), the same way as the first pass.
- I re-ran the DOM checks:
  - text that spills past its card: **none** (medid-dense is fixed);
  - ellipsis on any text: **none** (the greeting now wraps to 2 lines).
- I ran a v12-before → v12-now diff of visible words for every frame.
- I looked at these frames: today-s16, today-weather (dark), today-more, family-messages, viewas-bar, health-B (dark).

### Fixes confirmed

| Item | Status | Frame / evidence |
|---|---|---|
| N1 Weather controls | closed | today-weather has "Use my location / Home 1 / Home 2", the 4-band heat strip (Extreme caution selected), and Rain next 6 h 80%, Wind 9 km/h, Humidity 70%, UV 10, matching `shots/live/weather-dark.png` |
| N2 one shared chat | closed | family-messages and family-thread: "One chat for the whole family · 6 people", mixed senders, quick replies, voice note, photo (`family/Messages.tsx:17, 102`) |
| R4 / R5 / R16 on viewas-bar | closed | viewas-bar: 3×2 quick log with "How are you?" and More, plus Take / Snooze / Skip, all locked for a viewer without edit access |
| R10 minor | closed | breathe-pick shows only Relax and Calm. Sleep is hidden, as in live (`breathLogic.ts:18`) |
| N4 | closed | health-A / B / acting: the nudge row is headed "Morning BP not logged" |
| N5 | closed | today-s16 action box: "Bring an umbrella · drink water" |
| R14 gaps | closed | today-more (Near you, This week, Update ready, Add to home screen, Finish setup) and update-sheet (version, size, what changed, Install / Later) |
| medid clip, greeting cut | closed | DOM checks above |
| R15 Scene hero | open **by design** | PLAN rev 7 Q5 → D-101 is Lloyd's call |

### Open items

1. **Budget numbers in PLAN do not match the mock.** This is the reason for FIX_FIRST.
   - The mock now measures, and proposes:

     | Frame | Measured | Mock proposes |
     |---|---|---|
     | health-A | 1469 | ≤ 1500 |
     | health-B | 1238 | ≤ 1250 |
     | health-acting | 1306 | ≤ 1350 |
     | today-weather | 1717 | ≤ 1750 |
   - PLAN.md rev 7 (lines 9, 36, 163, 194, 208, 217) still proposes Health A ≤ 1450, B ≤ 1200 and Weather ≤ 1700, quoting the old measures 1424 / 1194.
   - If Lloyd approves Q6 as PLAN states it, the lane height gates fail against the approved design.
   - Fix: set PLAN Q6 to 1500 / 1250 / 1350 (acting) / 1750 and update the quoted measures. Family 1650 / 1500 / 1550 already agree.
2. **Minor, new: "Seen by Ate Joy, Papa" in family-thread.** Live has no read receipts (`family/Messages.tsx` has no seen or read field). The frame implies a feature that does not exist. Drop the line, or log it as a new feature.
3. **Minor, new: the Weather screen dropped the live "Season and sun" card** (sunrise and sunset, "Monthly outlook: see PAGASA", "Typhoon season: June to November"; `weather/WeatherScreen.tsx:194-198`). The earlier v12 "Outlook" line was removed too. Fix: one 64 px row "Sunrise 5:42 · Sunset 5:31 · Typhoon season Jun–Nov" above Official sources (about +64 px, so 1781 against the proposed 1750: also raise that number, or fold the row into the hero).
4. **Minor, carried:** family-messages has no Call or Messenger video action for the tapped person (live `Messages.tsx:18`; v9 "Video call on Messenger").

### No other new regressions

- The v11 wins still hold: the alerts-off card first, the WarningCard close, the acting bar with one reason line, and the W-copy.
- All non-Health, non-Family and non-Weather frames are within budget.
- Today calm measures 1087 against ≤ 1100.
- Jack is on every tab frame and off on the warning, storm and SOS frames.

### Still not verified

Reduced-motion emulation, sky-text contrast ratios, and the season gradient and Scene swatch (not drawn, by the builder's note).
