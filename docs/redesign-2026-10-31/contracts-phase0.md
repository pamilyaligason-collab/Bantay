# v13 Phase 0 contract (foundation)

Every Phase 0 lane (F0-A..F0-D) and every Phase 1 tab lane builds against this file. It fixes names, values, props,
paths, test ids and the test policy. A lane that needs something not listed here asks the orchestrator; it never
invents a second token, class or test id for the same thing. Source of truth for the look: the approved boards
(`mockup/*.dc.html`, D-108) and their helmet CSS; this contract is the code form of that CSS.

Decisions honoured: D-105 (hybrid Apple look, Today focus, Jack sheet, Me focus, GPS last fix), D-108 (boards
approved). Rules: 44 px targets, computed contrast >= 4.5:1 for text (>= 3:1 for icons and borders), reduced motion
honoured, text in px that survives the 195 px narrow test (`narrow.css`), every token has a dark value.

## 1. Lanes and file ownership

| Lane | Owns (nobody else edits) | Depends on |
|---|---|---|
| F0-A tokens + components | `src/styles/tokens.css`, `src/styles/app.css`, `src/styles/glass.css`, `src/styles/narrow.css`, `public/fonts/*`, `src/features/look/*` (new: `LargeTitle.tsx`, `Section.tsx`, `GroupedList.tsx`, `PreviewTile.tsx`, `Carousel.tsx`, `Segmented.tsx`, `Sheet.tsx`, `MapCard.tsx`, `v13.css`, `contrastMath.ts`; rewritten: `Row.tsx`, `cards.css`, `contrast.test.ts`, `index.ts`) | none |
| F0-B P0 bugs | `src/features/records/useHealthData.ts` (+ new `useHealthData.test.tsx`), `src/screens/Health.tsx`, `src/features/health/BodyHero.tsx`, `src/features/health/BodyHero.test.tsx`, `src/features/health/health.css`, `src/features/location/*`, `src/features/safety/alerts.ts` (label line only), `src/features/safety/MapsPanel.tsx` (one line), `src/features/today/placeName.ts`, `src/features/today/WeatherCard.tsx` (`whereOf` only), `src/styles/safearea.css` (new), `src/main.tsx` (one import line) | none |
| F0-C shell | `src/features/shell/*` (new `JackSheet.tsx`, `JackSheet.test.tsx`; rewritten `JackFab.tsx`, `TabBar.tsx`, `shell.css`; deleted `AskSheet.tsx`, `AskSheet.test.tsx`), `src/screens/Today.tsx`, `src/screens/Today.simple.test.tsx`, `src/features/today/s14t2r2.test.tsx` (SOS lines only), `e2e/jack-sheet.spec.ts` (new), `e2e/ask-sheet.spec.ts` (deleted) | F0-A step A1 (tokens) and A7 (`Sheet`) |
| F0-D test policy | `e2e/s16.ts`, `e2e/v13.ts` (new), `e2e/s16-*.spec.ts`, `e2e/s16-helpers.spec.ts`, `e2e/v13-foundation.spec.ts` (new), `docs/redesign-2026-10-31/TESTING.md` (new), `src/features/today/chipContrast.test.ts`, `src/features/viewas/viewas.contrast.test.ts` | F0-A, F0-B, F0-C merged |

Order: **F0-A and F0-B run in parallel from the start.** F0-C starts as soon as F0-A has committed A1 and A7 (it
rebases on those two commits; it can begin C1-C3, which need no Sheet, right away). **F0-D runs last** on the
integration branch with the other three merged.

Branches: `claude/v13-f0-a`, `claude/v13-f0-b`, `claude/v13-f0-c`, `claude/v13-f0-d`, each a worktree off
`claude/penpot-figma-analysis-a4dc0a`. Integration branch: `claude/v13-phase0`. Playwright ports: F0-A `PW_PORT=4400`,
F0-B `4410`, F0-C `4420`, F0-D `4430` (the auth project uses `PW_PORT+500`).

Untouched by Phase 0 (Phase 1 lanes own them): every `src/features/<tab>/*.css` other than the files above, every
screen other than `Today.tsx` and `Health.tsx`, `src/features/family/Sheet.tsx` (lane F swaps it for `look/Sheet`),
`today.css` (lane T deletes the dead `.td-sos` rules).

## 2. Tokens (`src/styles/tokens.css`)

Two blocks only: `:root` (light) and the dark pair (`:root[data-theme="dark"]` and
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) }` with identical bodies; `contrast.test.ts`
asserts they are equal). Every token below exists in both. Hex literals, not `var()`, for every colour token (tests
parse them; `--warn-bg` is the one `color-mix` and keeps its exact text).

### 2.1 v13 tokens (new names)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ground` | `#F5F3EF` | `#121110` | page background |
| `--card` | `#FFFFFF` | `#1E1D1A` | cards, grouped lists, sheets |
| `--card2` | `#EFECE6` | `#2A2824` | pressed fill, segmented track, avatar fill |
| `--ink` | `#1C1B19` | `#F2F0EB` | text |
| `--muted` | `#6B675F` | `#A8A39A` | secondary text (>= 4.5 on card and ground) |
| `--hair` | `rgba(60,55,45,.16)` | `rgba(255,255,255,.14)` | 0.5 px separators |
| `--green` | `#1E6B4E` | `#4FA37F` | accent text, icons, active tab |
| `--green-tint` | `#E3EFE8` | `#15302A` | green fill |
| `--on-green` | `#FFFFFF` | `#0E1A14` | text on a solid `--green` button |
| `--btn` | `#1E6B4E` | `#27795A` | solid primary button fill (white text >= 4.5 in both; every pair in this table was computed 2026-10-31, `#2E8A66` missed at 4.25) |
| `--tint-blue` / `--tint-blue-ink` | `#E5EDFB` / `#2459C7` | `#16213A` / `#7FA6F0` | readings, weather rows |
| `--tint-red` / `--tint-red-ink` | `#FBE7E4` / `#B42318` | `#3A1A17` / `#F08A80` | missed, SOS, hazards |
| `--tint-amber` / `--tint-amber-ink` | `#FDF1DC` / `#8A4B06` | `#3A2A10` / `#E8B04E` | warnings, quake |
| `--tint-teal` / `--tint-teal-ink` | `#DDF1EE` / `#0F766E` | `#12302D` / `#5CC4B8` | steps, maps, calm |
| `--tint-purple` / `--tint-purple-ink` | `#EEE9FA` / `#6D4BC2` | `#26203A` / `#B59CF0` | visits, learn |
| `--tint-green` / `--tint-green-ink` | `#E3EFE8` / `#1E6B4E` | `#15302A` / `#4FA37F` | medicines, done |
| `--red` | `#B42318` | `#F08A80` | danger text |
| `--danger-bg` | `#C8372D` | `#B3261E` | SOS disc, Call 911 (white text >= 4.5) |
| `--amber` | `#D97706` | `#E8B04E` | badges, focus ring |
| `--focus` | `#8A4B06` | `#E8B04E` | focus outline (>= 3 on ground and card) |
| `--shadow` | `0 1px 2px rgba(40,30,10,.06)` | `0 1px 2px rgba(0,0,0,.4)` | cards |
| `--shadow-float` | `0 8px 24px rgba(40,30,10,.12)` | `0 8px 24px rgba(0,0,0,.5)` | tab bar, Jack button |
| `--glass-bg` | `rgb(255 255 255 / .80)` | `rgb(30 29 26 / .78)` | tab bar, top bar when scrolled |
| `--glass-sheet` | `rgb(245 243 239 / .96)` | `rgb(30 29 26 / .96)` | sheets |
| `--glass-edge` | `rgb(255 255 255 / .6)` | `rgb(255 255 255 / .08)` | 1 px inset edge |
| `--glass-blur` | `blur(20px) saturate(160%)` | same | |
| `--r-hero` / `--r-card` / `--r-group` / `--r-ic` | `24px` / `20px` / `16px` / `9px` | same | radii |
| `--sky-*` (8 stops) | unchanged | unchanged | weather scene (`scene.test.ts` reads them) |
| `--c1` / `--c2` / `--band` | unchanged | unchanged | chart pair |
| `--ease-out`, `--ease-sheet`, `--ease-in-out`, `--dur-press/fast/base/sheet` | unchanged | | motion |

Font: `--f-ui: -apple-system, "SF Pro Text", "Inter", system-ui, "Segoe UI", Roboto, sans-serif`; `--f-display`
is removed and every `var(--f-display)` in `app.css`, `shell.css` and `cards.css` becomes `var(--f-ui)` (Phase 1 lanes
do the same in their css). No `@font-face`, no Google Fonts link; the four `public/fonts/*.woff2` files are deleted.
Inter ships only if the phone has it (no download in Phase 0: ponytail, the system font is the spec).

Numbers: `font-variant-numeric: tabular-nums` stays on `.bt`.

### 2.2 Legacy aliases (kept so untouched screens still render; Phase 1 lanes delete their uses)

`--green2: #1E6B4E` (dark `#4FA37F`), `--soft: #E3EFE8` (dark `#15302A`), `--line: rgba(60,55,45,.16)` (dark
`rgba(255,255,255,.14)`), `--amber-ink: #8A4B06` (dark `#E8B04E`), `--red-soft` = `--tint-red`, `--ok: #1E6B4E`
(dark `#4FA37F`), `--warn: #8A4B06` (dark `#E8B04E`), `--warn-bg: color-mix(in srgb, var(--amber) 22%, var(--card))`
(exact text, `viewas.contrast.test.ts` greps it), `--link`/`--act` = `--green` value, `--fill: rgba(30,107,78,.10)`
(dark `rgba(79,163,127,.16)`), `--bg`/`--cell`/`--ink2`/`--sep`/`--btn-fg`/`--danger` as today, pointing at the new
values; `--c-medicine/-vitals/-labs/-weather/-safety/-family/-alert/-neutral` = green / blue-ink / purple-ink /
blue-ink / red-ink / amber-ink / red-ink / green; `--hue-blue`/`-ic` = tint-blue, `--hue-green` = tint-green,
`--hue-lilac` = tint-purple, `--hue-amber` = tint-amber, `--hue-terra` = tint-red; `--orange/--indigo/--teal/--purple`
= amber / purple-ink / teal-ink / purple-ink. In dark the `--hue-*` fills are the real dark tints (no more
`var(--card)` trick); `cards.css` drops the dark "no fill + 3 px top edge" rule.

## 3. Type, spacing, targets (`app.css`, `v13.css`)

| Role | px / weight / line | Class |
|---|---|---|
| Large title | 34 / 700 / 40, letter-spacing -0.02em | `.lt-title` (h1) |
| Kicker over a large title | 13 / 600 / 16, uppercase, 0.04em, `--muted` | `.lt-kicker` |
| Section title | 22 / 700 / 26 | `.sec-h h2` |
| Section link | 15 / 500, >= 44 px tall | `.sec-h a, .sec-h button` |
| Row title | 17 / 500 / 22 | `.rw-title` |
| Row sub | 13 / 400 / 18, `--muted` | `.rw-sub` |
| Row value | 15 / 400, `--muted`, right, nowrap | `.rw-value` |
| Tile kicker | 13 / 600 | `.pt-k` |
| Tile value | 26 / 700, -0.02em | `.pt-v` |
| Body | 17 / 400 / 1.4 | `.bt` |
| Button | 15 / 600, min-height 44, radius 999 | `.btn` (solid `--btn`, white), `.btn2` (`--green-tint`, `--green`) |
| Tab label | 12 / 600 | `.sh-tabs button > span` |

Spacing scale 4/8/12/16/24/32. Page gutter 16 px (12 px under `[data-narrow]`). Section header margin 28 px above,
10 px below. Grouped list rows min-height 56, padding 10 px 14 px, icon box 32x32 radius `--r-ic`, hairline from
58 px (`.grp.ic`) or 16 px. Cards radius `--r-card`, shadow `--shadow`, padding 16. Hero cards radius `--r-hero`.
Every tap target >= 44x44 (measured by `assertTargets`, section 8). `--tap: 44px` (was 48).

## 4. Component APIs (`src/features/look/`)

All exported from `src/features/look/index.ts`. Every component takes `testId?: string` and forwards it as
`data-testid`. Every control inside is a real `<a href>` or `<button type="button">`.

```ts
// LargeTitle.tsx: the page head. kicker (date, "SUMMARY", "CHECKED 6 MIN AGO") + 34 px h1 + right-side actions.
// back: pushed pages draw "‹ {back.label}" (44 px) on the left instead of the kicker's row position.
export function LargeTitle(p: {
  title: string; kicker?: string; back?: { href: string; label: string };
  actions?: ReactNode; // right side: avatar link, bell, place chip, "Me ▾" switcher; each >= 44 px
  testId?: string
}): JSX.Element
// renders <header class="lt" data-testid><div class="lt-row">{back|kicker}{actions}</div><h1 class="lt-title">{title}</h1></header>

// Section.tsx: a titled block. link draws a 44 px text link on the right; meta draws plain muted text instead.
export function Section(p: {
  title: string; link?: { href: string; label: string } | { onClick: () => void; label: string };
  meta?: string; children: ReactNode; testId?: string; id?: string
}): JSX.Element
// <section class="sec" aria-labelledby><div class="sec-h"><h2>…</h2>{link|meta}</div>{children}</section>

// GroupedList.tsx + Row.tsx: an inset grouped list of Rows. icons=true moves the hairline to 58 px.
export function GroupedList(p: { children: ReactNode; icons?: boolean; testId?: string; label?: string }): JSX.Element
// <div class="grp[ ic]" role="list" aria-label={label}>; each child Row is role="listitem"
export type Tint = 'blue' | 'red' | 'amber' | 'teal' | 'purple' | 'green' | 'none'
export function Row(p: {
  icon?: IconName; tint?: Tint; avatar?: ReactNode;   // leading 32 px box (tint fill + tint ink) or an avatar
  title: string; sub?: string; value?: string;         // value sits right, muted, nowrap
  badge?: string | number; badgeTint?: Tint;           // pill badge ("High", 3)
  href?: string; onClick?: () => void; control?: ReactNode; // chevron is drawn when href is set and no control
  testId?: string
}): JSX.Element
// Hue ('blue'|'green'|'lilac'|'amber'|'terra'|'none') stays exported for HeroCard/Tile/AlertCard until Phase 1 retires them; lilac→purple, terra→red in cards.css.

// PreviewTile.tsx: 2-column tile with a kicker, a big value, a sub line and a 44 px action label at the bottom.
export function PreviewTile(p: {
  kicker: string; tint: Tint; value: string; sub?: string; action: string; href: string;
  valueSize?: 'lg' | 'md'; // 26 px or 20 px ("Not connected")
  media?: ReactNode;        // optional thumbnail/chart above the value
  testId?: string
}): JSX.Element // whole tile is the <a>; min-height 150; class "card pt"

// Carousel.tsx: horizontal scroller that bleeds to the page edges (margin 0 -16px; -12px when narrow), scroll-snap, no scrollbar.
export function Carousel(p: { children: ReactNode; label: string; testId?: string; gap?: 12 | 16 }): JSX.Element
// <div class="carousel" role="group" aria-label>; children are the items (each sets its own width; 44 px targets inside)

// Segmented.tsx: 2–4 options, 44 px, radius 12, card-coloured thumb.
export function Segmented<T extends string>(p: {
  options: { id: T; label: string; href?: string }[]; value: T; onChange?: (id: T) => void; label: string; testId?: string
}): JSX.Element // <div role="group" aria-label class="segd">; items are <a aria-current="page"> when href, else <button aria-pressed>

// Sheet.tsx: bottom sheet. Grabber, swipe-down and button close, focus trap, Escape, dim tap, history entry (Back closes),
// one open at a time (opening a second one closes the first), reduced motion = no slide and no finger-follow.
export function Sheet(p: {
  title: string; onClose: () => void; children: ReactNode;
  hideTitle?: boolean;      // title stays as aria-label only (JackSheet draws its own head)
  focusTitle?: boolean;     // focus the h2 instead of the first control
  closeLabel?: string;      // default "Close"
  testId?: string
}): JSX.Element
// portal into .bt; markup: <div class="lk-sheet-wrap" data-closing><div class="lk-sheet" role="dialog" aria-modal="true" aria-label={title}>
//   <div class="lk-grab-zone"><div class="lk-grab"/></div>{!hideTitle && <div class="lk-sheet-h"><h2 tabIndex=-1>{title}</h2><button class="lk-x" aria-label={closeLabel}>…</button></div>}{children}
// Sheets use var(--glass-sheet) + blur (glass.css), radius 30px 30px 0 0, padding 8px 16px calc(28px + var(--sab)), max-height 90%.
// Drag maths: import { dragOffset, shouldDismiss, velocityOf } from '../family/sheetDrag' (unchanged file).

// MapCard.tsx: a map in a card. Static image (credit line) or live Leaflet via `render`; recentre button when `onRecentre` is given.
export function MapCard(p: {
  title?: string; height?: number;          // default 200
  image?: { src: string; alt: string };     // static board image (lanes W/S use docs/.../mockup/map-*.jpg copies in public/maps/)
  render?: (el: HTMLDivElement) => () => void; // live map mount, returns cleanup (lane M/S supply Leaflet)
  credit: string; href?: string;            // "Map: OpenStreetMap" / "Windy"; href opens the full map page
  onRecentre?: () => void; recentreLabel?: string; // 44 px round button, bottom right, default "Recentre"
  testId?: string
}): JSX.Element // class "card mapc"; the map layer is aria-hidden, the credit is visible text
```

Shell (`src/features/shell/`):

```ts
// TabBar.tsx: same props and ids as today (`active: Tab | null`, five slots, Family badge). Look: height 64, radius 32,
// --glass-bg + blur, --shadow-float, 12 px from the sides, bottom 14px + --sab; active = --green text + --fill pill;
// `aria-current="page"` on the active button. Class names stay `.tabbar.sh-tabs` so existing e2e selectors hold.
export function TabBar(p: { active: Tab | null }): JSX.Element

// JackFab.tsx: 62 px white disc with the Jack picture (JackArt 'head' 56), 3 px white border, --shadow-float,
// right 18px, bottom calc(var(--tabbar-h) + var(--tabbar-gap) + var(--sab) + 14px). A tap opens JackSheet. No hold, no
// context menu. Same visibility rules as today (hidden off tabs, in Simple mode, on own-header routes, under data-nofab).
// Coach mark text: "Help, scan or chat". Class stays `.sh-jackfab`; aria-label "Jack: help, scan, chat".
export function JackFab(p: { tab: Tab | null; hash: string }): JSX.Element | null

// JackSheet.tsx: the Jack sheet (board JackSheet). Uses look/Sheet with hideTitle (title "Jack").
export function JackSheet(p: { onClose: () => void; onSos: () => void; firstName: string }): JSX.Element
// Content, in order:
//  1. head: JackArt 56 + "Hi {firstName}, what do you need?" (22/700) + "Jack is always here, on every tab." + 44 px close (data-testid jack-close)
//  2. Help row (data-testid jack-sos): <SosHold onSend={onSos}/> inside <div class="jk-sos">; shell.css restyles .jk-sos .sos-simple-btn
//     into the red row (background --danger-bg, radius 20, min-height 84, label "Hold for help" 20/700 + sub "Hold 3 seconds. Calls your first family contact and texts your place." 15 on #FDE3DF).
//     Keyboard users get SosHold's existing confirm dialog.
//  3. "Cannot hold? Open Safety for Call 911 and Medical ID." with <a href="#safety"> (44 px) (data-testid jack-safety)
//  4. two tiles 150 px (data-testid jack-scan, jack-chat): Scan (tint blue, "Lab paper, prescription or ID") -> openScan();
//     Chat (tint green, "Ask or log anything") -> window.dispatchEvent(new Event(ASK_EVENT)). Both close the sheet first (history pop, then act).
//  5. "Upload a photo" text link (44 px, data-testid jack-upload) with the hidden <input type=file accept=image/*> from the old AskSheet -> openScanWithFile.
// The "Try saying" chips are NOT in Phase 0 (lane C, JackSheet chat entry, adds them with the assistant prefill).
```

## 5. Shell behaviour

- Today has no SOS block. `Today.tsx` drops `SosHold`, `SosScreen`, the `sos` state and `.td-sos`. Simple mode
  (`SimpleToday`) keeps its own hold (it has no Jack button). Safety keeps `SosButton` + `SosScreen`.
- SOS from the sheet: `JackFab` keeps `sos` state; `onSos` closes the sheet and renders
  `createPortal(<div className="sh-sosfull"><SosScreen onClose={() => setSos(false)} /></div>, .bt)`;
  `.sh-sosfull { position:absolute; inset:0; z-index:40; background:var(--ground); overflow:auto; display:flex; flex-direction:column }`.
  `SosScreen` already calls `setSosScreenOpen`, so scenes pause.
- Sub-pages get the status-bar inset: `src/styles/safearea.css` =
  `.bt:not(:has(.sh-top)) > .scroll { padding-top: calc(10px + var(--sat)); }` (imported after `narrow.css` in
  `main.tsx`). One rule covers every own-header route, whatever header component it uses.
- Location: `Loc.source` becomes `'gps' | 'last' | 'home'`; `Loc.at?: number` (ms) on `'last'`. `resolveLocation`
  stores every GPS success as kv `loc.last = { lat, lon, at }` and, when GPS is not available, returns the stored fix
  as `source: 'last'` before falling back to the home zone (`'home'`). `resolvePlace` treats `'last'` like `'gps'`
  for weather and zone and reports `source: 'last'`. Labels: `placeNameOf` -> "`<area>` · last known" for `'last'`;
  `alerts.ts placeLabel` -> "Last known · name"; `WeatherCard.whereOf` -> "`name` (last known, `<n> min|h|d` ago)" for
  `'last'` and "`Dampas` (first-run fallback, set your home in Settings)" only when no fix was ever stored.
- Health opens on Me: `useHealthData` exposes `memberReady` and never picks another person before the member is
  known (section 7 of the plan has the root cause). `Health.tsx` keeps `PersonChips` (Me first, selected); the "Me ▾"
  switcher sheet belongs to lane H.
- View-only hero: `BodyHero` gets `viewOnly?: { name: string; reason: string }`; when set it draws the name as the
  title with a "View only" badge (`data-testid bodyhero-viewonly`), the 7-day stats, and no `+ Reading` / `Scan`.

## 6. data-testids (Phase 1 lanes and e2e use these; never rename)

| Area | Test id | Element |
|---|---|---|
| shell | `tabbar` | `nav.tabbar` |
| shell | `tab-today`, `tab-health`, `tab-discover`, `tab-family`, `tab-safety` | each tab button |
| shell | `jack` | the Jack button (`.sh-jackfab`) |
| shell | `jack-sheet`, `jack-close`, `jack-sos`, `jack-safety`, `jack-scan`, `jack-chat`, `jack-upload` | Jack sheet parts |
| shell | `sos-full` | the SOS screen wrapper opened from the sheet |
| shell | `topbar` | `.sh-top` (unchanged) |
| look | `<testId>` passed through | every component above |
| look | `sheet` default when no testId | `.lk-sheet` |
| health | `bodyhero`, `bodyhero-viewonly`, `health-loading`, `insight`, `glance`, `nudge`, `browse` | unchanged + viewonly |
| health | `person-chips` | the `PersonChips` group |
| today | `weather-hero`, `alerts-off`, `warning-card`, `warning-card-storm`, `family-notice`, `selfcare` | unchanged |
| location | `place-last` | any element that says "last known" (lane T/W/S add it where the label shows) |

Hero rule for Phase 1: the first content block of every tab root carries `data-hero` (one per page). `assertHero`
(section 8) checks exactly one and that its top is within 320 px of the scroll top at 390x844.

## 7. Paths and routes

Hashes are unchanged (`routes.ts` untouched). New files:

```
src/features/look/LargeTitle.tsx  Section.tsx  GroupedList.tsx  PreviewTile.tsx  Carousel.tsx  Segmented.tsx  Sheet.tsx  MapCard.tsx
src/features/look/v13.css          (the classes in section 3 and 4; cards.css keeps HeroCard/Tile/AlertCard/Row)
src/features/look/contrastMath.ts  (parse, lum, ratio, over, tokensOf(theme) — shared by every contrast test)
src/features/look/v13.test.tsx     (component tests, section 8.1)
src/features/shell/JackSheet.tsx   JackSheet.test.tsx
src/features/records/useHealthData.test.tsx
src/styles/safearea.css
e2e/v13.ts  e2e/v13-foundation.spec.ts  e2e/jack-sheet.spec.ts
docs/redesign-2026-10-31/TESTING.md
```

Deleted: `src/features/shell/AskSheet.tsx`, `AskSheet.test.tsx`, `e2e/ask-sheet.spec.ts`, `public/fonts/*.woff2`.

## 8. Test policy (v13; replaces the v12 budgets and stylesheet-text tests)

Principle: tests measure rendered boxes and computed colours; they do not count pixels of page height and they do
not grep CSS text for a token name. A height budget encodes one layout; a hero-first order, 44 px targets and AA
contrast encode the design rule.

### 8.1 Vitest (jsdom)
- Component tests render the component and assert roles, names, targets and the forwarded `data-testid`
  (`look/v13.test.tsx`, `shell/JackSheet.test.tsx`).
- Token contrast (`look/contrast.test.ts`, rewritten by F0-A) uses `contrastMath.tokensOf('light'|'dark')` and
  asserts, per theme: `--ink` and `--muted` on `--ground`, `--card`, `--card2`, every `--tint-*`, `--green-tint`
  >= 4.5; every `--tint-*-ink` on its own `--tint-*` fill and on `--card` >= 4.5; `--green` on `--card`, `--ground`,
  `--green-tint` >= 4.5; white on `--btn` and `--danger-bg` >= 4.5; `--on-green` on `--green` >= 4.5; `--focus` on
  `--ground` and `--card` >= 3; `--ink` on `--glass-bg` over `--ground`, `--card`, `--tint-red`, `--green` >= 4.5
  (tab labels); `--muted` on `--glass-sheet` over 38% black over the same >= 4.5 (sheets); the dark media block
  equals the dark attribute block; 8 `--sky-*` stops; no `@font-face`, no `googleapis` in `app.css`.
- Feature stylesheet tests: a screen's contrast test imports `contrastMath` and asserts the pair it uses by
  token name (for example `ratio(t['--tint-amber-ink'], t['--tint-amber'])`), never by regexing its css for a
  `color:` line. `chipContrast.test.ts` and `viewas.contrast.test.ts` are rewritten that way by F0-D; `family-ui`
  and `weather/scene` tests already test logic and stay.

### 8.2 Playwright (`e2e/v13.ts`, F0-D)
`assertBudget` is deleted from `e2e/s16.ts` (and `s16-helpers.spec.ts` with it). Lanes call, at 390x844 light and dark:

```ts
assertHero(page)                  // exactly one [data-hero] in .bt .scroll; its top <= 320 px below the scroll top
assertOrder(page, testIds[])      // each listed id present and lower than the previous (the old order checks, kept)
assertTargets(page)               // every visible a/button/input/[role=button] inside .bt (not aria-hidden): box >= 44x44, or >= 44 tall and >= 88 wide (text links); failures listed by name
assertNoSideways(page)            // .bt .scroll scrollWidth <= clientWidth and no descendant box past the right edge (the no-sideways-scroll spec logic, callable per page)
assertTextContrast(page, min=4.5) // every visible text node inside .bt: computed color vs the nearest ancestor with an opaque background (walks up, composites rgba over the found colour); glass ancestors use their --glass-bg over --ground; skips nodes with aria-hidden or font-size 0; threshold 3 for large text per WCAG (font-size >= 24px, or >= 18.66px bold); failures listed with text, colours and ratio
assertJackClear(page)             // kept from s16.ts (selector .sh-jackfab)
assertNoWrappedButtons(page)      // kept from s16.ts (.btn, .btn2)
assertNarrow(page)                // set viewport 195x800, reload, assertNoSideways + assertTargets(min width relaxed to 44) + assertNoWrappedButtons
shotsLightDark(page, name)        // writes docs/redesign-2026-10-31/shots/<lane>/<name>-{light,dark}.png when V13_SHOTS=<dir>
```

Kept specs: `health-a11y.spec.ts` (axe), `no-sideways-scroll.spec.ts`, `tabbar-overlap.spec.ts`,
`subpage-header.spec.ts`, every functional spec. Rewritten by F0-D: `s16-today`, `s16-health`, `s16-family`,
`s16-discover`, `s16-settings`, `s16-onboarding`, `s16-motion` (budget lines -> `assertHero`/`assertTargets`/
`assertTextContrast`; the SOS-on-Today block removed), `s16-helpers` (tests the new helpers against a fixture page).

Gate 0 (orchestrator, integration branch): `npx tsc --noEmit` = 0; `npx vitest run` green; `PW_PORT=4430 npx
playwright test e2e/v13-foundation.spec.ts e2e/jack-sheet.spec.ts e2e/shell.spec.ts e2e/health-a11y.spec.ts
e2e/no-sideways-scroll.spec.ts e2e/tabbar-overlap.spec.ts e2e/subpage-header.spec.ts e2e/s16-*.spec.ts` green;
390x844 light and dark shots of Today, Health, Safety and the Jack sheet beside the boards; Opus review pass.
