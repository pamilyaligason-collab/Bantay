# Session 16 bug PR review (N-1..N-4, G-1)

Scope: `git diff origin/main...HEAD -- src e2e` (0cadb58, 5c7e000). Reviewer: Opus 5.5, read-only.

## Verdict: GO_WITH_FIXES

B-1 must land before merge: the N-1 change turns the hang into a 10 s error, but Health Connect still can never answer. The fix is one line. The rest is sound; M-1 needs one check on the phone before 2.6.1.

Gates run here:
- `npx tsc --noEmit -p .` exit 0.
- `npx vitest run` on bridge, useLocation, useDueMeds, weatherCard and WeatherScreen tests: exit 0, 5 files, 44 tests.
- Playwright `s16-narrow-text` was not run in this review.

## Findings

### B-1 BLOCKER: N-1 root cause is not fixed. The Health plugin proxy is thenable, so `plugin()` never resolves
- **Where:** `src/features/sensors/bridge.ts:21`, `const load = () => import('@capgo/capacitor-health').then((m) => m.Health)`
- **Why:** `registerPlugin` returns a Proxy that gives a method wrapper for **any** property, including `then` (`node_modules/@capacitor/core/dist/index.js:158-170`). Returning the proxy from a `.then` callback makes the Promise machinery call `Health.then(resolve, reject)`. That becomes a plugin call to `then`, which throws "not implemented" inside Capacitor's own promise, so `resolve` is never called and `loading` stays pending forever.
- **Proof:** a scratch script against the installed @capacitor/core 8.5.3 printed `typeof proxy.then = function` and `"Health.then()" is not implemented`. Returning the proxy from an async step hung for 2 s or more. The same proxy wrapped in an object resolved at once.
- **Effect:** this is the exact "Checking..." hang and the "Steps/Sleep taps do nothing" of N-1. With `within()`, every call (diagnose, isAvailable, granted, request, read) now fails after 10 s with "did not answer". Health Connect can never work on the phone. `read()` and `request()` have no timeout and still hang forever.
- **Why the tests pass:** `bridge.test.tsx` mocks `Health` as a plain object with no `then`, so the bug cannot show.
- **Fix:** never resolve a promise with the proxy. For example, `const load = () => import('@capgo/capacitor-health').then((m) => ({ h: m.Health }))` with `(await plugin()).h.isAvailable()` and so on. Or cache the module: `loading ??= import(...)`, then use `(await plugin()).Health`. Keep `within()` as the safety net.
- **Test to add:** make the mock's `Health` a `new Proxy({}, { get: (_, k) => k === 'then' ? () => new Promise(() => {}) : plug[k] })` and assert that `diagnose()` resolves with `available: true` with no timer advance.
- **Other places:** the two `@capacitor/geolocation` imports in `useLocation.ts:30` and `:43` return the method's promise, not the proxy, so they are fine. Grep found no other site that returns a plugin proxy.

### M-1 MAJOR: narrow.css may never apply on a real phone at 200% text (verification gap)
- **Where:** `src/styles/narrow.css:3`, `@media (max-width: 300px)`
- **Why:** the rule fires on the CSS viewport width.
  - Android's system font scale reaches the WebView as `textZoom`, which scales text but not the viewport, so a 390 px phone stays at 390 CSS px.
  - The app's own Extra large setting uses `zoom: 1.3` on `.scroll` (`app.css:129`), which does not change the viewport either.
  - In both cases the 300 px query is false, the multi-column grids stay, and 2x text can still break mid-word.
  - The 195 px e2e proves the CSS path, not that the phone takes it.
- **Fix:**
  1. On Lloyd's phone at 200% system text, run `innerWidth` and `matchMedia('(max-width: 300px)').matches` in the WebView inspector, and take a shot of #today and #weather.
  2. If the query is false, change the narrow rules to a container query on `main.scroll` (`container-type: inline-size`) with an em threshold, for example `@container (max-width: 19em)`. Container em scales with the font, so it tracks both textZoom and the app's zoom. Keep the e2e as is.

### m-1 minor: "Use my location" can silently do nothing
- **Where:** `src/features/weather/WeatherScreen.tsx:80`, `src/features/location/useLocation.ts:49`
- **Why:**
  - The button looks like nothing happened in three cases: Android reports `denied` (permanent denial after the second "Don't allow"), `checkPermissions` throws because location services are off (mapped to `denied`), or both reads time out. `ask()` returns the home fallback and the button keeps "Use my location".
  - There is no busy state for a wait of up to about 30 s (plugin 15 s, then WebView 15 s), and repeated taps start parallel resolves.
- **Fix:** disable the button and show "Finding you..." while `ask()` runs. On a non-gps result, show one line: "Location is off or blocked for Bantay. Turn it on in phone Settings." Optionally pass a shorter timeout to the plugin when `ask` is true.

### m-2 minor: "(saved zone)" flashes while GPS is still pending
- **Where:** `src/features/today/WeatherCard.tsx:18`
- **Why:** `usePlaceFrom` returns `source: 'zone'` while `useLocation` is still `pending`, so a phone with GPS granted shows "Dampas (saved zone)" for up to 15 s and then the real place.
- **Fix:** pass the location state through, and add the suffix only when `l.source === 'home'`, not `'pending'`. Or accept the flash and record that in 02-DECISIONS.
- **Nit:** `whereOf` is declared between two `import` lines (lines 16-18). Move it below the imports.

### m-3 minor: the e2e detector misses a word broken in a multi-word text node
- **Where:** `e2e/s16-narrow-text.auth.spec.ts:45-50`
- **Why:** the detector flags a node only when its line count is higher than its word count. A node of 5 words where one long word breaks across 2 lines draws 5 lines or fewer and passes. N-4 was exactly that kind of break.
- **Fix:** test each word. Use one Range per word (offsets from a regex over `nodeValue`), and flag any word whose `getClientRects()` give 2 or more distinct `top` values.
- **Also:** `waitForTimeout(600)` per route (line 81) can let a lazy screen render after the check, which is a false pass. Wait for the route's `h1` or `main.scroll > *` to be visible instead.

### m-4 minor: the N-3 test proves the negative weakly
- **Where:** `src/features/today/useDueMeds.test.tsx:27-28`
- **Why:**
  - A fixed 50 ms sleep followed by a negative assertion passes even if the live query has not fired yet.
  - `soon()` follows the real clock (ML-38). Between 23:30 and 23:59 local the dose lands on the next day, and the first `waitFor(['me'])` depends on the midnight edge logic. This was not introduced here, but the touched test keeps it.
- **Fix:**
  1. Freeze time with `vi.useFakeTimers({ now: new Date('2026-10-30T09:00:00+08:00'), toFake: ['Date'] })`.
  2. Seed `hdb.people` with `ma` **before** rendering, so the dependant is known from the start.
  3. Assert `['me']` inside `waitFor`, after also asserting that `known` was loaded. For example, check that `review` counts only my review medicine when both people have one.

### m-5 minor: Weather "Use my location" and the plugin fallback have no tests
- **Where:** `src/features/weather/WeatherScreen.test.tsx`, `src/features/location/useLocation.test.ts`
- **Fix:** add these tests:
  - A click that resolves `gps` selects `me`, and a click that resolves `home` leaves `h1` selected.
  - In useLocation, the plugin rejects and the WebView succeeds, giving `source: 'gps'` through the WebView.

### n-1 nit: redundant check in useDueMeds
- **Where:** `src/features/today/useDueMeds.ts:41`
- **Why:** `canMarkFor(p.id, selfId, writable)` is always true once `p.id === selfId` and the id is not empty. `targets` could be `people.filter((p) => p.isMe)`, and `useWritableIds` and `getMember` are now unused for targeting. Leave them if View as (N-7) will bring dependants back.

## Checked, no finding
- **within() and the cached plugin promise:** once B-1 is fixed, the import resolves and the `loading` cache is fine. A pending import gives a 10 s error on every call, not one stuck call. `requestAuthorization` is correctly left without a timeout, because the user may take longer than 10 s in the permission screen.
- **getCurrentPosition options:** `{ enableHighAccuracy, maximumAge, timeout }` matches `PositionOptions` in @capacitor/geolocation 8.2.3. On Android the plugin asks for the permission itself, which is right for `ask=true` with `os='prompt'`. With `ask=false` it is only reached when `os === 'granted'`.
- **useDueMeds consequences:**
  - `review` now counts only my medicines: the WeatherCard "check" count and the SimpleToday pick follow D-94.
  - `markTaken` and `markDue` still accept any person, as the Health and Family pillboxes need.
  - `nextDoses` has no other caller.
  - Reminders and notifications do not read `useDueMeds`, so dependants' reminders are not affected (by design, D-94).
- **narrow.css above 300 px:** everything except `.nw` sits inside the 300 px query. `.nw` is a new class used only in Learn. Nothing in the file sets colour, so dark theme is unaffected.
- **The :root specificity trick:** `:root .x` scores (0,2,0). It beats single-class screen rules. It ties with two-class rules, where a lazily loaded screen sheet wins by source order. No state rules (`:hover`, `[aria-pressed]`, `.holding`) are overridden.
- **The wx-days 5-column remap:** it places b, glyph, lo, hi and rp in row 1 and the range on its own row. Correct.
- **today.css `.td-act-box` wrap at 375 px:** the icon, a 9em text block and the 56 px Jack fit in one row at 375 px. With the app's Extra large setting, the Jack may drop to its own row, aligned right, which is acceptable.
- **Tap targets:** the `.wx-seg` buttons keep `min-height: 48px`, and the SOS button is still at least 171 px at 195 px. No target falls below 48 px.
