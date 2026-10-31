# Bantay v13 mockup lanes: shared brief

You build phone-screen mockup artboards for Family Bantay (a Philippine family health + safety app; users include older relatives).
Output: one self-contained `.dc.html` file per screen, written with your file-writing tool into
`C:/Users/Lloyd/AppData/Local/Temp/claude/D--Claude-Bantay--claude-worktrees-penpot-figma-analysis-a4dc0a/175709cd-9ca8-4447-90ef-7108709ca765/scratchpad/v13/project/`.
Write ONLY your own files. Do not publish, do not open a browser, do not run builds. Do not edit other files.

## Read first (style anchors, copy their structure)
- `project/Health.dc.html`: the helmet CSS (classes .ph .pad .sh .card .grp .row .ic .t .s .v .btn .bp .bt .tabs .tab .jack .scroller), the tab bar markup and the Jack button. Copy these verbatim into your files.
- `project/Main.dc.html`: motion pattern (CSS @keyframes in the helmet `<style>` + a `@media (prefers-reduced-motion: reduce)` block that sets `animation:none`).

## File format (strict, each rule fails silently if broken)
- Skeleton: `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>…</title><script src="./support.js"></script></head><body><x-dc><helmet>…</helmet> …markup… </x-dc><script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":H}}'>class Component extends DCLogic { renderVals() { return {}; } }</script></body></html>`. Keep the support.js line exactly.
- Root: `<div class="ph" style="height: Hpx;">` fixed 390 wide; H = full content height incl. ~180 px bottom room for the tab bar. Same H in `$preview`. Report H.
- Close every non-void element, quote every attribute, escape `&` as `&amp;` in text and URLs.
- No `{{ }}` holes needed; static markup. No JS-built UI, no iframes, no emoji, no external images. Icons: inline stroke SVG (aria-hidden="true" when decorative).
- Jack image: `<img src="/_blob/6e274754172d6319fa63b8d376425ae6" alt="">` (only this blob exists). Photos: tinted placeholder block labelled `[Family photo]` etc.
- Real `<button>` / `<a href>`; icon-only controls get `aria-label`. Every tap target >= 44 px tall. Text contrast >= 4.5:1 (grey #6B675F on white is the lightest allowed small text).
- Links between screens: `href="Name.dc.html"` (existing: Main, Health, HealthMember, Family, Discover, Safety, JackSheet, Weather, Mindful, FamilyFeed, Readings, Labs, Medicines, Visits, MoveFood, BodyWiki, Warnings, StormTracker, Hazards, RescueMap).

## Look: "Apple structure, Bantay warmth" (decision D-105)
- System font stack `-apple-system,"SF Pro Text",Inter,system-ui,sans-serif` + Google Fonts Inter link (copy from Health).
- Base: warm grouped background #F5F3EF, white cards (radius 20) and inset grouped lists (radius 16, hairline separators), green accent #1E6B4E / tint #E3EFE8. Tints: blue #2459C7/#E5EDFB, red #B42318/#FBE7E4, amber #8A4B06/#FDF1DC, teal #0F766E/#DDF1EE, purple #6D4BC2/#EEE9FA.
- Sub-screens are pushed pages: top row = back button (44 px, chevron + parent name, e.g. "‹ Health") on the left and an optional action on the right; then a 34 px bold large title; then content. The floating glass tab bar stays (parent tab marked `on`) and the Jack button stays.
- Each screen opens with ONE hero object that shows its value at a glance (a big number + chart, a map, an orb…), then grouped lists with values, carousels where content is browsable. No grids of tiny icon cards.
- Per-tab themes are allowed where they serve the content (weather sky, calm dark teal, safety red accents) but keep type, radii, list style and tab bar identical.
- Motion only where it carries meaning (live data, breathing, weather); always with the reduced-motion block.
- Content truth: use the real data below. Anything not in the app yet, or any number you have to invent for a chart, is labelled on screen ("Sample numbers in this mockup" / "[placeholder]"). Never invent health stats as real.
- Copy: plain words, short, kind. No exclamation-heavy marketing.

## Real data to use
- Admin user: Loyd (initial L). Family (10): Me, David, Jesson, Joshua, Ma, Marifel, Rosalino, Sevilla, Susana (+ "pamilya" shared account, skip it).
- Loyd: ALT 115 U/L High (normal up to 55), lab paper 6 Oct 2026; no BP this week; no medicines added; no walks.
- Ma: Aspirin 1 tablet, Candesartan 1 tab, Hydroxurea 1 capsule, Rosuvastatin 1 tab, all 8:00; labs "4 to ask · 6 Oct"; 5 "Still taking …?" questions.
- Joshua: Sea water nasal spray 1-2 sprays per nostril at 8:00, 14:00, 20:00; missed 8:00 today.
- Sevilla: 5 questions waiting (Acetylcisteine, Cefixime, Pneumococcal polysaccharide, Salmeterol plus, Tergecef).
- Place now: Tagbilaran (phone GPS). Home zones: Dampas, Tagbilaran (Bohol) and Conel, General Santos.
- Weather (Open-Meteo): 26°, partly cloudy, feels 27°, H 30 L 24, rain from 8 PM (now 80%, 10 PM 55%, 1 AM 39%), rain tomorrow from 10 AM ~11 h (100%). Fields available: temp, humidity, feels-like, weather code, wind speed, gusts, UV; hourly temp/rain chance/code (48 h); daily 10 days code/min/max/rain max/UV max/sunrise/sunset. Air quality NOT fetched today (Open-Meteo AQ could add it: label "new").
- Alerts: Earthquake M4.6, 7 km NE of Tago, 272 km away, USGS, 11 h ago ("you may feel it"); storms: none (GDACS); sources USGS, GDACS, PAGASA CAP, checked every 10 min.

## Screen facts from the code (what each real screen holds)
- Readings: 7-day averages, "My numbers" tiles, Vitals list with Latest/Average/Normal toggle; metric page: latest value + range chip, Add reading, This week/This month, Morning/Evening, chart with green healthy band, monthly averages, "Where the range comes from", last 12 readings, tips (MedlinePlus). Empty: "No readings for this yet".
- Labs: source card (lab papers), filters All / To ask about / In range, one card per test (value, date, range bar, "Ask about it"); detail: verdict, range bar, What it means (MedlinePlus), last 3 results trend, Questions to ask your doctor (Add → shared with Visits).
- Medicines: Add, Today with Take/Skip + progress ring, weekly counter, Active list (times, stock line), Paused, Past; detail: reminders, stock, last-7-days grid; Refill: days left, Add refill to plan, I bought more; reminder actions "I took it / In 10 min / Skip today"; missed dose → family after 30 min.
- Visits: next visit card or "No visit booked", follow-ups, Bring checklist (BP and sugar log, medicine list, recent labs and prescriptions, your questions), question box, "Prepare visit summary", coming up, past.
- Move & food: weekly minutes ring, today's moves with posture chips, move detail with "Stop if" list, minutes stepper, doctor-OK gate; food: log a meal, salt limit 2000 mg (1500 for BP), 7-day sodium chart, water; steps via Health Connect (not connected for Loyd).
- Body wiki: 9 body systems rail, tap-spot body figure, info panel with "Your numbers" link and "Medicines that act here", 31 parts (what / illnesses / warnings / prevention, MedlinePlus).
- Breathing today: patterns Relax (in 4, out 6) and Calm box (4-4-4-4), Sleep 4-7-8 hidden; durations 1, 3, 5 min; orb; buzz toggle; after: Worse / Same / Better. Mood: four faces "How are you?"; "Unwell" alerts family once a day.
- Discover Watch: 12 checked YouTube videos (privacy-mode player after tap). Listen: articles read aloud by the phone (text-to-speech). No podcasts or radio yet.
- Warnings: list from safety_alerts, phone warnings, safety news, PAGASA bulletin link. Storms: GDACS rows + PAGASA bulletin. Rescue map: map with shelters/places + evacuation list, hotlines (27 numbers); "no verified list" away from home areas. Hazards: HazardHunterPH data for Dampas only (earthquake: can have very destructive shaking; nearest gov health facility Dampas Barangay Health Station 728 m); other zones: none yet.
- Family: Messages (text, voice note, photo, heart kudos), Memories (private photos, captions), sharing is per person (offer → accept → stop), check-in faces, Needs-you-now cards. No feed exists yet.

## Return
For each file: name, height H, 3-line summary of hero + sections, and anything you labelled as new/sample. Then: "checklist: <one line on any rule you could not follow>".
