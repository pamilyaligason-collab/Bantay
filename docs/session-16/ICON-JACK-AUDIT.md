# Icon and Jack art audit (D-103)

Scope: mockup `mockup-v11.html` v12 group (56 frames, each rendered at 390 px, light and dark, headless Playwright, one `section.screen` unhidden at a time) and the app (`src/assets/jack/*`, `src/assets/mascot.svg`, `src/features/look/JackArt.tsx`, `src/features/shell/Icon.tsx`, `icons/custom.tsx`). Date 2026-10-30. Nothing under `src/` was edited and nothing is committed.

Trigger: dark frame with Jack "well-done": the **orange rounded-square with a check is baked into the art** (the generator drew a backing panel and a badge), and the mockup then drew a **second green check circle** over his paw. Both are fixed in the mockup (F1, F2). The art itself needs a re-cut (A1).

## Rules for the build lanes (6 to 10 bullets)

1. **One icon set:** Tabler line icons through `<Icon name>` only; never `@tabler/icons-react` directly, never a text glyph (`✓ × – ○`) or an emoji as an icon.
2. **Four sizes only: 16 (inline meta, ticks), 20 (row leading, chips, buttons), 24 (tiles, card titles, icon buttons, tab bar), 32 (alerts, SOS).** No 14, 18, 22, 26, 28, 34. `Icon`'s default `size` becomes 24.
3. **Stroke by size, rounded caps and joins:** 16 → 2.1, 20 → 1.9, 24 → 1.75, 32 → 1.5 (this is `strokeFor` today, minus its 22 and 26 steps). Never a per-screen stroke override.
4. **Line everywhere; the filled twin only for the active tab.** Not for a mic while listening, not for a video play button.
5. **A leading icon in a list row sits in a 40 px chip with a 20 px icon (radius 12 to 14); a tile icon is bare at 24.** One meaning per glyph: Sugar = drop, Water = glass, Food/Recipes = meal, Walk = walk, Move = stretching, Temperature = thermometer, BP = gauge. Never reuse a glyph for two different tiles on one screen.
6. **Jack art sizes: 56 (action box, row), 96 (hero, success), 112 (onboarding). Nothing else (no 40, 48, 64, 72, 150).** `JackArt` clamps `size` to those three.
7. **Jack sits in its own grid cell, `overflow: visible`, `object-fit: contain`, never under or over a button, badge, tick, chevron or text.** The cell is as wide as the art; text goes beside it, never across it.
8. **Success = Jack OR a check-draw, never both.** If Jack is shown, no tick circle on him. If a tick is shown (onboarding done, sheet done), no Jack. A count or check badge is drawn by the app beside the art, never baked in.
9. **No Jack art or Jack button on a warning, storm, quake, SOS, IncomingSos, FamilyNotice or Danger-heat frame (D-91).** All v12 frames comply today (checked); `JackArt` call sites already guard with `!sos` / `!emergency`.
10. **Art files are clean cut-outs on one canvas:** transparent background, no backing shape, no props that are really badges, subject fitted to a common box (see A2). The 256 px file is not enough above 85 CSS px on a 3x phone; ship 384 for 96 and 112 slots.

## Findings: mockup (v12 group)

| # | Where | Problem | Fix | Done in mockup | App owner |
|---|---|---|---|---|---|
| F1 | `breathe-mood` | Green check circle (32 px) stacked on Jack well-done's paw, on top of the baked orange badge | Jack only (clean cut); the check is gone; frame note updated | yes | L1 (BreathSheet) |
| F2 | `onboard-5-done` | Jack celebrate (112) with a 40 px check circle overlapping his paw; art also carries a baked sparkle panel | Success is the 96 px check-draw alone, no Jack | yes | L8 (StartDone / onboarding) |
| F3 | `breathe-mood`, `today-dose-done` | Baked orange backing panel and badge behind well-done (stray orange shape in dark) | Mockup uses a re-cut well-done (`docs/session-16/shots/jack-clean/jack-well-done-1024.webp` and `-256.webp`, GrabCut + a manual halo cut, thin tan slivers remain at the chest and ear underside, acceptable at 56 to 96 px) | yes (this one art) | L9 (asset), see A1 |
| F4 | `today-dose-done` Jack 72, `discover-learn-s16` Jack 72, `nudge-hub` Jack 64, `today-offline` Jack 48 | Off the 56 / 96 / 112 scale | Snapped to 56 | yes (4 frames) | L1 (NextUp, OfflineBar), L3 (Learn), nudge (L1) |
| F5 | 204 of 483 icons across the group | Sizes 22 (the `.ic` default, 158 icons), 14 (35), 18 (3), 34 (8) | Snapped to 16 / 20 / 24 / 32 by role (tiles, icon buttons, play, hours = 24; rows, buttons, links = 20; ticks, tags, levels = 16; SOS shield = 32). Result: 0 off-scale | yes | all lanes (their rows and tiles) |
| F6 | all icons | One flat 1.8 stroke at every size (rendered 1.35 px at 18, 2.4 px at 32) and ticks at 2.6 to 3 | Stroke by size (rule 3): 142 at 1.75, 262 at 1.9, 41 at 2.1, 8 at 1.5 | yes | L9 (`Icon.tsx`) |
| F7 | `today-log` tiles | Food = calendar, Walk = lightning bolt, Move = heart, Temperature = gauge (same as BP), Water = droplet (same as Sugar) | meal / walk / stretching / thermometer / glass (the app's own `meal`, `walk`, `move`, `therm`, `glass`); Water tile is a glass in all 11 tiles | yes (18 swaps) | L1 (QuickLog already uses `glass`; log sheet to match) |
| F8 | `discover-learn-s16` Recipes | Calendar icon | meal icon | yes | L3 |
| F9 | `settings-display` Language | Chat-bubble icon | Language (A/文) glyph; the app set has none, add `IconLanguage` | yes | L5 (+ L9 adds the name) |
| F10 | `settings-alerts` 8 PM summary | Paper-plane (send) icon for a summary | message icon | yes | L5 |
| F11 | `family-s16`, `-empty-needs`, `-faces-sheet`, `-acting` | Status corner marks and the legend are text glyphs `✓ ! –` (a second icon system) | Drawn 12 px line glyphs in the 20 px corner dot (18 corners) and in the legend (12 items) | yes | L4 (`People.tsx`, `Sharing.tsx`) |
| F12 | `.y-chk.f` selected tick, dark | White tick on light green 2.2:1 | Dark ink tick 8:1 (4 icons) | yes | L1 / L3 (Breathe pick, Plan) |
| F13 | list-row chips | 40 px chip with a 24 px icon (D-103 says 20) | 20 px icon in the same 40 px chip | yes (about 70 chips) | all lanes |
| F14 | 20+ frames with the Jack button (12 still covered at the end of the scroll) | The Jack button (56 px, right 14, bottom 96) covers a control at rest: Start (breathe row), More tile, Set up / Se... (Finish setup), Hold for help, Papa avatar (Family), the High pill, the UV tile text, the send row (Messages), dose cells (Papers). At the end of the scroll the last row still sits under it by 8 to 72 px (mockup `padding-bottom` is 88 px, the button top is 152 px from the bottom) | **Not changed in the mockup:** a padding fix is +76 px on every scroll frame and breaks the approved height budgets. Decision for the orchestrator: either budgets +76 px, or the Jack button hides while a control sits under it and on Messages | no (decision) | L0 `JackFab`, L7, L1 |
| F15 | PLAN C-7 vs frames | C-7 says "mock frames never set `data-nofab`" but quake, storm, storm-track, sos-banner, update-sheet frames set it (correct for D-91) | Reword C-7: the button is on every tab root except under a warning, storm, quake or SOS | n/a | orchestrator (PLAN) |

Checked and fine: no Jack art on quake, storm, storm-track, SOS banner, alerts-off, heat or any warning frame; no filled or emoji icons (the only filled set is the play triangle by design, now line); Jack art not clipped by a card edge at 390 in any frame; chips are one size (40, radius 14) except the 56 px round play chips on Watch (acceptable media); numbered orange callouts on the Labs frames are design annotations, not app badges; disabled "View as" controls are low contrast on purpose (disabled).

Open in the mockup, left as is: `discover-s16` cooking art (96 px but the dog fills only 57 % of the width, so he reads small, A2); `family-s16-empty-needs` family-hug at 56 px (three faces, too busy for 56; use `head` or 96, L4 decides); halos still baked in `ready-for-rain`, `reading`, `celebrate`, `hello`, `offline` (A1).

## Findings: app art (`src/assets/jack/`)

Checked all 19 names (`JACK_ALT`) at 1024 on white and on the dark card colour. All files are RGBA 1024 / 256 (head also 128), transparent corners, no border touching, so no hard clipping. Problems are in the content.

| # | File(s) | Problem baked into the art | Fix | Owner |
|---|---|---|---|---|
| A1 | `well-done`, `celebrate`, `medicine`, `playing`, `reading`, `ready-for-rain`, `sleepy`, `walking`, `watching` (strong); `hello`, `listening`, `get-help`, `empty-list`, `offline` (faint) | **A tan-to-orange backing panel (an angular gradient polygon) is part of the cut-out** behind the dog, with hard straight edges. On a dark card it shows as a stray orange shape; on a light card as a beige blob. Same flaw in 14 of 19 files. Only `cooking`, `drink-water`, `family-hug`, `head`, `thinking` are clean | Re-cut or regenerate: segment the dog (and his prop) alone, drop the panel. Add to the prompt base line in `docs/session-13/jack-jack-prompts.md`: "No backing card, panel or glow shape behind him; transparent background, dog and prop only." Automatic colour or texture keying ate the dog (tried), GrabCut with hand-set seeds works per image (tried on `well-done`, files in `shots/jack-clean/`); a proper segmentation model (rembg or SAM) on the 1024s is the quick route | L9 |
| A2 | `well-done` | Orange rounded badge with a white check baked beside him, plus yellow motion ticks. Conflicts with D-103 ("badges drawn by the app, never baked in") and with the mockup/app check | Re-cut without the badge (done once in `shots/jack-clean/`); the app draws no tick on him (rule 8); `JACK_ALT['well-done']` ("beside a check mark") becomes "Jack Jack sitting proudly" | L9 (+ `JackArt.tsx` alt) |
| A3 | `offline` | Grey Wi-Fi-off badge with a red x baked in (second badge next to the "You are offline" text and the offline bar's own icon) | Re-cut without the badge; `OfflinePanel` / OfflineBar draw the `off` icon beside him if wanted. Keeps alt text "beside a no-signal icon" out of sync, update | L9, L0 |
| A4 | `thinking` | Question-mark speech bubble baked in (a prop that behaves like a badge); `empty-list` and `get-help`, `hello`, `walking` carry yellow motion ticks | Allowed as props, but ticks and bubble are tan/yellow marks that look like stray shapes at 56 px; re-cut with them or remove them with the halo, owner decides per art | L9 |
| A5 | `cooking`, `ready-for-rain`, `watching` | Floor specks and dots (loose dark pixels near the base: cooking, ready-for-rain, watching) | Remove isolated components under ~300 px (1024 scale) in the re-cut | L9 |
| A6 | all | **Framing is inconsistent.** Subject width of the 1024 canvas: `head` 94 %, `drink-water` 94, `reading` 94, `sleepy` 94, `watching` 94, `family-hug` 89, `celebrate` 78, `playing` 73, `hello` 73, `medicine` 78, `ready-for-rain` 78, `walking` 71, `empty-list` 71, `thinking` 68, `get-help` 67, `listening` 65, `cooking` 57, `offline` 54. Height 94 % for portrait art but 70 to 76 % for `reading`, `sleepy`, `watching`. So at the same 96 px slot a wide pose looks 1.7x bigger than `offline` or `cooking`. Padding is 3 % top and bottom for portraits and 13 to 15 % for landscape | One common canvas: crop to the subject, scale so the longer side is 88 % of the canvas, centre on x, put the feet at 94 % of the height (landscape poses sit on the same baseline). Re-export 1024 and 384 (96 / 112 slots) and 256 (56 slot) | L9 |
| A7 | resolution | 256 px files are drawn at 96 (Discover, Recipes, Learn, Listen, Watch, Move, SimpleToday), 112 (StartDone, JoinFlow) and 150 (SignIn `wl-jj`) CSS px: on a 3x phone that needs 288, 336 and 450 px, so he is soft. `JackArt` ships only 128 / 256 on purpose (offline precache) | Ship a 384 for sizes 96 and 112 (about 25 KB each, 19 files is +450 KB gz-equivalent, or only the ~10 names used at 96+), and stop using 150 (rule 6: 112) | L9, L8 (SignIn) |
| A8 | `src/assets/mascot.svg` (`MASCOT_SRC`) | A flat line-drawn cartoon dog (cream circle, brown outline) from before the sticker art: a **different art style and a different Jack**. Still used in `FingerGate` (56), `ForgotFlow` (96, three times) and `RequiresUpdate` | Replace by `<JackArt name="head" | "hello">` and delete `mascot.svg` / `mascot.ts` (`JACK_ALT` already has the alt text); keep rule 9 for any error screen that is an emergency | L8 (ForgotFlow, FingerGate), L9 (RequiresUpdate, delete) |
| A9 | `head-128` / `head-1024` | Fine (clean, cropped by design, 94 %); `JackFab` draws it 48 px in a 56 px round chip with an amber ring (a ring plus a green disc plus the art: three layers) | Keep; ring + disc are chrome, not art. No change | none |

## Findings: `Icon.tsx` and `icons/custom.tsx`

| # | Problem | Fix | Owner |
|---|---|---|---|
| I1 | App icon sizes in use today (explicit `size=`): 14 ×2, 16 ×10, 18 ×33, 20 ×77, 22 ×30, 24 ×11, 26 ×5, 28 ×5, 30 ×1, 32 ×2, 92 ×1, plus 73 calls with no size (default 22) | Default 24; snap 14 → 16, 18 → 20, 22 → 20 or 24 by role, 26 / 28 / 30 → 24 or 32; fail a vitest on any other size | L9 + each lane for its own files |
| I2 | `STROKES` table has 22 → 1.8 and 26 → 1.7 steps (sizes that stop existing) | Four entries: 16 2.1, 20 1.9, 24 1.75, 32 1.5 | L9 |
| I3 | `boxed` makes a box of `round(size × 1.75)` (20 → 35, 24 → 42), the mockup and D-103 chips are 40 | Boxed = 40 px with a 20 px icon (row chip); drop the 1.75 maths | L9 |
| I4 | `FILLED` twin exists for 25 names but `active` is also passed by the Assistant mic (`listening`) and `LiteVideo` play (32 px, `active`); the desk `WebShell` nav passes it too | Rule 4: the filled twin only in `TabBar`; use a tone or a ring for "listening", a line play icon on the video; desk nav may keep it (it is a tab bar) | L7 (Assistant), L3 (LiteVideo) |
| I5 | No `language` icon, so the Language row had no right glyph | Add `language: IconLanguage` (Tabler, same grammar) | L9 |
| I6 | Four custom icons (`kidney`, `stomach`, `quake`, `typhoon`) default `stroke = 2` and ignore `strokeFor`; the Icon wrapper passes the stroke so it is fine, but any direct use renders 2 | Keep; add them to the size/stroke test | L9 |
| I7 | Text glyphs used as status marks: `✓ × – ○ ·` in `MedDetail.tsx` (cells and legend), `Pillbox.tsx` (marks and legend), `Sharing.tsx` (`✓`), `BpCheck.tsx` (`✓`), plus the family face corner marks in the mockup | Draw them with `<Icon name="check" size={16}>` and a 16 px close / minus glyph; `noGlyphIcons.test.ts` scans only `[›‹↗←]`, extend it to `✓ × ○ ✔ ✕ ⚠` outside strings read as words | L2 (MedDetail), L1 (Pillbox), L4 (Sharing), L2 (BpCheck) |
| I8 | Tone: `y-chip` icon colours in the mockup pass 3:1 in light and dark (checked, 483 icons: only disabled "View as" controls and the weather hero icons on the sky fall below, and the hero text uses the contrast-gated scrim) | none | none |

## What changed in `docs/session-16/mockup-v11.html` (count)

- **9 kinds of fix, about 330 element edits:** F1, F2 (2 frames, stacked tick removed), F3 (1 re-cut art, 2 frames), F4 (4 Jack sizes), F5 (204 icons resized), F6 (every icon stroke), F7 to F10 (18 icon swaps, 6 new sprite symbols from the app's own Tabler set: meal, walk, stretching, thermometer, glass, language), F11 (18 corner marks and 12 legend items), F12 (4 ticks), F13 (about 70 chip icons).
- Re-measured after the fix: 483 icons, 0 off-scale; Jack art on 56 / 96 / 112 only; no Jack art or Jack button on any warning frame; no overlap of Jack art (not the button) with another control in any v12 frame.
- Not fixed on purpose: F14 (decision), A1 to A7 (asset work, lanes).
