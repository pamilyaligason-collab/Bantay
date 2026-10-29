# Family Bantay UI/UX + accessibility audit (Opus, read-only)

Base: main 6f32f97, worktree `D:\Claude\Bantay\.claude\worktrees\family-bantay-review-check-ac44fa`. Contract: mockup v9 + D-66 (v6 cream/green) + D-91 (Jack never on SOS, emergency result or diagnosis screens; get-help = set-up/to-do only).
Evidence: code reads plus screenshots in `docs/session-14/shots` and `docs/session-13/shots` (390 px wide; zoom shots are 195 px wide).
Paths are repo-relative unless noted. Severity: **major** = it hides or blocks content or safety text, misleads, or fails WCAG AA. **minor** = polish or clarity.

---

## A. Layout and overlap

### UI-1 major: "Ask me anything" hint covers the SOS caption and is cut off at 200%
- Evidence: `docs/session-14/shots/T2/today-late.png` (the bubble sits on "Hold for 3 seconds. Your phone calls your family…"); `docs/session-14/shots/T2/today-zoom.png` (bubble clipped at the left edge: "sk me anything"); `docs/session-13/shots/T/today-full-light.png` (it covers the "See nutrients" link). CSS: `src/features/shell/shell.css:143`. `.sh-hint` uses `right: 78px; bottom: tabbar-clear + 12px; white-space: nowrap`, with no max-width.
- Impact: it hides safety text under the SOS button for 8 s on first launch. That is the moment a new older user is reading it.
- Fix: put the bubble **above** Jack, not beside him: `right: 14px; bottom: calc(var(--tabbar-clear) + 56px + 10px); max-width: calc(100% - 28px); white-space: normal;`. Add a small tail (`::after` triangle) pointing down at Jack. Optional: drop the hint while `.td-sos` is in view (IntersectionObserver in JackFab). The CSS change alone fixes both screenshots.
- Files: `src/features/shell/shell.css` (and optionally `src/features/shell/JackFab.tsx`).

### UI-2 major: the Family Plan "+ Add" button sits under the Jack button
- Evidence: `docs/session-13/shots/F/plan-empty-light.png`. Only "+ A" shows; Jack covers the rest. CSS: `src/features/family/plan.css:42-43`. `.fm-fab-wrap` is sticky at bottom 0 and right-aligned. Jack is fixed at right 14px, bottom `--tabbar-clear` (`shell.css:135`).
- Impact: the main action of the screen is half hidden. Taps near the right edge open Jack instead.
- Fix: `.bt[data-jack] .fm-fab-wrap { padding-right: 76px; }`. Better, and it matches Medicines: move Add into the top row (like `.md-addrow` in `Medicines.tsx:93`) and drop the floating button.
- Files: `src/features/family/plan.css` (+ `src/features/family/Plan.tsx` if moved).

### UI-3 major: tab bar labels overlap at 200% (195 px)
- Evidence: `docs/session-14/shots/L/health-labs-zoom200-light.png`: "TodayHealthDiscoverFamilySafety" run together. CSS: `shell.css:47` (13 px labels, 5 equal slots of about 35 px).
- Impact: the main navigation becomes unreadable for exactly the users who enlarge text.
- Fix: `@media (max-width: 300px) { .sh-tabs button span:not(.sh-ic) { display: none; } .sh-tabs button[aria-current="page"] span { display: block; } }`. This shows icons only and keeps the active tab's label. Every tab keeps its `aria-label`, so check TabBar.tsx sets one. Also add `overflow: hidden; text-overflow: ellipsis; max-width: 100%` on the label span as a safety net.
- Files: `src/features/shell/shell.css` (verify `src/features/shell/TabBar.tsx` aria-labels).

### UI-4 major: screen titles and greeting cut off at 200%
- Evidence: `today-zoom.png` ("Goo…" in the top bar); `health-labs-zoom200-light.png` ("Lab res…"). CSS: `shell.css:22` `.sh-top-greet` nowrap + ellipsis; `shell.css:105` `.sh-subhdr h1` nowrap + ellipsis.
- Impact: at large text, the user cannot tell which screen they are on.
- Fix: allow two lines: `white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;` on both. For the greeting, drop the name below 300 px ("Good morning").
- Files: `src/features/shell/shell.css`.

### UI-5 minor: the Health "Your week" rings leave one ring alone on the second row
- Evidence: `docs/session-13/shots/H/overview-top-light.png`: 3 rings, then "Move" alone. CSS: `src/features/health/nudge.css:8` `repeat(auto-fit, minmax(96px,1fr))`.
- Fix: `grid-template-columns: repeat(2, minmax(0,1fr))` (2x2). Put the count inside each ring ("2/3") so the ring explains itself. "Not yet this week" then becomes "0/3".
- Files: `src/features/health/nudge.css`, `src/features/health/NudgeCard.tsx`.

### UI-6 minor: Today is long and its order mixes jobs
- Evidence: `src/screens/Today.tsx:66-94`. Order: weather, next dose, 6 quick-log tiles, SOS, breathing card (with a journal citation), plan, see week, More. `today-zoom.png` shows the breathing source taking half a screen at 200%.
- Fix: (a) Fold the breathing card's Source line into a small "Source" link next to the safety line (UI-C27). (b) Collapse SelfCare to a one-line "Take a breath" row that expands on tap. (c) Rename "See the week / My week" to one label with a chevron (`src/features/today/SeeWeek.tsx:9-11`): "My week ›".
- Files: `src/features/today/SelfCare.tsx`, `src/features/today/SeeWeek.tsx`, `src/features/today/today.css`.

### UI-7 minor: Medicines stock chips are unclear
- Evidence: `docs/session-14/shots/M/meds-list.png`: "Refill in 6 days" vs a bare "24 days". Source: `src/features/health/medDetailLogic.ts:33`.
- Fix: the non-low chip reads `${days} days left`. Give the low chip a warning icon (`warn`) so it does not depend on colour alone.
- Files: `src/features/health/medDetailLogic.ts` (+ its test), `src/features/health/Medicines.tsx`.

### UI-8 minor: Inbox shows the same message twice when empty
- Evidence: `src/features/inbox/Inbox.tsx:37-39`. An info card says "Missed doses, storms and SOS… appear in this list". Directly below, the empty card says "Warnings, medicine reminders and family alerts show here."
- Fix: when `items.length === 0`, show only `<EmptyState icon="bell" title="No alerts yet" body="Family alerts show up here." />`. Show the info note only once alerts exist.
- Files: `src/features/inbox/Inbox.tsx`.

---

## B. Missing graphics and visual cues

### UI-9 major: Sugar and Water use the same droplet icon
- Evidence: `src/features/shell/Icon.tsx:28`: `glass: IconDroplet` (the same glyph as `drop`). Quick log `src/features/today/QuickLog.tsx:19,22` shows two identical drops (`today-late.png`). Labs empty also uses `drop` (`LabsList.tsx:77`).
- Impact: two of six tiles look the same. Older users go by the picture.
- Fix: `glass: IconGlassFull` (already in @tabler/icons-react 3.x, `IconGlassFull.mjs` present). Labs empty: `icon="flask"` (already mapped). Optional: give Sugar `IconDropletHeart` as a distinct "blood sugar" sign.
- Files: `src/features/shell/Icon.tsx`, `src/features/health/LabsList.tsx`.

### UI-10 major: EmptyState's Jack never shows; callers cannot choose a pose
- Evidence: `src/features/look/EmptyState.tsx:9`. Jack (`empty-list`) shows only when `icon` is missing, and all 7 callers pass an icon: `discover/listen/Screen.tsx:17`, `family/Plan.tsx:81,83,84`, `health/BodyMap.tsx:38`, `health/LabsList.tsx:77`, `today/MyWeek.tsx:83`.
- Fix: add `jack?: JackName` to EmptyState (it wins over `icon`, 88 px, `decorative` because the title says the same). Then:
  - `family/Plan.tsx:83-84` (nothing today / later) → `jack="empty-list"`; `:81` (done filter) → `jack="well-done"`.
  - `today/MyWeek.tsx:83` "Your week will show here" → `jack="walking"`.
  - Family Messages empty (`family/Messages.tsx`, "No messages yet. Say hello.", a plain grey box in `docs/session-14/shots/F2/messages-light.png`) → EmptyState `jack="family-hug"`, title "No messages yet", body "Say hello to your family."
  - Keep icons on `BodyMap` (the body figure is already the picture), `LabsList` (flask, see UI-9) and `listen` (that screen already shows Jack at the top; the rule is one per screen).
  - D-91 check: none of these is SOS, an emergency or a diagnosis screen.
- Files: `src/features/look/EmptyState.tsx` (+ `EmptyState.test.tsx`), `src/features/family/Plan.tsx`, `src/features/family/Messages.tsx`, `src/features/today/MyWeek.tsx`.

### UI-11 minor: the empty Medicines list has Jack but no button
- Evidence: `src/features/health/Medicines.tsx:98-100`. A hand-made row with `JackArt medicine` and text that says "Tap Add…". The Add button sits far away, top right. (The brief's "no empty Medicines visual" is out of date: the art exists.)
- Fix: replace it with `<EmptyState jack="medicine" title="No medicines yet" body="Add one, or scan a prescription." action={canEdit ? { label: 'Add a medicine', onClick: () => open() } : undefined} />`. Requires UI-10's `jack` prop, so it goes in the same lane as UI-10 or lands after it.
- Files: `src/features/health/Medicines.tsx`, `src/features/health/medicines.css` (remove `.md-empty`/`.md-jack`).

### UI-12 minor: Ask offline panel has no Jack (the mockup has one)
- Evidence: mockup `data-s="ask-offline"` uses `jack-offline` beside "Jack needs the internet". The app's `src/features/assistant/OfflinePanel.tsx:8` is text only.
- Fix: `<JackArt name="offline" size={56} decorative />` inside `.as-off-banner`. Not an emergency screen; the Call 911 row stays as is.
- Files: `src/features/assistant/OfflinePanel.tsx`, `src/features/assistant/assistant.css`.

### UI-13 minor: Family status uses emoji (✅ ⚠️) for its badges and legend
- Evidence: `src/features/family/People.tsx:124` (`st.emoji` on the avatar), `:135` (legend line with emoji). Emoji look different on each Android brand and do not follow the light and dark themes. Every card also says "No check-in yet" (`docs/session-14/shots/F2/family-home-dark.png`).
- Fix: show the badge as a Tabler icon on the avatar ring: `check` on `--ok`, `warn` on `--warn`, with a grey ring for quiet. Shorten the legend to icons plus "OK today · Needs a look". Keep the words in the aria-label.
- Files: `src/features/family/People.tsx`, `src/features/family/family.css`.

### UI-14 minor: "Showing: Name" is plain text on Health, Medicines and Food
- Evidence: `src/screens/Health.tsx:106,160`; `src/features/nutrition/NutritionScreen.tsx:58` (inline styles).
- Fix: show a small person chip (avatar initial + name) in place of "Showing:". One class `.who-chip` in app.css replaces the inline styles. It makes clear whose data this is when a carer switches person.
- Files: `src/screens/Health.tsx`, `src/features/nutrition/NutritionScreen.tsx`, `src/styles/app.css`.

### UI-15 minor: Today's "0 of 2 done" and the Medicines week line are text only
- Evidence: `meds-list.png`: "0 of 2 done", "0 of 14 doses on time this week". `src/features/health/Medicines.tsx:105` and the weekLine render.
- Fix: put a small progress ring (reuse the `.nd-ring` SVG from `NudgeCard.tsx:16-19`) next to "Today". Do not add a new component; copy the 52 px ring.
- Files: `src/features/health/Medicines.tsx`, `src/features/health/medicines.css`.

---

## C. Verbose copy: the worst 30 (safety meaning kept)

Each is file:line, then the current text, then the proposed text. Subtitles are about 8 words or fewer; helper text about 15 or fewer.

| # | file:line | Current | Proposed |
|---|---|---|---|
| C1 | src/features/medid/MedicalId.tsx:49 | "Anyone helping you can read your Medical ID without your PIN. On Android, open Settings, then Safety and emergency, then Medical information, and add the same details. Bantay cannot do this step for you. Bantay's own fingerprint screen already shows…" (317 chars) | "Helpers can read this without your PIN. Also add it in phone Settings › Safety and emergency › Medical information." Split into a numbered 3-step list. |
| C2 | src/features/privacy/PrivacyScreen.tsx:117 | "Your readings, medicines, papers, messages and alerts are removed after 7 days. Until then you can undo here. A log… Copies in the family's Google Drive folder are removed by the folder owner." | "Deleted in 7 days. You can undo until then. Drive copies: the folder owner deletes them." |
| C3 | src/features/safety/PhoneWarnings.tsx:95 | "Bantay cannot read your phone settings, so this list is what you tell us. Test messages come from the government…" (199) | "Tick what you turned on. A government test alert proves it works." |
| C4 | src/features/docs/DocsScreen.tsx:137 | "Saved to the family Drive and your records when you have signal. Only you, the admins and the people who keep your records can see it. Bantay keeps the picture only; it does not read the numbers." | "Saved to family Drive when online. Only you and your carers see it." |
| C5 | src/features/docs/DocsScreen.tsx:282 | "Photos go to the family Drive and your records when you have signal. Bantay keeps the picture only; it does not read or store the numbers." | "Photo only. Saved to family Drive when online." |
| C6 | src/features/health/LabsList.tsx:108 | "A result outside the range is a question for your doctor, not a diagnosis. Tap a test to see what it means and the last 3 results. Ranges are for information only and are not medical advice." | "Outside the range? Ask your doctor. Not a diagnosis. Tap a test for more." |
| C7 | src/features/health/bpcheck/BpWords.tsx:26 | "Home thresholds (High from 135/85: ISH 2020 and ESH), waiting for a doctor to sign them off. The same words are used everywhere…" | "High means 135/85 or more at home. Ask your doctor for your target." Move the guideline names behind a "Source" link. |
| C8 | src/features/nutrition/NutrientsToday.tsx:108 | "The strength on a medicine may be the salt, not the mineral itself (calcium carbonate 500 mg holds about 200 mg of calcium)…" | "Supplement bars may read high. Check the label." |
| C9 | src/features/nutrition/NutritionScreen.tsx:100 | "Salt can raise blood pressure in some people. These two charts share the same 7 days so you can look at them together. This is not a diagnosis; talk to your doctor." | "Salt and blood pressure, same 7 days. Not a diagnosis." |
| C10 | src/features/nutrition/NutrientsToday.tsx:115 | "Only if a doctor set one (for example for kidney problems). With a limit, potassium is shown as a limit instead of a target." | "Only if your doctor set a limit (e.g. kidneys)." |
| C11 | src/features/nutrition/NutrientsToday.tsx:129 + NutritionScreen.tsx:119 | Two source footers that say almost the same thing (USDA FoodData Central …) | One footer: "Food numbers: USDA estimates. Labels are more exact." |
| C12 | src/features/family/Messages.tsx:166 | "Texts wait on your phone until there is signal. Voice notes (up to 1 minute) and files (up to 10 MB) need signal. For video, use Messenger." | "Texts send when online. Voice and files need signal." (The Messenger button above already says video.) |
| C13 | src/features/family/People.tsx:135 | "✅ OK today ⚠️ Needs a look. Tap a picture to open the person, or Message to talk." | Icons + "OK today · Needs a look" (see UI-13) |
| C14 | src/features/family/Memories.tsx:22 / :70 / :99 | Three near-identical privacy sentences about removing location and camera data | One line, shown once: "Only family sees these. Photo location is removed." |
| C15 | src/features/sos/SosHold.tsx:19 | "Hold for 3 seconds. Your phone calls your family and opens a text. They will see it in Bantay." | "Hold 3 seconds. Calls your family and opens a text." (Keeps "opens a text": the person still taps send, per the sos.sent rule "never delivered". Only "They will see it in Bantay" is dropped.) |
| C16 | src/features/today/nextPick.ts:65 | "Taking it by 11:45 AM still counts as on time." | "On time until 11:45 AM." |
| C17 | src/features/nudge/NudgeEntry.tsx:8 | "Check-in and kudos · Your week, pillbox, year in pixels and hearts for family" | "My progress · Week, pillbox and family hearts" ("year in pixels" and "kudos" are jargon) |
| C18 | src/features/health/LabsScreen.tsx:23 | "MAMA · FROM THE LAB'S OWN PAPER" | "Mama · from lab papers" |
| C19 | src/features/health/LabsList.tsx:77 | "Take a photo of a lab paper. A person checks every number before it is saved to Mama's record." | "Snap a lab paper. A person checks it first." |
| C20 | src/features/health/nudgeLogic.ts:65 | "Take your BP now - it takes about 1 minute" | "Check your BP now (1 minute)" |
| C21 | src/features/health/LatestList.tsx:14-15 | "Showing your latest reading for each. The green band is the normal range." | "Latest readings. Green band = normal." |
| C22 | src/features/discover/learn/Meds.tsx:50 | "Cards are written by Bantay in plain words from DailyMed, openFDA and NIH Office of Dietary Supplements. Not copied from drug monographs. Always check with your doctor or pharmacist." | "Plain-words cards from DailyMed, openFDA, NIH. Check with your pharmacist." |
| C23 | src/features/discover/play/Facts.tsx:40 | "On this day: Wikipedia, CC BY-SA 4.0, credit and link on each card. Philippine fact written by us. Yesterday's cards stay on the phone." | "Facts from Wikipedia (CC BY-SA). Saved for offline." |
| C24 | src/features/health/library/Videos.tsx:30 | "Videos play inside the app (YouTube, no cookies until you tap) from a fixed, checked list. No search, no suggestions." | "Checked videos only. Play inside Bantay." |
| C25 | src/features/safety/alerts.ts:74 and src/features/safety/stormMode.ts:22 | Long source lists (USGS, GDACS, PAGASA, Open-Meteo, "checked every 10 minutes"…) on cards | "From PAGASA, USGS, GDACS. Checked every 10 min." Put the full list behind a "Sources" disclosure. |
| C26 | src/features/sensors/SensorSettings.tsx:98 | "Off until you turn a switch on. Bantay only reads. It never changes your phone's health data, and never puts these numbers in a notification." | "Off until you switch it on. Bantay only reads." |
| C27 | src/features/today/SelfCare.tsx:68 (data: breathLogic.ts:9) | "Source: Russo, Santarelli, O'Rourke. The physiology of slow breathing. Breathe 2017" on Today | A "Source" link only (the title becomes the link's aria-label). Keep the SAFETY line (breathLogic.ts:23) unchanged. |
| C28 | src/features/setup/Wizard.tsx:199 | "Everything you share with family is off until you turn it on in Me. Your admin can see which screens you use, never your health values." | "Sharing is off until you turn it on. Admins never see your health numbers." |
| C29 | src/features/update/UpdateSheet.tsx:77 | "Android asks once to let Bantay install updates. Turn it on, go Back, then tap Install update. After that, updates are one tap." | Numbered: "1 Turn on 'Allow' · 2 Go back · 3 Tap Install update" |
| C30 | src/features/weather/WeatherScreen.tsx:189-190 | "Rain this month and the November to February outlook: see the PAGASA climate outlook (link below). The app does not guess a monthly normal." + typhoon season sentence | "Monthly outlook: see PAGASA (link below)." · "Typhoon season: June to November." |

Do not shorten (they are safety-critical; checked and left as is): `assistant/gateClient.ts:16-21` (911 / NCMH 1553), `health/bpcheck/CrisisCard.tsx:28,32,48`, `safety/alerts.ts:37` (not a siren, go to high ground), `today/breathLogic.ts:23`, `phonecheck/fix.ts:31`. The step lists in `safety/PhoneWarnings.tsx:14-16` and `location/ZonePicker.tsx:22` should become numbered steps (`<ol>`) at the same length. That is a format change, not a cut.

---

## D. Accessibility for older readers

### UI-16 major: `--ok` on `--soft` is 4.40:1 in light theme, used for 12 px bold chips
- Evidence: `src/features/today/today.css:221` `.td-chip { font-size: 12px; background: var(--soft); color: var(--ok) }`. Computed: #2A7449 on #DCE5D8 = 4.40 (AA needs 4.5). `src/features/look/contrast.test.ts:52-56` tests `--ok` only on `--ground`/`--card`, not on `--soft`.
- Fix: `.td-chip { color: var(--green); font-size: 14px; }` (green on soft passes easily). Add `--soft` to the bg list for `--ok`/`--warn` in contrast.test.ts so this cannot come back.
- Files: `src/features/today/today.css`, `src/features/look/contrast.test.ts`.

### UI-17 major: 95 tap targets hard-code 44 px when the app's own token is 48 px
- Evidence: `src/styles/app.css:6` `--tap: 48px`. 95 occurrences of `min-height: 44px` / `height: 44px` across 33 phone CSS files (admin desk excluded), e.g. `family/family.css:6,56,93`, `health/medicines.css:3,10,43` (Add, pill, Undo), `docs/docs.css:10,14`, `inbox/inbox.css:1,8`, `assistant/assistant.css:6,9`, `nutrition/nutrition.css:34,83`. Worse: `discover/play/play.css:8` `.fp-chip` 32 px (status only, OK), `assistant/assistant.css:29` 36 px (static).
- Fix: mechanical sed `min-height: 44px` → `min-height: var(--tap)` and `height: 44px` → `height: var(--tap)` (also width where paired), phone CSS only. Grep check afterwards: `grep -rn "44px" src/features --include=*.css | grep -v admin` returns only non-target uses. This is a Haiku-safe mechanical lane, but it touches every CSS file, so run it **last**, after the other lanes merge (see lane plan).
- Files: 33 CSS files (list: `grep -rln "min-height: 44px\|height: 44px" src/features src/styles --include=*.css | grep -v admin`).

### UI-18 minor: small text floor
- Evidence: 80 `font-size` declarations at 10-13 px in phone CSS. Hot spots: `today.css` (8), `shell.css` (tab labels 13 px `:47`, date 13 px `:21`, `.sh-sub` 13 px `:64`), `family.css` (5). `.sub` is 15 px (good).
- Fix: raise text people must read to 14 px or more: `.sh-sub`, `.sh-top-date`, `.td-chip` (UI-16), `wx-bars li` (`weather/wxs7w.css:5,8`), `.vs-date small` (`health/m7a.css:76`). Eyebrows can stay at 13 px if uppercase and letter-spaced.
- Files: `shell.css`, `today.css`, `weather/wxs7w.css`, `health/m7a.css`.

### UI-19 minor: hold-to-open on the Jack button cannot be discovered
- Evidence: `src/features/shell/JackFab.tsx:47-53`. Press-and-hold or right-click opens Talk / Scan / Upload. Nothing on screen says so, and screen-reader users cannot reach it (`aria-haspopup="dialog"` but tap opens Jack, not the sheet).
- Fix: add the three choices as buttons inside the Jack screen header (Scan, Upload). Keep hold as a shortcut. Or change the hint text to "Tap to ask · hold for camera".
- Files: `src/features/shell/JackFab.tsx` (hint text), optionally `src/features/assistant/Assistant.tsx`.

### Passed (no action)
- Icon-only buttons: no `<button>`/`<a>` with only an `<Icon/>` child lacks `aria-label` (grep), and `Icon` is `aria-hidden` unless labelled (`shell/Icon.tsx:60`). `noGlyphIcons.test.ts` guards it.
- Reduced motion: confetti (`look/celebrate.ts:21,24`), GSAP count-up (`look/motion.ts:43`), Reveal (`look/Reveal.tsx:9`), tab spring, sheets (`shell.css:124-128`) and the Jack button (`shell.css:144`) all respect `prefers-reduced-motion`. No CSS file with `@keyframes` lacks a reduced-motion block.
- Dark theme token pairs I computed all pass AA: on-green/green 7.09, amber/card 8.81, muted/card2 6.51, red/card 5.07. Light: muted/card2 5.11, muted/soft 4.81, white/red 5.45.
- D-91: no Jack on SOS (`SimpleToday`/`NextUp`/`People` guard `!sos`), Assistant hides "thinking" Jack on emergency replies (`Assistant.tsx:350`).
- `docs/session-14/shots/J/offline.png` shows broken Jack images. That comes from the dev server having no service worker: `OfflineBar.tsx:9` uses an eager img and `vite.config.ts:30` precaches the 256 files. Check once on the APK, offline.

---

## E. Lane split (no two lanes touch the same file)

| Lane | Findings | Files owned | Model |
|---|---|---|---|
| L1 Shell + look | UI-1, UI-3, UI-4, UI-9 (Icon map), UI-10 (EmptyState prop only), UI-16 test half, UI-18 shell part, UI-19 hint | `shell/shell.css`, `shell/JackFab.tsx`, `shell/Icon.tsx`, `shell/TabBar.tsx` (verify only), `look/EmptyState.tsx`, `look/EmptyState.test.tsx`, `look/contrast.test.ts` | Sonnet |
| L2 Today | UI-6, UI-16 CSS half, UI-18 today part, C16, C27 | `today/today.css`, `today/SelfCare.tsx`, `today/SeeWeek.tsx`, `today/nextPick.ts` (+test), `today/MyWeek.tsx` (UI-10 caller) | Sonnet |
| L3 Health | UI-5, UI-7, UI-11, UI-14 (Health part), UI-15, UI-9 labs icon, C6, C7, C17-C21 | `health/LabsList.tsx`, `health/LabsScreen.tsx`, `health/Medicines.tsx`, `health/medicines.css`, `health/medDetailLogic.ts` (+test), `health/NudgeCard.tsx`, `health/nudge.css`, `health/nudgeLogic.ts`, `health/LatestList.tsx`, `health/bpcheck/BpWords.tsx`, `health/m7a.css`, `nudge/NudgeEntry.tsx`, `screens/Health.tsx` | Sonnet |
| L4 Family | UI-2, UI-10 callers (Plan, Messages), UI-13, C12-C14 | `family/plan.css`, `family/Plan.tsx`, `family/Messages.tsx`, `family/People.tsx`, `family/family.css`, `family/Memories.tsx` | Sonnet |
| L5 Copy sweep (safety, setup, misc) | C1-C5, C15, C25, C26, C28, C29, C30, UI-8, numbered steps in PhoneWarnings/ZonePicker | `medid/MedicalId.tsx`, `privacy/PrivacyScreen.tsx`, `safety/PhoneWarnings.tsx`, `safety/alerts.ts`, `safety/stormMode.ts`, `docs/DocsScreen.tsx`, `sos/SosHold.tsx`, `sensors/SensorSettings.tsx`, `setup/Wizard.tsx`, `update/UpdateSheet.tsx`, `weather/WeatherScreen.tsx`, `weather/wxs7w.css`, `inbox/Inbox.tsx`, `location/ZonePicker.tsx` | Sonnet (copy touches safety wording, so Opus reviews) |
| L6 Discover + nutrition + Ask | C8-C11, C22-C24, UI-12, UI-14 (Food part) | `nutrition/NutrientsToday.tsx`, `nutrition/NutritionScreen.tsx`, `discover/learn/Meds.tsx`, `discover/play/Facts.tsx`, `health/library/Videos.tsx`, `assistant/OfflinePanel.tsx`, `assistant/assistant.css` | Sonnet |
| L7 (after merge) | UI-17 44→48 px sed | every phone CSS with 44px | Haiku + grep check, Opus spot review |

Dependencies:
- UI-10's `jack` prop (L1) must merge before the L2, L3 and L4 callers use it. Either do L1 first, or have callers use the prop with an agreed signature `jack?: JackName`.
- UI-14 needs one shared `.who-chip` class. Put it in `src/styles/app.css`, owned by L1. Add `src/styles/app.css` to L1's files.
- Tests that assert old copy will break. Each lane updates its own tests (for example `today/s14t2*.test.tsx` for C16, `health/LabsList.test.tsx` for C6/C19, `nudge*` tests for C17/C20, `sos` tests for C15). Grep each old string in `*.test.tsx` before you edit.
- After merge: compare 390x844 light and dark against the mockup screens (D-66). Re-shoot `T2/today-late`, `F/plan-empty`, `L/*zoom200*`, `M/meds-list`.
