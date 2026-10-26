# Bantay web admin: UI audit (read-only)

- Date: 2026-10-22
- Code audited: `main` a2f4e52, rendered from a throwaway worktree (since removed). Nothing in the repo was edited, committed or pushed.
- Screenshots: `docs/ui-audit/admin/` holds 312 PNGs, named `<page>-<width>-<light|dark>.png`. The widths are 1440, 1280, 820 and 390. There are also `state-*` (empty, error and loading at 1440) and `kbd-*` (keyboard).
- How they were made: a Playwright spec built on the existing admin e2e mocks. It uses the same JWT and route-mocking pattern as `e2e/admin-*.auth.spec.ts`, with richer synthetic family data (6 people, 28 lab rows, 7 files, 10 audit rows). All traffic was mocked. The live site was not opened.
- Standard: the `design-taste-frontend` skill. That skill rules dashboards and admin panels out of scope (its §13), so only its cross-cutting rules were applied: colour lock, shape lock, theme parity, full states, typography, button contrast and the em-dash ban. On top of those, the yardstick is a premium admin standard (Linear, Stripe or Vercel dashboards). The v6 cream/green brand (D-66), Fraunces display type and Plus Jakarta UI type are kept as an approved brand override.

**Mock artifacts (not real bugs):**
- Per-member "Papers" and "IDs" counts and the lab range "0 to 6.5" on confirmed rows come from the mock (`HEAD` counts and the RPC ignore the person filter).
- The 2999 lock date renders as "Locked until 08:00".

## Overall read

The shell is solid:
- Grouped sidebar with count badges, collapse, icon rail at 1199 px or less, and a drawer under 768 px.
- `/` search, `g`+key jumps, `?` help, and j/k/x/c in the queue.
- Sticky table heads, a confirm dialog on every destructive action, and Undo toasts.
- Per-card retry on Home, and tokens-only dark mode.
- No em-dashes anywhere in the UI copy.

The gap to "premium admin" is mostly five things:
1. **Workflow depth.** The queue and duplicates make you decide without the paper in view.
2. **Consistency of small things.** There are three date formats, raw column names, lowercase raw status words, and four ways to label a status.
3. **Phone and tablet adaptation of tables and charts.**
4. **Two correctness bugs in states:**
   - The queue shows "Nothing to confirm" after a load error.
   - The page is blank while auth checks.
5. **Hierarchy.** Equal-weight cards, triple-repeated state, and dead space in the 12-col grid.

---

## 1. Shell (WebShell, desk.css) applies to every page

**Works**
- One-line top bar at 56 px.
- The sidebar group labels are the only uppercase micro-labels, which is fine.
- Badge colours carry meaning: amber means waiting, red means failed.
- The active nav state has a soft fill and a 3 px rule.
- Skip link, sr-only search label, and `aria-current`.

**Problems**

| # | Problem | Where | Fix |
|---|---|---|---|
| S1 | **Phone search collapses to a 40 px empty box.** The brand text and name are hidden, but the burger, shield and 4 icon buttons still eat the row (`home-390-light.png`, top). | `desk.css:30` (`.wa-search flex:1; min-width:0`), `desk.css:165-166` | Under 768 px, hide `.wa-brand` and the theme/help buttons. Replace `.wa-search` with a search icon button that opens a full-width overlay input (`position:absolute; inset:0 56px`). Or move theme and help into the `wa-me` popover. |
| S2 | **Account avatar is invisible in dark mode**: `--soft` #22352A background with `--green` text on a `--green` bar (`home-1440-dark.png`, top right). | `desk.css:42` | `.wa-av { background: var(--on-green); color: var(--green); }`, the same in both themes. Or `color: var(--ink)` in dark. |
| S3 | **Blank page while the session and role load.** `state-loading-home-1440-light.png` is fully blank cream for 2.5 s on a slow network. After that comes a bare "Loading…" text. | `src/features/auth/AuthGate.tsx:68` (`return null`), `WebShell.tsx:155` | In `admin-main.tsx`, wrap with a static shell skeleton: the green top bar plus sidebar plus 4 grey KPI blocks. `AuthGate` is shared with the phone app, so give it an optional `fallback` prop instead of changing its default. |
| S4 | Theme button shows a monitor glyph for "system". It reads as "display settings". | `WebShell.tsx:103` | Use the `sun`/`moon` half icon, or move theme into the account menu as a 3-way segmented control. |
| S5 | Footer "counts only on the dashboard, health values stay in Records" repeats on every page as permanent chrome. | `WebShell.tsx:192` | Show it on Home only, or drop it. |
| S6 | Mockup parity: the alert bell and the Safety data / Usage nav entries from `mockup-web.html` are missing. | `WebShell.tsx:167-173`, `types.ts:15-21` | See Gaps G7. |
| S7 | Sidebar `.wa-side` is `height: calc(100vh - top)` sticky. Fine in use. Full-page screenshots show it ending at 900 px. That is not a real bug. | n/a | none |

## 2. Shared primitives (ui.tsx, desk.css page parts)

| # | Problem | Where | Fix |
|---|---|---|---|
| P1 | **Confirm dialog has no title and a generic green "Confirm"**, even for Archive, Reject paper and Disable (`archive-confirm-1440-light.png`, `queue-confirm-dialog-1440-light.png`). | `ui.tsx:46-58` | Extend `ask(text, run, { title?, verb?, danger? })`. Render `<h2>` with the title, set the primary label to the verb ("Archive", "Reject 4 rows"), and use `dk-b bad-solid` when `danger`. Keep the old signature working. |
| P2 | Sort indicator glued to the label ("Name▲"), using a unicode triangle. | `ui.tsx:107` | Use `<Icon name="chev" size={14}>` rotated with a 4 px gap. Always reserve the space so headers do not shift. |
| P3 | Status words are shown raw and lowercase: "confirmed", "draft", "failed", "reading", "insert". | `ui.tsx:23` (`Tag`); see per-page entries | Add `StatusTag({ status })` in `ui.tsx` that maps to "Confirmed / Draft / Rejected / Failed / Reading / New / Done". Pages switch to it. |
| P4 | Tabs overflow silently: the 9 Records tabs cut "Vis…" at 1440 in the member page (`member-records-1440-light.png`) and on `/records` (`records-rx-1440-light.png`). | `desk.css:87` | Add a scroll fade mask (`mask-image: linear-gradient(90deg,#000 90%,transparent)`) and `scroll-snap`. Or collapse the last tabs into a "More" menu when the tabs overflow. |
| P5 | The detail panel overlays the table and hides the Person and Status columns. It has no next/previous controls (`records-lab-panel-1440-light.png`). | `desk.css:137` | At ≥1280 px, dock the panel as a grid column (`.wa-main` becomes `grid-template-columns: 1fr 440px`) so the list stays fully visible. Add ‹ › buttons and j/k inside the panel. |
| P6 | Radius scale is mostly 8 (cards, inputs, buttons), 999 (chips) and 4 (tags). Strays: dialog 12 (`desk.css:145`), archived banner 12 (`members.css:50`), calendar day 16 (`calendar.css:26`). | as listed | Use one rule: 8 for surfaces and controls, 999 for chips and the today dot, 4 for tags. Set the dialog and banner to 8. |
| P7 | Focus ring is a 2 px amber-ink outline only. The j/k row cursor in the queue is easy to lose (`kbd-queue-j-1440-light.png`). | `records.css:13` | Also set `background: color-mix(in srgb, var(--soft) 60%, var(--card))` on `.rc-qrow:focus-visible td`. |
| P8 | Three date formats across the app: ISO `2026-10-17` (Records, Duplicates, IDs), `Oct 20, 2026, 8:12 AM` (Files, History), and `Sat 24 Oct` / "2 d ago" (Home). | `admin/shared.tsx:4` (`when`), `recordsUi.tsx:13` (`fmt` slices ISO) | Add a single date helper in `shared.tsx`: `day()` → "17 Oct 2026", plus `dateTime()` → "17 Oct, 8:12 AM" with the year only when it differs. Tables use `day()`, logs use `dateTime()` with relative time in a `title`. |

## 3. Dashboard home (`home-*`)

**Works**
- 4 KPI tiles that drill down, tinted only when there is something to act on.
- Charts have text summaries and hidden tables.
- Every card loads and fails on its own, with Retry (`state-error-home-1440-light.png` is good).
- The "Needs you" list puts its actions on the right.

| # | Problem | Where | Fix |
|---|---|---|---|
| H1 | **Grid hole**: "Recent changes" is `dk-s8`, which leaves a 4-col empty area at 1440 and 1280 (`home-1440-light.png`, bottom right). | `Home.tsx:129` | Make it `dk-s12`. Or pair it with a `dk-s4` "Members at a glance" card (locked, never signed in, disabled). |
| H2 | **Chart text scales with the SVG**: the fixed `viewBox 640×170` makes 11 px axis text render about 5 px at 820 and 390 (`home-820-light.png`, chart row). | `Home.tsx:49`, `home.css:6` | Measure the container with a `ResizeObserver` and set `W` to its pixel width. Or render axis labels as HTML under the SVG. Keep `H` fixed (180). |
| H3 | Line chart has 3 x-ticks, no hover value and no last-value marker. The weekly bars have no value labels. | `Home.tsx:59-63` | Add a value label above each bar (8 bars fit). Add an end-point dot plus value on the line. Add a `<title>` per point for hover. |
| H4 | KPI tiles have no context. The mockup has "+1 vs last week" and "86 labs". | `Home.tsx:99-102`, `ui.tsx:75` | Add a `delta` prop to `Kpi`. Feed "vs last week" for Active and To confirm from data already loaded (`loadConfirmedWeeks`). |
| H5 | Grammar: "1 papers" in "Confirm queue by person" (`home-1440-light.png`). | `Home.tsx:114`, `homeApi.ts:71-72` | Make `kindWord(k, n)` return the singular when n === 1 (`paper`, `lab`, `prescription line`, `vaccination`). |
| H6 | Clicking a person in "Confirm queue by person" opens the whole queue, not that person. | `Home.tsx:112-113` | Link to `deskHref('queue', personId)`. Queue gets a person filter (see Q6). |
| H7 | Three work cards stretch to equal height, so the queue card has about 180 px of empty space. | `desk.css:93` (grid default stretch) | Add `align-items: start` on `.dk-grid`, or a per-row `align-self: start` on these cards. |
| H8 | Schedule card times wrap ("Tomorrow, 9:00 / AM") in a 110 px column. | `calendar.css:75` | `grid-template-columns: 132px minmax(0,1fr)` and `.sc-when { white-space: nowrap }`. |
| H9 | Recent changes mixes casing: "family tasks" (raw table name) next to "Lab result" and "Profile". | `logsApi.ts:117` (`TABLE_WORDS` missing `family_tasks`, `family_events`) | Add the missing table words. |
| H10 | No "last updated" time next to Refresh. | `Home.tsx:97` | Show `Updated 08:12` muted text next to the button. |
| H11 | Phone: KPIs stack 1-col, which takes about 1.5 screens before any work list (`home-390-light.png`). Recent changes squeezes into a sideways-scrolling 5-col table. | `desk.css:175`, `Home.tsx:131` | Under 768 px use a 2×2 KPI grid (`.dk-s3 { grid-column: span 6 }`). Show Recent changes as a stacked list (who / what / when). |

## 4. Members list (`members-*`, `members-needs-attention-*`, `members-add-dialog-*`)

**Works**
- One table for everyone.
- State tags carry the important facts ("Locked until 08:00, 5 tries").
- Filter chips have counts, and the whole row is clickable.
- The add flow is a side panel.

| # | Problem | Where | Fix |
|---|---|---|---|
| M1 | Rows needing attention are scattered by alphabetical sort. | `Members.tsx:105` (initial sort `name`) | Default sort: needs-attention first, then name. Or pin a 1-line "2 need you" summary above the table that applies the chip. |
| M2 | Avatars are identical soft circles with 11 px initials. They add little and break the scan line. | `Members.tsx:144` (`size={28}`) | Use 32 px. Pick the colour from a hashed set of 4 brand-safe tints (`--soft`, `--card2`, amber 22 %, `--c-vitals` 18 %). Initials at 12 px weight 700. |
| M3 | "Last seen" is blank for dependents but "Never" for unused members. Blank reads as missing data. | `Members.tsx:150` | Render a muted "n/a" (or an em-less "No sign-in") for dependents. |
| M4 | Phone: 3 header buttons wrap to 2 rows, then 3 rows of chips. The table scrolls sideways with State cut (`members-390-light.png`). | `members.css:41`, `Members.tsx:113-127` | Under 768 px: put Invite and Add dependent behind a "More" menu (keep Add member). Make the chips a horizontal scroll-snap row. Make rows cards: name + state tag on line 1, sign-in · last seen on line 2. |
| M5 | No column for a member's role-change or lock action. You always have to open the member. | `Members.tsx:140-153` | Optional: a trailing kebab menu per row (Unlock, Reset PIN, Open). |

## 5. Member page (`member-*`, `archive-confirm-*`)

**Works**
- Breadcrumb, tabs as real URLs, an unsaved-changes guard, and a separate Archive section.
- The Danger zone has outline-red buttons.
- The archived banner has Reactivate.

| # | Problem | Where | Fix |
|---|---|---|---|
| MP1 | **State repeated 3 times**: "Locked" tag in the title row, in the summary, and in the Sign-in card header (`member-account-1440-light.png`). | `Person.tsx:488`, `:509`, Account card | Keep it in the summary and as the Sign-in card's status. Drop the title-row tag, or make it the single primary banner with an Unlock button inline. |
| MP2 | Identity is shown 3 times on Profile: H1, the summary card (64 px avatar plus name), and a second 72 px avatar plus Name field in the form (`member-profile-1440-light.png`). | `Person.tsx:504-512`, `ProfileForm` | Move "Choose photo" into the summary card under the avatar. Remove the avatar from the form. |
| MP3 | Summary is a 4-col card with right-aligned values. It leaves about 300 px of dead space below on Account and Carers. | `Person.tsx:504`, `members.css:25-28` | Make the summary `position: sticky; top: 72px`. Or, on Account, Carers and IDs, use the compact horizontal summary already built for `wide` tabs (`mp-wide`). |
| MP4 | Account "Sign-in" `dl` puts labels at the far left and values at the far right of a 760 px card, which is hard to read across. | `members.css:26` | Use `.mp-dl > div { display:grid; grid-template-columns: 160px 1fr }` and left-align values. |
| MP5 | Carers card starts with a stray hairline and has no card header, unlike Profile ("Profile" header) (`member-carers-1440-light.png`). | `Carers.tsx:46`, `members.css:17` (`.mb-sec` `border-top`) | Wrap it in `dk-card-h` "Carers", plus `.mb-sec:first-child { border-top:0; padding-top:0 }`. |
| MP6 | Every carer row has a full red outline "Remove". Two destructive buttons stacked look alarming. | `Carers.tsx` row actions | Use a quiet text button "Remove" (`dk-b` ghost). The confirm dialog already guards it. |
| MP7 | Archive confirm uses the generic dialog with a green "Confirm" button. | `Person.tsx:309` via `ui.tsx` | See P1: title "Archive Lola Cora Reyes?", verb "Archive", danger styling. |

## 6. Confirm queue (`queue-*`, `queue-select-all-*`, `queue-confirm-dialog-*`, `kbd-queue-j-*`)

**Works**
- Grouped by person then paper.
- Low-confidence and unclear rows start unticked, with an explanation.
- Select all is tri-state.
- Keyboard flow, Undo, and links to "also waiting" items on other pages.

| # | Problem | Where | Fix |
|---|---|---|---|
| Q1 | **Error looks like success**: after a failed load the page shows "Something went wrong" *and* "0 draft rows in 0 papers", "Nothing to confirm.", and a disabled "Confirm 0 checked" (`state-error-queue-1440-light.png`). Same pattern on Duplicates ("0 groups" plus "No duplicate papers.") (`state-error-duplicates-1440-light.png`). | `Queue.tsx:191`, `:194`, `:206`; `Duplicates.tsx:44-46` | Keep `papers === null` on error and render `<Empty>` with Retry instead of the empty state. Hide the totals line and the head button when there is an error. |
| Q2 | **No source page in view.** You confirm lab values without seeing the paper. Records has a page preview; the queue does not. | `Queue.tsx:206-260` | Use a two-column layout at ≥1280: the queue on the left, a sticky right pane showing the current paper's page (reuse `SourcePages` from `Records.tsx:30-58`). It follows the j/k cursor. |
| Q3 | **Value column hides the decision data**: "162 mg/dL flag H" is plain text, with no reference range and no High/Low tag, although Records has both. | `Queue.tsx` `detail()` | Show value (right-aligned, tabular) + range + `<Tag warn>High</Tag>`, the same as `Records.tsx:70-77`. Put the amber row rule (`rc-abn`) on abnormal rows. |
| Q4 | Primary action "Confirm 7 checked" lives in the page head and scrolls away. | `Queue.tsx:192` | Put a sticky bottom action bar (reuse `.rc-bulk`) with "7 checked · Confirm · Clear". Leave the head button as is, or remove it. |
| Q5 | Column widths differ per paper table, so columns zig-zag down the page. Each table also repeats its paper title as a visible caption under the identical `h3` (`queue-1440-light.png`). | `records.css:5` (`.rc-cap` visible), `Queue.tsx:228-229` | `.dk-table { table-layout: fixed }` with a shared `<colgroup>` (52 / 30 % / 30 % / 20 % / auto). Make `.rc-cap` visually hidden in the queue. |
| Q6 | No person filter and no per-paper "tick all". | `Queue.tsx:191-205` | Add a person chip row (from `byPerson`), routed as `#/queue/<personId>`. Add a header checkbox per paper table. |
| Q7 | Hierarchy is inverted: the person name (`h2` Fraunces 18) reads lighter than the paper title (`h3` 16 bold, longer). | `Queue.tsx:208`, `records.css:6` | Make the person `h2` 20 px with a count ("Lola Cora Reyes · 6 rows"). Make the paper `h3` 15 px weight 600 in `--muted` with the date right-aligned. |
| Q8 | Possible duplicate papers (same file) sit side by side in the queue with no hint (Ben Reyes, two identical prescriptions). | `Queue.tsx` paper head | Show a `Tag warn` "Possible duplicate" linking to `#/duplicates` when the `sha256` matches (data already in `loadDuplicates`). |
| Q9 | The totals line packs counts plus a keyboard tip into one muted run with middle dots. | `Queue.tsx:194` | Split it. Counts become 4 compact stat chips. The keyboard tip moves to `?` help and a `kbd` hint next to Select all. |
| Q10 | Phone: 5-col tables scroll sideways and the Fix button is cut off (`queue-390-dark.png`). | `records.css:39-42` | Under 768 px, render each row as a card: checkbox, item and value on line 1, check tags plus Fix on line 2. |

## 7. Records (`records-<tab>-*`, `records-lab-panel-*`, `member-records-*`)

**Works**
- Tabs carry counts.
- Status chips, date range and search.
- Abnormal labs get an amber left rule and High/Low tags.
- Bulk confirm/reject with Undo.
- The panel shows the source page above the edit form.

| # | Problem | Where | Fix |
|---|---|---|---|
| R1 | **Edit form labels are raw DB column names**: "name raw", "value num", "unit raw" (`records-lab-panel-1440-light.png`). | `recordsUi.tsx:12` (`label`) | Add a `FIELD_LABELS` map: name_raw→Test, value_num→Value, value_text→Value (text), unit_raw→Unit, ref_low→Range low, drug_raw→Medicine. Fall back to the current `label()`. |
| R2 | Bulk bar is `position: sticky; bottom` but sits *above* the table, so it scrolls off as soon as you scroll down. | `Records.tsx:331-337`, `records.css:35` | Render `.rc-bulk` after the table (`{body}` first), or switch it to `position: fixed; bottom: 16px` centered on `.wa-main`. |
| R3 | Rows are 57 px (the 44 px checkbox inflates them), which shows about 11 rows per 1440×900 screen. | `records.css:9`, `records.css:32` | On desktop (pointer: fine) draw the checkbox in a 32 px hit area so rows go to 44 px. Keep 44 px under `(pointer: coarse)`. |
| R4 | Value column is left-aligned and not tabular. The status column shows lowercase "confirmed" and "draft". | `Records.tsx:70-77`, `:67` | Give the value `td` `className="num"`. Use `StatusTag` (P3). |
| R5 | Filter row baseline: unlabeled status chips sit next to labeled inputs, so they float mid-height. "Everyone" subtitle duplicates the Person select. | `Records.tsx:307-326` | Add an sr-visible "Status" label above the chips, or bottom-align the row (`align-items: end`). Drop `sub` when `person` is null. |
| R6 | Prescription cards each size their columns differently (`records-rx-1440-light.png`). | `Records.tsx:133-160` | Same `table-layout: fixed` plus `colgroup` as Q5. |
| R7 | The panel cannot step to the next row. Confirming 20 drafts means open, confirm, close, open again. | `Records.tsx:340`, `ui.tsx:27` | ‹ › buttons plus j/k inside `Panel`. After Confirm, auto-advance to the next draft. |
| R8 | Phone: ISO dates wrap onto 2 lines (`records-lab-390-light.png`). | `recordsUi.tsx:13` | Use the short date "17 Oct" in tables (P8) and hide Range and Source under 768 px. |

## 8. Duplicates (`duplicates-*`)

**Works**
- Copies side by side, with a row-difference table.
- "Keep this one" confirms and offers Undo.

| # | Problem | Where | Fix |
|---|---|---|---|
| D1 | No page images, so you pick a copy blind. | `Duplicates.tsx:53-65` | Put a thumbnail of page 1 at the top of each `rc-card` (reuse `SourcePages`). |
| D2 | Two identical full-width green primaries with no recommendation. | `Duplicates.tsx:63` | Pre-select the copy with more confirmed rows (or the older one) as "Recommended" and make it the primary. The other becomes secondary. |
| D3 | Zero rows add noise ("Labs 0 (0 confirmed)" ×3). Differing fields are not highlighted in the cards. | `Duplicates.tsx:58-62` | Hide kinds where n=0. Bold and tint `dd` values that differ between copies (Added date here). |
| D4 | Diff table shows the raw field name "frequency", via `replace('_',' ')`, which only replaces the first underscore. | `Duplicates.tsx:74` | Use the same `FIELD_LABELS` as R1. |

## 9. Files and scans (`files-*`)

**Works**
- Status chips, a person filter, problem text in words, and Retry only where it is possible.

| # | Problem | Where | Fix |
|---|---|---|---|
| F1 | **Phone: file names break one character per line** ("ch / e / m- / pa / nel") (`files-390-light.png`). | `files.css:4` (`overflow-wrap:anywhere` with no min width) | `.fl-file { min-width: 160px; overflow-wrap: break-word }`, plus card rows under 768 px (as Q10). |
| F2 | Failed rows do not stand out. Status is a small lowercase tag in column 6. No bulk "Retry all failed". | `Files.tsx:58`, `:38` | Sort failed first by default. Add the amber or red left rule (`rc-abn` style). Add "Retry 2 failed" in the PageHead when the Failed chip is on. |
| F3 | No loading state: with `rows === null` the table area is empty. | `Files.tsx:47-49` | `{!error && !rows && <Skeleton rows={6} />}`. |
| F4 | Kind shown raw lowercase ("lab", "id", "prescription"). Every "Added" shows the full timestamp. | `Files.tsx:10`, `:62` | Title-case kind words. Use relative time with the full date in `title` (P8). |

## 10. IDs and insurance (`ids-*`, `ids-noperson-*`, `member-ids-*`)

**Works**
- Masked numbers in tabular type, a logged 30 s Show, confirm/reject with Undo.
- An "Expired" tag.

| # | Problem | Where | Fix |
|---|---|---|---|
| I1 | **KPI drill-down dead end**: Home "IDs expiring in 60 days" links to `#/ids`, which shows only "Choose a person" (`ids-noperson-1280-light.png`). | `Ids.tsx:89`, `Home.tsx:102` | With no person, list every person's IDs and policies that expire in ≤ 60 days. Columns: person, type, last 4, expires, days left. This uses the same selects as `loadExpiring` (no numbers). |
| I2 | An ID that expires in 20 days shows a plain date. Only already-expired items are tagged. | `Ids.tsx:113` | Add `<Tag warn>In 20 days</Tag>` when the item expires within 60 days. |
| I3 | Five buttons per row (Show, Open page, Edit, Confirm, Reject) make a noisy action column. | `Ids.tsx:108-121` | Keep Show inline with the number. Move Edit, Reject and Open page into a row menu. Keep only Confirm (for drafts) visible. |

## 11. History (`history-*`, `member-history-*`)

**Works**
- Filters by person, table, action and date range.
- The note "Field names only, never the values".

| # | Problem | Where | Fix |
|---|---|---|---|
| HI1 | Action tags are raw and lowercase ("confirm", "insert", "reveal"), while Home says "Confirm" and "Add" for the same rows. | `History.tsx:89` | Use `ACTION_WORDS` from `homeApi.ts:103` (or move it into `logsApi.ts`). |
| HI2 | Fields are raw column names (`id_number`, `value_num`, `unit_raw`). | `History.tsx` fields cell, `Home.tsx:139` | Map them through `FIELD_LABELS` (R1). Put that map in `logsApi.ts` so Home, History and Records share it. |
| HI3 | Date inputs have no visible labels (sr-only), and there is no "Clear filters". | `History.tsx:72-74` | Add visible "From" and "To" labels, matching Records. Show a "Clear" chip when any filter is set. |
| HI4 | No paging or "Load more" is visible. Not verified with more than 10 rows. | `logsApi.ts:123` | Add "Load 50 more" with an `.range()` cursor. |

## 12. Calendar and schedule card (`calendar-*`, `calendar-day-panel-*`)

**Works**
- Month, Week and Agenda views as URLs.
- Kind colours carried by `--k`, a today marker, and "+3 more".
- A day panel with inline edit.
- The 14-day dose cap is disclosed.

| # | Problem | Where | Fix |
|---|---|---|---|
| C1 | **Medicine times flood every day.** Three dose chips per cell push real events behind "+3 more" (`calendar-month-1440-light.png`). | `Calendar.tsx` default `kinds`; month cell render | In month view, collapse doses into a single chip "5 doses" per day. Or default `Medicine times` off in month view (on in week and day). |
| C2 | Phone: the kind chips plus 7 person chips take about 400 px before the grid (`calendar-month-390-light.png`). | `calendar.css:10`, `Calendar.tsx:144-158` | Under 768 px, put the filters behind a "Filters (2)" button that opens a sheet. Make the person filter a `<select>`. |
| C3 | All 6 kind chips are "pressed" (dark green) by default. That is a heavy dark band with nothing to tell it apart. | `calendar.css:11`, `desk.css:86` | For multi-select kind filters, use the outline style with a coloured dot when on. Use a muted, struck-through look when off. |
| C4 | The day panel opens with no scrim and covers Fri–Sun. | `ui.tsx:27` (`Panel`) | Same as P5 (dock at ≥1280). Otherwise add a light scrim. |
| C5 | The schedule card time column wraps. | `calendar.css:75` | See H8. |

## 13. Dark mode summary

Parity is good across all pages. Tokens flip, tags keep contrast, and charts use `--green2`.

Issues:
- **S2** (avatar invisible).
- The source-page preview is a bright white rectangle in a dark panel (`records-lab-panel-1280-dark.png`). Fix: `filter: brightness(.9)` on `.rc-page img` under dark, with a hover to restore.
- The kind chip colours in the calendar get darker in dark mode (`--k` brown on dark green), which lowers dot contrast. Use the dark-theme `--c-*` values for `--k`.

## 14. States coverage

| Page | Loading | Empty | Error |
|---|---|---|---|
| Home | per-card skeleton (code). Not captured, because S3 blanks the page first | good (`state-empty-home`) | good, per card with Retry |
| Members | Skeleton | good | message only, no Retry (`Members.tsx:126`) |
| Queue | "Loading..." text (`Queue.tsx:206`) | good | **wrong (Q1)** |
| Records | Skeleton | good | error line *plus* "No laboratory for these filters" (`state-error-records`). Same pattern as Q1 |
| Files | **none (F3)** | good | message only |
| IDs | none | good | message only |
| Duplicates | "Loading..." text | good | **wrong (Q1)** |
| History | n/a | good | message only |
| Calendar | Skeleton | good | message plus Try again (good) |

Fix: one `<LoadState loading error retry empty>` wrapper in `ui.tsx` that every page uses. It removes the five ad-hoc variants.

---

## 15. Gaps: missing admin workflows and states

- **G1 Review-with-source workflow.** There is no split view anywhere. Queue, Duplicates and IDs all decide without the paper (Q2, D1).
- **G2 "Next draft" loop.** You cannot step through drafts from the Records panel. Confirming does not advance (R7).
- **G3 Person-scoped queue.** Home and member pages cannot open "this person's queue" (H6, Q6).
- **G4 Expiring IDs overview** (I1).
- **G5 Bulk retry** for failed scans (F2).
- **G6 Export.** There is no CSV export of a Records tab or of History. The plan defers it, but it is standard for admin tools.
- **G7 Mockup items not built:** the alert bell, the Safety data and alerts page, the Usage page, and KPI deltas (S6, H4).
- **G8 "Last refreshed" and auto-refresh** on Home (H10).
- **G9 Session-expiry handling.** No visible state when the JWT expires mid-session. Not tested.
- **G10 Shell skeleton** while auth checks (S3).

## 16. Ranked top 15 (impact × effort)

| Rank | Change | Impact | Effort | Lane |
|---|---|---|---|---|
| 1 | Q1: queue and duplicates error no longer shows "Nothing to confirm" | High (false "all clear") | S | C |
| 2 | Q2 + Q3: queue split view with the source page, plus range and flag tags in Value | High | M | C |
| 3 | S1: usable phone search, top bar decluttered | High (phone) | S | A |
| 4 | I1 + I2: all-people expiring IDs view, "In N days" tag | High (dead-end KPI) | M | E |
| 5 | R1 + HI1 + HI2 + D4: human field and action labels (shared map in `logsApi.ts`) | Med-High | S | E (map) then C |
| 6 | Q4 + R2: sticky bulk bars that stay visible | Med-High | S | C |
| 7 | P1: confirm dialog with title, action verb and danger style | Med-High | S | A |
| 8 | S3: shell skeleton instead of a blank page | Med | S | A |
| 9 | H1 + H2 + H5 + H7: Home grid hole, legible charts, "1 paper", card heights | Med | S/M | B |
| 10 | C1 + C3: calendar month without dose flood, lighter kind filters | Med | S | B |
| 11 | P5 + R7: docked detail panel ≥1280 with next/previous and auto-advance | Med-High | M | A (panel) + C (wiring) |
| 12 | F1 + F2 + F3: Files phone wrap, failed first, bulk retry, skeleton | Med | S | E |
| 13 | P8 + P3: one date helper, `StatusTag` | Med (consistency) | S | A, then adoption per lane |
| 14 | MP1–MP5: member page de-duplication and layout | Med | S/M | D |
| 15 | S2: dark avatar (plus dark preview dimming) | Low-Med | S | A |

## 17. Build lanes (no shared files)

Lane A goes first: it adds new APIs, and B–E adopt them in their own files. Every other lane is independent.

- **Lane A: Shell and primitives.**
  - Files: `desk.css`, `ui.tsx`, `WebShell.tsx`, `admin/shared.tsx`, `src/admin-main.tsx`.
  - Items: S1, S2, S3 (via a fallback in `admin-main.tsx`; `AuthGate.tsx` is untouched unless a `fallback` prop is approved), S4, S5, P1, P2, P3 (`StatusTag`), P4, P5 (docked panel plus `onPrev`/`onNext` props), P6, P8 (date helpers), and `LoadState`.
- **Lane B: Home and Calendar.**
  - Files: `Home.tsx`, `home.css`, `homeApi.ts`, `ScheduleCard.tsx`, `Calendar.tsx`, `calendar.css`, `scheduleApi.ts`.
  - Items: H1–H11, C1–C5.
- **Lane C: Records workflow.**
  - Files: `Queue.tsx`, `Records.tsx`, `Duplicates.tsx`, `records.css`, `recordsUi.tsx`, `recordsApi.ts`.
  - Items: Q1–Q10, R1–R8, D1–D4. Imports `FIELD_LABELS` from `logsApi.ts` after Lane E lands, or keeps a local copy in `recordsUi.tsx` and dedupes later.
- **Lane D: Members.**
  - Files: `Members.tsx`, `Person.tsx`, `Carers.tsx`, `members.css`.
  - Items: M1–M5, MP1–MP7.
- **Lane E: Files, IDs, History.**
  - Files: `Files.tsx`, `Ids.tsx`, `History.tsx`, `files.css`, `logsApi.ts`.
  - Items: F1–F4, I1–I3, HI1–HI4. `logsApi.ts` gains `FIELD_LABELS`, `ACTION_WORDS` (re-exported for Home) and `family_*` table words.

Contract note: `homeApi.ts` (Lane B) currently owns `ACTION_WORDS`. Lane E adds a copy in `logsApi.ts`, and Lane B switches its import afterwards. Do not edit across lanes.

## 18. Not rendered or not verified

- **Live site** https://bantay.pages.dev/admin was not opened. All shots use mocked data.
- **People** is an alias of Members (`types.ts:28`). `people-alias-*` shows the Members list, which is correct.
- **Card skeletons:** loading skeletons inside Home and Queue cards were not captured, because the auth gate (S3) blanks the page for the whole delay.
- **Interactive states not opened:** the Show reveal on IDs, the Fix inline editor in the queue, Invite / Give a sign-in sheets, the Reset PIN result, and the toast with Undo.
- **Volume:** History paging and large volumes (86+ queue rows, 7 duplicate groups) were not checked.
- **Mobile drawer:** `phone-drawer-390-*` was captured. The drawer works (no issues beyond S1).
- **Rendering engine:** shots are from Chromium only.
