# S28 contract (approved by the owner 2026-11-09)

Base: the commit that adds this file (on `claude/loving-chatelet-2eb933`, from main 4c403eda). Decisions D-176..D-179 (vault 02-DECISIONS), earlier rules D-160..D-175 still hold. Audit evidence is quoted in each lane brief.

## Shared rules
- Repo is PUBLIC: no personal names, places of real people, secrets or real health values in code, fixtures, tests or screenshots.
- Senior type floor: body >= 17 px, meta/caption >= 15 px, values >= 22 px, targets >= 44 px, contrast >= 4.5:1 (3:1 for 24 px+). No glyph icons: use the house `<Icon name="..." />`.
- D-50: nothing above a live warning on Today. D-109/D-173: other people's events and health details stay masked exactly as today.
- B-7: no health values in notifications or logs. Health wording plain and cautious, 911 first; any new health text is flagged `clinical: true` in the lane result for an Opus clinical check.
- Motion: existing `--dur-*` / `--ease-out` only, stopped under `prefers-reduced-motion`.
- Tests: `npx vitest run --maxWorkers=1 <related test files>` while building; `npx tsc --noEmit -p .` once at the end. Never run the full suite (the orchestrator does). Never run `npm ci`/`npm install`: if `node_modules` is missing, make a junction `cmd /c mklink /J node_modules D:\Claude\Bantay\node_modules` (lock file is identical).
- Playwright only if your lane says so, with `PW_PORT` = your lane port.

## Design tokens (L0 adds them; every lane uses them now, with the px fallback, e.g. `var(--fs-meta, 15px)`)
In `src/styles/tokens.css` (light, dark and prefers-color-scheme blocks):
- Type: `--fs-display: 30px` (screen hero number), `--fs-value: 24px`, `--fs-title: 20px` (card title), `--fs-body: 17px`, `--fs-meta: 15px` (kicker, caption, chip). Weights: title 700, value 700, body 400, meta 600. Line height: `--lh-tight: 1.2`, `--lh-body: 1.45`.
- Space: `--sp-1: 4px`, `--sp-2: 8px`, `--sp-3: 12px`, `--sp-4: 16px`, `--sp-5: 24px`, `--sp-6: 32px`. Card padding `--card-pad: 16px`; gap between cards `--card-gap: 12px`.
- Depth (existing, unchanged names): `--shadow` rest card, `--shadow-raised` tappable card, `--shadow-hero` one per screen, `--shadow-press` on `:active`. `--depth-card` moves from `look/v13.css` into tokens.css.
- Card tints: `--tint-<hue>` and `--tint-<hue>-ink` for hue in {teal, green, amber, rose, blue, violet, slate}, light and dark, each pair >= 4.5:1. Existing `data-hue` in `look/cards.css` maps to them.
In `src/features/look/cards.css` (L0): `.cd-kicker` (meta, uppercase off, 600), `.cd-title` (title), `.cd-meta` (meta, muted ink), `.cd-value` (value), `.card.tap` (raised + press), `.card.tint` (uses `data-hue`). Lanes put these classes on their own markup; they do not edit cards.css.

## Lane ownership (no lane edits another lane's files; anything else you need goes in `needs`)
| Lane | Port | Owns |
|---|---|---|
| L0 tokens | 4380 | `src/styles/tokens.css`, `src/styles/app.css` (base `.card` only), `src/features/look/**` EXCEPT `look/media/**`, a token test |
| A Today + lock | 4381 | `src/screens/Today.tsx`, `src/features/today/**`, `src/features/weather/**`, `src/features/location/placeWords.ts` (+ new place lookup files under `src/features/location/`), `src/features/safety/Pagasa*`, `src/features/safety/pagasa*`, `src/features/auth/FingerGate.tsx`, `src/features/auth/lock.css`, `src/features/calm/CrisisCard.tsx`, the `--talk-*` block of `src/features/calm/calm.css`, `src/features/garden/**` |
| B Listen/radio | 4382 | `src/features/discover/listen/**`, `src/features/calm/MediaLinks.tsx`, `src/features/calm/useRadio.ts`, `src/features/calm/media.ts`, `src/data/calm/**` (styles go in `discover/listen/radio.css`, never calm.css) |
| C1 Health UI | 4383 | `src/screens/Health.tsx`, `src/features/health/**` EXCEPT `library/**`, `ForYou.tsx`, `labGlossary.ts` |
| C2 Library/explainer/outbox | 4384 | `src/features/health/library/**`, `src/features/health/ForYou.tsx`, `src/features/health/labGlossary.ts`, `src/features/sync/**`, `src/db.ts`, `src/App.tsx` (one hook line for library auto-download) |
| D Discover | 4385 | `src/features/discover/**` EXCEPT `listen/**`, new `src/features/look/media/**`, `src/features/admin/events.ts`, `supabase/migrations/0060_*` |
| E Family | 4386 | `src/screens/Family.tsx`, `src/features/family/**`, `supabase/migrations/0061_*` |
| F Jack | 4387 | `supabase/functions/ask/**`, `src/features/assistant/**`, `docs/ASSISTANT.md`, `supabase/migrations/0062_*` |

`src/data/migrations.json` is NOT touched (added after the owner applies each migration). Every migration has a `.down.sql`, RLS on, grants least privilege.

## Cross-lane names
- Radio (B): `src/features/discover/listen/stations.ts` exports `STATIONS` with a new `section: 'music' | 'pop' | 'news'` field and `SECTIONS` labels "Music & Light Rock", "Pop & Mass", "News & Talk" (D-178). Route `#discover/listen/radio` stays. The Calm "Relaxing radio" row (A, `CalmCard.tsx`) links to `#discover/listen/radio`.
- Talk card (A): `TalkCard` from `src/features/calm/CrisisCard.tsx` is also rendered at the bottom of `SimpleToday` above "Exit simple mode" (D-179).
- Usage events (D): new action names `watch_ch_<key>` for each channel key in the regional/farm channel lists, added to the client list in `events.ts` and to the server allowlist function in 0060. 0060 also adds `public.family_watch_counts()` (security definer, `search_path = ''`, caller's family only, last 30 days, returns `name, n`, listing a channel only when at least 3 distinct family users tapped it, D-182). Discover calls it; when it fails or returns nothing, the order falls back to the phone's own `dc.watchcounts`.
- Messenger (E): 0061 adds `people.messenger text` (handle only, `^[A-Za-z0-9.]{5,50}$` check), editable by the person and admins under the same column grant and policy as `phone` (0010). `roster.ts` reads it; `messengerHref()` stays.
- Jack spend (F): 0062 adds `public.assistant_spend(month date, usd numeric)` written only by the service role from the `ask` function; the router steps down to the fast model at 70% of `ASSISTANT_MONTHLY_CAP_USD` (secret, default 10) and to fast-only plus 300 max tokens at 90% (D-177).

## Media card (D-180) - lane D builds `src/features/look/media/MediaCard.tsx` (+ css, test); C1 and B adopt it after merge
Sources (read 2026-11-09): NN/g "Cards: UI-component definition" (https://www.nngroup.com/articles/cards-component/), NN/g "Usability for senior citizens", WCAG 2.2 target size, NN/g/Yale carousel findings, YouTube Android full-width thumbnails (9to5google 2018). Material 3 / Apple HIG pages were not machine-readable; their numbers are not relied on.
- Separation comes from common region: each video card is its own surface (`--card`) on the page background with `--shadow` (tappable: `--shadow-raised`, `--shadow-press` on `:active`); never a border AND a shadow together; `--card-gap` (12 px) between cards, `--sp-5` (24 px) above each section. No card inside another card: a section that holds video cards is NOT itself a card.
- Section header: `.cd-title` left, optional "See all" link right (>= 44 px target), `--sp-2` below the header.
- Variants: `hero` (one per section max: 16:9 thumbnail full-bleed to the card's top edge, inherits `--r-card` top corners, text block below with `--card-pad`); `row` (16:9 thumbnail 128 px wide on the left, text right, min-height 88 px); `half` only for 2-up where width >= 360 px, else falls back to row. One column on phones; no horizontal swipe rows (D-156: 4 cards + Show more); nothing auto-rotates.
- Thumbnail: 16:9 (`aspect-ratio: 16/9; object-fit: cover`), lazy-loaded, decoded async, a neutral `--tint-slate` placeholder of the same size so nothing jumps. Duration badge bottom-right on a dark scrim, >= 15 px, white text >= 4.5:1. Play affordance: house `<Icon name="play" />` in a 56 px translucent circle centred on hero thumbnails.
- Text: title `.cd-title` at 17-20 px, max 2 lines then ellipsis (`-webkit-line-clamp: 2`); channel + age in `.cd-meta` (15 px) on one line; optional tag chip only when it adds meaning.
- The whole card is one link/button: accessible name "Video, <title>, <channel>, <length>", visible 2 px focus ring, focus moves to the player on open (S26 rule).

## Jack clearance (added in S28 merge)
`--jack-clear: 72px` (tokens.css, all three blocks): right padding that keeps header links and the last tappable column clear of the floating Jack button. Any lane whose layout puts a control in the bottom-right 72 x 72 px of the viewport uses it; e2e Jack-overlap allowances are never widened to make a gate pass.
