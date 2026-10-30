# Session 16 design and assumptions audit (read-only)

2026-10-30. Inputs: `PLAN.md` (rev 2), `mockup-v10.html` (v10 frames, measured live in a browser at 390x844, light and dark), Lloyd's notes N-1..N-23 and refs 3, 8, 10, 11, Lloyd's feedback today plus his dark Medical ID screenshot, D-98, `ANDROID-RULES.md`, and the code under `src/` (onboarding: `screens/SignIn.tsx`, `screens/Onboarding.tsx`, `features/setup/*`). No Supabase access; data claims come from code and vault docs only.

Severity: **H** = fix before Lloyd approves v10 or before lanes start; **M** = fix in v11 or the lane brief; **L** = polish.

How space was measured: every v10 frame was rendered and each card's height read from the DOM. A 390x844 phone shows about 700 px between the top bar and the tab bar.

| Frame | Page height now | Screens to scroll | Target (this audit) |
|---|---|---|---|
| today-s16 | 1961 px | 2.8 | ~1000 px |
| health-s16 | 2928 px | 4.2 | ~1000 px |
| family-s16 | 2384 px | 3.4 | ~1400 px |
| discover-s16 | 1475 px | 2.1 | ~760 px |
| settings-s16 | 976 px | 1.4 | ~800 px |

---

## 1. Space use and layout, frame by frame (390 px, 8 pt grid)

Card heights below were measured in the mockup. "Proposed" heights are estimates on the rules in section 5.

### F-1 (H) family-s16: Medical ID card (Lloyd's screenshot)
**Measured:** 497 px tall. It has a 48 px boxed-icon header with only the kicker "MAMA · MEDICAL ID", a 96x120 photo block that shows only the letter "M", six label/value pairs stacked as 12 lines (273 px), a full-width "Show to a doctor" button, then two 155 px ghost buttons. "Scan a paper" wraps to two lines and "Papers · 2 to check" wraps to two lines. The ghost buttons use `--card` on the tinted card, which puts a card inside a card.
**What wastes space:** the photo square (a placeholder for an initial), one label per line for values that are 2-12 characters long, the header row that carries only a kicker, and the wrapping 2-up buttons.
**What is wrong, not only big:** the card drops **Conditions** and the emergency **Call** numbers, which the real Medical ID shows (`medid/MedicalId.tsx:31-39`). In their place it shows **Carers** and **Last check-in**, which a doctor does not need. PLAN 1.4 acceptance says "profile card shows the same fields as Medical ID (vitest compares the two renders)", so the mockup and the plan disagree.
**Change (390 px, ~312 px tall, about -37%):**
```
┌ card (family tint; 16 px padding) ─────────────────────────┐
│ (56 avatar) Mama · 68 · A+                     [✎ 48x48]   │  row 56
│             ⚠ Penicillin    (red allergy chip)             │  chips 32
│ ─────────────────────────────────────────────────────────── │
│  Medicines   │  Conditions  │  Call                        │  3-col stat strip 56
│  4           │  2           │  Ate Joy                     │  (value 17 px, label 13 px)
│ [  ▣ Show to a doctor  ] (primary, full width, 48)         │
│ [ 📷 Scan ]  [ 📄 Papers  2 ]   (2-up, 48, ≤ 8 chars each)  │
└─────────────────────────────────────────────────────────────┘
```
- Avatar 56 px, inline with the name. A photo shows when one exists; otherwise the initial sits in a 56 px circle, not a 96x120 block.
- Name, age and blood type go on one line, and allergies become a red chip (allergy is the safety field, so it gets colour plus the ⚠ icon).
- Carers move out of this card (the faces row already shows the family). Last check-in moves to the faces row status ("Mama · OK 6:40").
- Button labels "Scan" and "Papers" with a count badge, so neither wraps at 360 px (see rule L-6).
- The header row goes. "Medical ID" becomes the accessible name of the card and the label of the doctor button.

### F-2 (H) Dark-mode section tints are muddy (Lloyd's screenshot)
The dark tints Family `#3A3016`, Learn `#3A2D16` and Watch `#3A231C` are low-chroma browns. They sit on a green-black ground (`--ground #0F1712`, `--card #18231C`) and read as olive or mud. Light mode has a second problem: several tints are hard to tell apart. Body `#E4ECE8` is identical to Calm `#E4ECE8`, Meds `#DCE5D8` is close to Live `#E2EEDD`, and Family `#F6E9C8` is close to Learn `#F3E4CC`. Colour therefore does not separate sections, which was the point of D-96.
**Change:**
1. **Dark mode:** do not fill whole cards with a tint. Cards use `--card`. The section colour appears only on the icon chip (tint-ic at about 18% alpha behind the icon in `--tint-*-ic`), on a 3 px top edge of the card, and on the kicker text. Contrast is unchanged because the ink sits on `--card`, which already passes. The brown fills go away, and so do the "full-colour cards" that D-96 rejected.
2. **Light mode:** keep the fills, but use 5 hue families instead of 11 near-duplicates: blue (vitals/weather/news), green (meds/live/play/calm/body), lilac (labs), amber (family/learn), terracotta (watch). No two cards next to each other on a screen share a hue.
3. Only hero cards and tiles carry a tint. Rows stay cream (light) or card (dark).

### F-3 (H) today-s16 (1961 px)
| Block | Now | Waste | Proposed |
|---|---|---|---|
| Header | 2-line serif "Magandang umaga, Mama" + date eyebrow (~90 px) | The greeting wraps. The code already puts the greeting in the top bar and keeps the page h1 for screen readers only (`screens/Today.tsx:28-30`). | One line, 22 px; date as 13 px meta. ~56 |
| Weather | 331 | A 56 px "31°" display, two pills stacked on separate lines, a full-width "Open weather" button | Row 1: icon, 31° (32 px), summary. Row 2: both pills inline. The whole card opens Weather and a chevron sits in the header. ~168 |
| Next up | 203 | A boxed-icon header row plus a serif title | Kicker "Next up · 9:00" inline with a 20 px icon, title 18 px, one sub line, Take / Snooze 2-up. ~152 |
| Quick log | 201 | A heading, 4 tiles, then a separate full-width "How are you?" | One row of 5 tiles (BP, Sugar, Weight, Water, Mood), 64 px wide each at 390 and 59 px at 360. ~120 |
| SOS hold | 92 | none | keep 92 |
| Take a breath hero | 203 | A hero for a non-urgent feature | A 72 px row: icon, "Take a breath", sub "in 4, out 6 · last: yesterday", trailing Start. The sheet keeps the full pick screen (N-12 is met by the sheet, not the card size). |
| Plan today | 220 | none | keep. Rows 56. |
| More | 94 + 76 | "Alerts are off on this phone" is a safety state but sits at the bottom | See F-4. |
Result: about 1000 px, roughly 1.4 screens.

### F-4 (H) today-s16: "Alerts are off on this phone" is buried under More
If phone alerts are off, medicine reminders and quake or storm warnings do not ring. That is the most important fact on Today, and the frame puts it under "More". **Change:** NoticeStack ranks this row first. When it is true, it renders as a full-width amber alert card directly under the weather card, with one action, "Turn on" (`setup/steps.turnOnReminders`, which already exists). Update and home-screen rows stay under More.

### F-5 (M) today-s16-quake
The warning card (313 px) is fine for a safety card. The family notice (231 px) has a kicker "From the family", a title, a body and a full-width "Open". **Change:** make it a 72 px row: avatar J, "Ate Joy added a visit", sub "Dr. Santos · Thu 5 Nov, 3 PM", whole row tappable, close X. Drop the warning's in-card line "Hide on Today. Still listed under Safety." and show it once as a toast after close ("Hidden here. Still in Safety"), so the context remains where the mistake could happen.

### F-6 (M) today-s16-storm (warning card 573 px)
There are two questions in one card: "How are you? Good / So-so / Not well" (76 px faces) **and** "I'm safe / I need help". The faces wrap to two lines at 100 px wide. **Change:** keep the roll-call pair only. The labels should be "I'm OK" and "I need help": D-43 says "I'm OK" is the only word, but the code says "I'm safe" (`safety/StormCard.tsx:72`). Mood logging stays in Quick log. The "Do now" list becomes 4 single-line rows with icons. Result: ~400 px.

### F-7 (L) breathe-pick / run / mood
The 2-column pattern grid is the right use of space and should stay. On the mood screen, the three face buttons are 113 px wide and wrap ("A bit better" goes to 2 lines). **Change:** use 3 faces with one word each: "Worse", "Same", "Better".

### F-8 (H) health-s16 (2928 px, the longest page)
| Block | Now | Waste | Proposed |
|---|---|---|---|
| Header | eyebrow "Health" + h1 "Mama's health" | The eyebrow repeats the tab label | h1 only |
| Body hero | 381 | Kicker "Mama · 7-day averages", title "Her body this week" (says nothing), 4 stat rows stacked as sub-cards (card in card), full-width Add + a Scan link | Body figure 88x140 on the left. On the right a 2x2 stat grid (BP 132/84, Sugar 118, Weight 61, Pulse 74): value 20 px, label 13 px. Below it, 2-up "+ Reading" / "Scan". Title "7-day averages". ~232 |
| Progress / Medicines / Labs heroes | 278 + 210 + 182 | Each has a 48 px icon box, a kicker, a serif title, a body sentence and a full-width button whose label repeats the kicker ("Medicines" → button "Medicines", "Lab results" → button "Lab results") | One **"At a glance" 2x2 tile grid**, each tile 171x104, whole tile tappable: **Progress** "BP near guide 5/7 days" + sparkline, **Medicines** "2 of 4 left today", **Labs** "4 to ask · 2 Oct", **Video** (see next row). Order kept: progress, medicines, labs (N-14). ~216 for all three plus video |
| Nudge | 138 | A full-width "Log it" for one reading | A 64 px row: "Morning BP not logged" plus trailing "Log" |
| Video hero | 433 (largest card) | A poster with a play glyph **and** a separate Play button **and** a "More videos" link | Default: the 4th tile of the glance grid, opening the inline player sheet. If Lloyd holds N-18 as a hero: a 16:9 poster 358x200 with the play overlay and title on it, no Play button, no link (~260). |
| Browse (4 cards) | 203 + 203 + 203 + 142 | Each card shows a status that lists its own links ("Readings, labs, papers, visits"), then a full-width button, then the same links again. Medicines and Labs repeat the heroes above. | "More in Health": a 2-column tile grid, 3 rows of 80 px: Readings, Medicines & refills, Labs & papers, Visits, Move & food, Body wiki. ~256 |
Result: ~1000 px. **This changes N-14/N-18 from stacked heroes to a grid. Show Lloyd both versions in v11** (his new instruction is to maximise space; his older note asked for hero cards).

### F-9 (M) health-s16-empty and health-s16-viewas
Empty: the body hero, 2 empty heroes, the nudge and the video all draw for a person with no data (2628 px). **Change:** one empty-state hero ("No readings yet" + Reading / Scan / Add a medicine) and the More grid; nothing else.
View as: "Viewing only. Exit to act as yourself." repeats under each disabled control (3 times on Today, 2 times on Family). **Change:** the banner says it once. Disabled controls show a lock icon and the two-word label "View only" (this keeps the reason and stops the repetition).

### F-10 (M) discover-s16 (1475 px)
The pick hero is 231 px. The 5 feature cards are 142-159 px each, and each has a full-width "Open Learn" / "Open Watch" / … button that repeats the card title. **Change:** pick hero ~160 (title + one line + chevron, whole card tappable). Season becomes a 72 px row. Learn / Watch / Listen / Play / News become a **2-column tile grid** (171x96: icon, label, one status line). With 5 tiles, News spans both columns in row 3. Result: ~760 px.

### F-11 (M) discover-learn-s16 / discover-watch-s16
Learn: 4 cards x 142 px with "Open the wiki", "See recipes", "Open the Library" and "Open Learn together" buttons. **Change:** a 2x2 tile grid (~200 px). Watch: video posters 275-296 px each. **Change:** a horizontal row of 160x90 posters ("Checked videos · 18", scrolls inside itself), then playlist rows of 64 px.

### F-12 (H) family-s16 (2384 px): order and calendar
- Eyebrow "Family" plus h1 "Family" is a literal duplicate. Drop the eyebrow.
- The faces row is 253 px, including the hint line "Swipe sideways inside this card. Tap a face to see more.". Drop the hint (a half-visible 5th face already shows that the row scrolls) and put the status word under each face. ~136.
- **The calendar is 862 px** (a month grid **and** a week strip **and** 5 day rows). **Change:** the week strip is the default at every width. The month grid opens behind a "Month" toggle (the plan already does this, but only for 195 px). ~460.
- **"Needs you now" (a missed medicine with Call Papa / He took it) sits below the 862 px calendar**, about 2.5 screens down. **Change:** when it has items, it renders directly under the ID card. When it is empty it goes away entirely ("Nothing needs you right now" costs a card for no action).
- Memories becomes a 64 px row.
Result: ~1400 px.

### F-13 (L) family-faces-sheet, family-papers
The sheet is fine (3 full-width actions). In the papers frame, "Confirm 2 clear values" wraps in a 157 px button. **Change:** stack Confirm / Fix as 1-up, or shorten to "Confirm 2".

### F-14 (M) settings-s16 (976 px)
The account card is 211 px, with "Admin · looks after the family" and a full-width "Edit name and photo" button. **Change:** a 72 px row (avatar 48, name, "Admin", trailing ✎ icon button) and a 56 px Simple mode switch row. Group rows go from ~75 to 64 px (icon 24, label, one-line value, chevron). Result: ~800 px.

### F-15 (L) viewas-pick
"Needs internet to switch" repeats on all 6 rows. **Change:** one line at the top ("Needs internet to switch") and rows dimmed but still readable.

### F-16 (M) Repeated patterns across all frames
1. **Boxed 48 px icon + uppercase kicker + serif title** on every card costs ~80 px of header per card. **Change:** a 24 px icon inline with an 18 px sans title. The boxed icon is used only on tiles, and serif only on the page h1 and the single hero number (weather °).
2. **"Open X" full-width buttons on navigation cards** (13 instances counted in v10). **Change:** the card is the link, with a chevron. Buttons are kept for actions (Take, Log, Scan, Start).
3. **Eyebrow repeats the page or tab** (Health/Health, Family/Family, "Something good for today"/Discover). **Change:** drop it.
4. **Cards inside cards** (body stats, ID ghost buttons, faces in a card). **Change:** use dividers or plain tiles inside, and no second surface colour.

---

## 2. Wording

Context is kept only where it prevents a mistake (safety, medicine, privacy). Those lines are marked **keep**.

| # | Where | Now | Replace with |
|---|---|---|---|
| W-1 | today weather | "General Santos · now" | "General Santos" |
| W-2 | today weather | "Mostly sunny until 2 PM. Light rain after 3 PM. Bring an umbrella." | "Sunny till 2 PM, rain after 3. Bring an umbrella." |
| W-3 | today weather | button "Open weather" | (card tappable, chevron) |
| W-4 | Next up | "1 tablet after breakfast. Taking it by 9:30 AM still counts as on time." | "1 tablet after breakfast · on time until 9:30" (**keep the window**, medicine) |
| W-5 | Self-care | kicker "Self-care" + "Slow breathing: in 4, out 6. It can settle a racing heart. Last time: yesterday, 3 minutes." | "Take a breath" / "In 4, out 6 · last: yesterday" |
| W-6 | More | "Alerts are off on this phone + 2 more: update ready, add to home screen" | Alert card "Phone alerts are off. Reminders will not ring." + "Turn on" (**keep the consequence**, F-4) |
| W-7 | quake | "Checked 2 min ago · Hide on Today. Still listed under Safety." | "Checked 2 min ago"; toast after close: "Hidden here. Still in Safety." |
| W-8 | quake | "Felt Intensity IV … Check for cracks. Stay away from tall shelves." | **keep** (safety) |
| W-9 | family notice | kicker "From the family" + "Dr. Santos, Thu 5 Nov, 3:00 PM. Kuya Ben will drive." + "Open" | "Ate Joy added a visit" / "Dr. Santos · Thu 5 Nov, 3 PM · Kuya Ben drives" |
| W-10 | storm | "Answered so far: Lloyd, Papa. Still waiting: Mama, Lola. Hiding the warning keeps this answer row." | "OK: Lloyd, Papa · Waiting: Mama, Lola" (the last sentence is a designer note, not app copy) |
| W-11 | storm | "I'm safe" | "I'm OK" (D-43) |
| W-12 | storm Do now | "Charge your phone and a power bank" / "Keep your medicines and papers in one bag" / "Stay indoors until the signal is lifted" | "Charge phone and power bank" / "Medicines and papers in one bag" / "Stay indoors until the signal is lifted" (**keep**) |
| W-13 | breathe-pick | "Pick a pattern. Breathe in through your nose, out slowly. Go gently." | "Pick a pattern." |
| W-14 | breathe-pick | "Buzz softly with each breath" | "Buzz with each breath" |
| W-15 | breathe-pick | "Safety: stop if you feel dizzy and breathe normally. This is not a treatment." | "Stop if you feel dizzy. Not a treatment." (**keep**, shortened) |
| W-16 | breathe-mood | "Not better / A bit better / Much better" | "Worse / Same / Better" |
| W-17 | health | eyebrow "Health" | (drop) |
| W-18 | body hero | "Mama · 7-day averages" + "Her body this week" | "7-day averages" |
| W-19 | progress | "My progress · this week" / "Close to the guide on 5 of 7 days" / "Blood pressure, morning readings." / "See numbers" | "Progress" / "Morning BP near guide: 5 of 7 days" |
| W-20 | medicines hero | "4 medicines, 2 left today" / "Next: Losartan 50 mg at 9:00 AM." / button "Medicines" | "2 of 4 left today" / "Next 9:00 · Losartan" |
| W-21 | labs hero | "6 tests, 4 to ask about" / "Ranges are the lab's own printed ranges." / button "Lab results" | "4 to ask about · 2 Oct" (the ranges line stays on the Labs screen, where it is needed) |
| W-22 | nudge | "Today's check: morning pressure / One reading, about a minute. / Log it" | "Morning BP not logged" + "Log" |
| W-23 | video | "A gentle 6-minute guide for a steadier sugar." + "Play" + "More videos" | "Walking after meals · 6 min" |
| W-24 | browse | "Browse" + "everything in Health" | "More in Health" |
| W-25 | browse Track | status "Readings, labs, papers, visits" then links Labs, Papers, Visits | tiles named once each |
| W-26 | health empty | "Start with one number" / "Record your latest vitals or scan a lab paper. Tap the body to read how each part works." | "No readings yet" / "Add one or scan a lab paper." |
| W-27 | health empty labs | "Take a photo of a lab paper and a person checks it." | "A person checks every number." (**keep**, trust) |
| W-28 | view as (every disabled control) | "Viewing only. Exit to act as yourself." | lock icon + "View only" (the banner carries the rest once) |
| W-29 | labs footer | "A result outside the range is a question for your doctor, not a diagnosis. Tap a test to see what it means and the last 3 results." | "Outside the range? Ask your doctor. Not a diagnosis." (**keep the safety half**. This conflicts with N-19 "restore v9 copy", so Lloyd should pick.) |
| W-30 | labs source | "Ranges are the lab's own printed ranges, not Bantay's." | **keep** (prevents misreading, B-6) |
| W-31 | discover | eyebrow "Something good for today" | (drop) |
| W-32 | discover pick | "A tasty soup with a third less salt. 25 minutes. Good for pressure." + "Open the pick" | "⅓ less salt · 25 min" |
| W-33 | discover cards | "Open Learn", "Open Watch", "Open Listen", "Open Play", "Open News" | (tiles tappable) |
| W-34 | discover Learn status | "Medicine wiki, recipes, health library, learn together" | "Medicines, recipes, topics" |
| W-35 | discover Watch status | "18 checked videos, playlists, live TV" | "18 videos · live TV" |
| W-36 | learn sub | "What each medicine is for, in plain words" / "Plain health summaries, 40 topics" | "What each medicine is for" / "40 health topics" |
| W-37 | family | eyebrow "Family" | (drop) |
| W-38 | ID card | "Scan a paper" / "Papers · 2 to check" | "Scan" / "Papers" + badge 2 |
| W-39 | faces | "Swipe sideways inside this card. Tap a face to see more." | (drop) |
| W-40 | calendar | "October 2026" + "Family calendar" | "Calendar · October" |
| W-41 | view-as faces | "A chart tag means Mama can read their records. Papa, Kuya Ben and Joshua Zian are not listed: she cannot see them." | "Showing only who Mama can see." (**keep**, privacy, one line) |
| W-42 | papers | "Photos and PDFs, read by Bantay, checked by a person" | "Read by Bantay, checked by a person" (**keep**) |
| W-43 | settings | "Admin · looks after the family" / "Edit name and photo" | "Admin" / ✎ icon (aria "Edit name and photo") |
| W-44 | settings | "View as · Admin only · off" | "View as · See the app as a family member" |
| W-45 | view-as pick | "Needs internet to switch" x6 | once, at the top |
| W-46 | view-as pick | "Every view is recorded in the family history." | **keep** (privacy) |
| W-47 | view-as SOS | "This SOS is from Lloyd, not Mama." | **keep** (safety) |
| W-48 | JoinFlow step 1 | "I am Jack Jack. You are invited to Family Bantay. Tap your name to choose a PIN." | "Tap your name." (Jack already introduced himself on the welcome screen) |
| W-49 | onboarding eyebrow | "Step 1 of 3 · then Today" + dots | "1 of 4" + dots |
| W-50 | StartDone | "Jack will remind you about your medicines and help you call your family if you need help." | Remove. At this point no reminder can ring (no medicines entered and the notification permission is not asked, see O-2). |
| W-51 | StartDone consent | "By using Bantay you agree to share your health records with your family. AI features and privacy are in Me, then Privacy." | Must match the real default (see A-17), and "Me" becomes "Settings" (plan 1.5). |
| W-52 | Wizard location | fields "Barangay / Latitude / Longitude" | Chips for the saved zones (Dampas, Conel) + "Use my location"; no lat/long typing |

---

## 3. Assumptions in the plan and mockup

Legend: **V** verified (source cited), **U** unverified, **X** wrong or contradicted.

| # | Assumption | Status | Evidence / consequence |
|---|---|---|---|
| A-1 | The person on Today and Family is an elder ("Magandang umaga, Mama") using her own phone | **U, leans X** | D-94: Lloyd is the can_write carer of **5 no-login members**, and "only Lloyd is a write-carer live". FACTS: 6-8 users. The heaviest real user is the admin or carer, so the layouts must work for "me + people I care for", not only for the elder. Confirm with Lloyd who has a login today. |
| A-2 | Elders understand serif hero cards, 11 tints and kicker labels | **U** | No user test recorded in the vault. Ref 8's own advice is "Use simple visuals and clear copy". |
| A-3 | Users read English | **U** | `lib/i18n.ts:4-8`: `'en'` and `'fil'` exist, but only the medicine reminder is wired. The greeting is Filipino and the rest is English. The Settings "Language" row implies a full translation that does not exist. |
| A-4 | All phones are Android | **V** | 01-FACTS: "all Android today (2026-10-17)". |
| A-5 | 195 px (200% text) is a design target | **X** | D-98 (Lloyd today). The plan still has it in shared rules (sec 1), C-1, C-4, every acceptance list, the per-lane shots ("195×844"), and 7 mockup frames. See P-1. |
| A-6 | View as should be read-only | **U** | This is a plan decision ("Decided, not asked", sec 6). Lloyd's N-7 wording: "switches the whole app to exactly that member's profile and content". As the write carer of 5 dependants, he may expect to log for them from that view. Ask once. |
| A-7 | The profile card shows the same fields as Medical ID | **X** | The mockup drops Conditions and Call and adds Carers and Last check-in (F-1). Code: `medid/MedicalId.tsx:31-39`. |
| A-8 | Members have blood type, allergies, birthdate and photos filled in | **U** | Code has "Not added" / "Birthday not added" paths (`MedicalId.tsx:8,27`). Without the DB this cannot be checked. The mockup shows full data, so the layout must also be checked half-empty (design the "Not added" state as a chip "Add blood type"). |
| A-9 | The body hero has 7-day averages | **U** | It depends on readings. Health Connect only just got its N-1 fix and has not been live-checked (G-2). For dependants, readings exist only if Lloyd logs them. |
| A-10 | Push / closed-app alerts reach people (family notices, roll-call ask "lands on a Today", Needs you now) | **X today** | `push_tokens = 0` (G-3, HANDOFF S16). Until Firebase is set up these work only when the app is open. The plan should not lean on push for roll call. |
| A-11 | Location comes from GPS | **U** | The N-2 fix adds a GPS-first plugin call, but onboarding never asks for location, so a new user lands on Dampas until they open Weather or Settings (O-3). |
| A-12 | Lloyd wants a colour per section | **V** | D-96, N-17. But "full-colour cards rejected", and the dark fills read as full-colour mud (F-2). |
| A-13 | Lloyd wants stacked hero cards on Health | **V then superseded in part** | N-13/N-14 ask for heroes in order. Today's feedback ("maximise use of space") favours a grid. Offer both (F-8). |
| A-14 | Skipped setup steps stay "on the Today checklist" | **X** | `screens/Onboarding.tsx:8-9` says so, but `SetupCard` is mounted only in `screens/Me.tsx:198` and `ChecklistCard` is mounted nowhere (grep). SetupCard also hides itself once half the steps are done (`today/SetupCard.tsx:40`), so the rest become invisible. |
| A-15 | The sharing default is clear | **X (contradiction)** | StartDone: "By using Bantay you agree to share your health records with your family." Wizard Sharing step: "Sharing is off until you turn it on in Me." Both are shipped copy. One is wrong. Decide which, then fix both (privacy). |
| A-16 | The onboarding promise "Jack will remind you about your medicines" holds at the end of onboarding | **X** | No medicines step and no notification permission ask in the 3-step flow. `turnOnReminders` only runs from the wizard in Me. The PhoneCheckCard shows only when the probe returns a known failure. |
| A-17 | Elders can type latitude and longitude | **X** | `features/setup/Wizard.tsx` Location "home" state asks for Barangay / Latitude / Longitude. Replace with zone chips (HOME_ZONES in `location/geo.ts`). |
| A-18 | The Me screen has 22 rows | **U** | The mockup note says "All 22 old rows". The plan says count on the base sha. Keep the plan's wording and drop the number from the mockup. |
| A-19 | The Discover feature cards will spark curiosity (N-20) | **U** | `usage_events` exists and could show what is opened, but it needs a read-only query with Lloyd's OK (not done here). |
| A-20 | "Calls Ate Joy" on the SOS hold | **U** | It depends on SOS contacts, which are set only in the Me wizard. Show the empty state ("No one set · Add") in the mockup. |
| A-21 | The "Bigger text" switch in onboarding is helpful | **U / conflicts** | ANDROID-RULES: "Respect system settings (text size …) instead of overriding them." D-98: the system magnifier covers this. Move it to Settings > Display only. |
| A-22 | "I'm safe" wording in the storm card | **X** | D-43: "I'm OK" is the only word. Code `StormCard.tsx:72` and mockup v10 use "I'm safe". |

---

## 4. Onboarding

### Current flow (from code)
| # | Screen | File | What it asks | Ref 8 stage |
|---|---|---|---|---|
| 0 | Welcome: Jack, "Hi! I'm Jack Jack … Who are you?", name list | `screens/SignIn.tsx:237-270` | pick name | Welcome |
| 1 | (invite) "Step 1 of 3 · then Today", "Is this you?", the Jack intro **again** | `setup/JoinFlow.tsx:73-104` | pick name | Welcome (repeat) |
| 2 | "Hi X, choose a 6-digit PIN", type it twice, fingerprint switch | `setup/SetPin.tsx` | PIN | Guide |
| 3 | "You're in", background phone check, ticks, **Bigger text** and **Simple mode** switches, consent line, "Open Today" | `setup/StartDone.tsx` | 2 switches; implicit consent | Value? (no) |
| — | Then Today. Photo, About, Medicines, Notifications, Location, Health Connect, Phone warnings, SOS contacts and Sharing are **only** reachable from Settings > SetupCard (and only while under half are done) | `today/SetupCard.tsx`, `screens/Me.tsx:198` | — | Retain (missing) |

### Findings
- **O-1 (H) No first success moment.** Onboarding ends on a promise (W-50), not a result. Ref 8 step 4, "Value: help users achieve their first success", is absent.
- **O-2 (H) The notification / exact-alarm / battery permission is never asked in context.** For a medicine-reminder app this is the core value. It sits in the Me wizard (`Wizard.tsx` Notifications, `steps.turnOnReminders`).
- **O-3 (H) Location is never asked**, so a new user's weather and quake zone defaults to Dampas. This is one cause behind N-2.
- **O-4 (M) The welcome is shown twice on the invite path** (SignIn welcome, then JoinFlow repeats the Jack intro).
- **O-5 (M) "Step 3 of 3 · then Today" plus dots plus a progress eyebrow** is three progress cues for 3 steps.
- **O-6 (M) Bigger text overrides the system setting** (A-21), and Simple mode is a big choice to make before the user has seen the normal app.
- **O-7 (H) The consent copy contradicts the Sharing step** (A-15).
- **O-8 (M) No retain loop on Today** (A-14).

### Proposed flow (5 screens max, Skip on 3-5, every permission asked next to the reason)
| # | Screen | Exact copy | Action(s) | Code to reuse |
|---|---|---|---|---|
| 1 | **Welcome + who** (one screen, both paths) | Jack art 112 px. h1 "Hi! I'm Jack Jack." Sub "Tap your name." Name list. Footer "Not on the list? Ask whoever sent the link." | tap a name | `SignIn` welcome + `JoinFlow` list (drop the JoinFlow intro) |
| 2 | **PIN** | h1 "Choose a 6-digit PIN" → "Type it again". Sub "Numbers you will remember." Switch "Open with fingerprint" (on). | PIN x2 | `SetPin` |
| 3 | **Reminders** (permission in context) | h1 "Medicine reminders". Body "Bantay rings at each dose, even with the screen off." If medicines are on file: list them ("Losartan 50 mg · 9:00 AM") with "Not right? Fix later in Health." If none: "No medicines yet. Your carer can add them." | primary "Turn on reminders" (runs `turnOnReminders`: notifications → exact alarms → battery). Secondary "Not now". | `steps.turnOnReminders`, `notifyState`, `ldb.medications` |
| 4 | **Where you are** (permission in context) | h1 "Where are you most days?" Body "For weather and quake warnings near you. Stays on this phone." Chips: "Use my location", "Dampas, Tagbilaran", "Conel, GenSan". | one tap | `resolveLocation(true)`, `saveHome`, `HOME_ZONES` |
| 5 | **First success** | h1 "Let's test it." Body "Tap below. Your phone rings in 5 seconds." Button "Send a test reminder". After it fires: tick + "It works. You're set, {name}." Consent line (wording from the A-15 decision): "Your family sees what you share. Change it in Settings > Privacy." | "Send a test reminder", then "Open Today" | `steps.scheduleTest` (5 s), `recordConsent` |
Skip on 3-5 records nothing and keeps the step on the Today setup row. Progress cue: dots only, with aria "Step n of 5". System back steps back (Android predictive back), and on screen 1 it exits.

**Asked later, in context (not in onboarding):**
- SOS contacts: the first time "Hold for help" has no one to call, show "Who should get your SOS text?".
- Photo / blood type / allergies: as "Add" chips on the Family ID card (F-1).
- Health Connect: on first Health visit, "Read steps and sleep from your phone?".
- Phone warnings: on the Safety tab card.
- Bigger text and Simple mode: Settings > Display.

**Retain:** Today shows **one** row under the weather card until setup is done: "2 left: SOS contacts, Photo · Set up". It never hides at half done. This fixes the stale comment in `Onboarding.tsx` and mounts `SetupCard` on Today, or reuses its logic in NoticeStack.

**Time to first value:** now, 3 screens and then a Today that may never ring. Proposed: 5 screens, and a reminder that is shown to ring within about 90 s of opening the link.

---

## 5. Layout system rules for the redesign

- **L-1 Grid.** Single column, 16 px side gutters. Content width is 358 px at 390 and 328 px at 360. Two-column grids use an 8 px gap: tiles are 175 px at 390 and 160 px at 360.
- **L-2 Spacing scale.** 4 / 8 / 12 / 16 / 24 / 32 only. Card padding 16 (not 18). Gap between cards 12. Gap before a section heading 24. Row height 56 (one line of sub) or 72 (two lines).
- **L-3 Four card types, nothing else.**
  1. **Hero**: at most **1 per tab** (Today: weather or the active warning; Health: body; Family: ID card; Discover: pick). At most 280 px tall at 390, and one primary action.
  2. **Tile**: in a 2-column grid. Icon 24, label, one value line, optional sparkline. The whole tile is the tap target (min 96 px tall). No buttons inside.
  3. **Row**: list item, 40 px leading icon or avatar, title, one sub line, a trailing chevron **or** one control (switch, small button).
  4. **Alert**: warning, missed dose or phone-alerts-off. Full width, red or amber, icon + title + up to 3 lines + one action + close (where N-10 applies).
  No card inside a card. Inside a card, separate with dividers.
- **L-4 Type.** Serif only for the page h1 (22-24 px, one line) and the single hero number. Card titles are 17-18 px sans semibold, body 15, meta 13 (never below 12 sp, ANDROID-RULES). At most one uppercase kicker per card, and none when the title says the same thing.
- **L-5 Lines.** Title 1 line (ellipsis only for names). Sub ≤ 2 lines. Body ≤ 3 lines. Safety, medicine and privacy text are exempt and wrap fully.
- **L-6 Buttons never wrap at 360 px.** Height 48. Width budget: 1-up = 328 px (any label ≤ 28 characters). 2-up = 160 px: 16+16 padding, 20 icon, 8 gap leaves 100 px, so **≤ 10 characters at 15 px semibold** ("Scan", "Papers 2", "Take", "Snooze", "I'm OK", "Need help"). 3-up = 104 px, so **≤ 6 characters, no icon** ("Worse", "Same", "Better"). If a label does not fit, stack the buttons 1-up; do not shrink the text. A vitest or Playwright check asserts each `.btn` has one line box at 360 px.
- **L-7 One primary action per card.** A navigation card has no button: the card is the link and shows a chevron. "Open X" labels are banned.
- **L-8 When to use 2 columns.** Short label/value pairs (values ≤ 12 characters: vitals, ID stats), feature doors (Health More, Discover subs, Learn subs), choice sets of 2. Never for sentences, safety instructions, lists of names, or anything the user must read in order.
- **L-9 Colour.** Light mode: tint fill on heroes and tiles only, 5 hue families. Dark mode: no fills, tint on the icon chip + 3 px top edge + kicker. Always icon + label (D-96).
- **L-10 Page budget at 390x844.** Today ≤ 1.5 screens when calm, Health ≤ 1.5, Family ≤ 2, Discover ≤ 1.2, a Settings group ≤ 1. The mockup frame notes state each frame's measured height.
- **L-11 Empty states.** One empty hero with one action replaces a stack of empty cards. "Not added" fields render as an "Add …" chip, not as a hidden field.

---

## 6. Plan edits this audit requires

- **P-1 (H)** Remove the 195 px gates from PLAN.md (D-98): shared rules sec 1 ("at 195 px every card stacks…"), 1.1 states and acceptance (e), 1.2 acceptance "195 px sweep", 1.3, 1.4, 1.5 acceptance, C-1 rule, C-4 "195 px one column", C-7 "at 390 and 195 px", the per-lane test plan "195×844", L7 `s16-narrow-text` as a gate, and the 7 `-w195` mockup frames. Replace them with L-6 (no wrapped buttons at 360 px) and L-10 (page budgets). Keep `narrowMode.ts` and the N-4 fix, as D-98 says.
- **P-2 (H)** PLAN 1.4 ProfileCard: fields = Medical ID fields (name, age, blood type, allergies, conditions, medicines, call), as in F-1; drop Carers and Last check-in from the card.
- **P-3 (H)** PLAN 1.1: NoticeStack ranks "phone alerts off" first and lifts it under the weather card (F-4).
- **P-4 (H)** PLAN 1.4: Needs you now goes above the calendar when it has items; the week strip is the default and the month grid opens on a toggle at all widths (F-12).
- **P-5 (M)** PLAN 1.2: add the grid variant (F-8) for Lloyd to pick against the stacked heroes.
- **P-6 (M)** PLAN section 3: dark-mode tint rule (F-2 / L-9) and 5 hue families.
- **P-7 (H)** New lane or L7 scope: the onboarding flow in section 4 (`JoinFlow`, `SetPin`, `StartDone`, `Onboarding.tsx`, a Today setup row, Wizard location chips). Fix the A-15 consent and sharing contradiction first; this needs Lloyd's decision.
- **P-8 (L)** Change "I'm safe" to "I'm OK" in StormCard and WarningCard (D-43).
