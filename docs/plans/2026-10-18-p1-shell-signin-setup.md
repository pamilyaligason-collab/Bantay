# P1 Shell, Look, Sign-in, Setup Implementation Plan

**Goal:** Ship the v2 app shell in the D-29 look with the v6 sign-in, setup wizard and location rules, so a fresh APK goes install -> name -> PIN -> fingerprint -> wizard -> Today on Lloyd's phone.

**Architecture:** Keep Vite + React 19 + hash routes. Replace the iOS-glass tokens with the cream/green/amber token set from mockup v6 and self-hosted Fraunces + Plus Jakarta Sans. The shell (App.tsx) gets the 5-slot tab bar with the raised Ask button, a top bar with avatar (Me) and bell (inbox). Sign-in keeps the Supabase PIN Edge Function and adds error/lockout/forgot states; the APK unlocks a stored session with a native BiometricPrompt plugin; Google sign-in for admins comes from branch claude/jovial-wescoff-31c410. A pure `resolvePlace()` replaces every Dampas default. The wizard is data-driven: each step has an async `isDone()` probe, so satisfied steps are skipped and the rest become the Today checklist.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Dexie 4, Supabase JS 2.118, Capacitor 8.5.3 (Android, Java plugins), @capacitor/local-notifications 8.x (new), Vitest 5 + Testing Library, Playwright 1.64.

**Sources of truth:** mockup v6 https://claude.ai/artifact/J7XtGYsA1VS5r1guDNAZCp (vault: mockups/bantay-v2-mockup-src.html), vault 02-DECISIONS D-29..D-52, research/session-4-audit.md, research/session-4-install-update.md. Screen ids below (`data-id="..."`) refer to that mockup.

**Gates for every lane:** `npx tsc --noEmit` 0; `npm test` all green; `npm run e2e` all green; screenshots at 390x844 light AND dark of every touched screen reviewed by the orchestrator BEFORE merge (tests alone passed on clipped screens before). No sideways scroll (existing e2e/no-sideways-scroll.spec.ts must stay green). Health values never in notifications (B-7).

---

## Lanes (independent, run in parallel after Task 1)

| Lane | Tasks | Files (exclusive) |
|---|---|---|
| A Look | 1 | src/styles/tokens.css, src/styles/app.css, src/styles/glass.css, public/fonts/*, src/features/look/contrast.test.ts |
| B Shell | 2, 3 | src/App.tsx, src/features/shell/* (new), src/screens/Me.tsx (new), e2e/shell.spec.ts |
| C Sign-in | 4, 5, 6 | src/screens/SignIn.tsx, src/features/auth/*, android/.../BiometricPlugin.java (new), e2e/auth.spec.ts |
| D Setup | 7, 8 | src/screens/Onboarding.tsx -> src/features/setup/* (new), android/.../SettingsOpenerPlugin.java, e2e/onboarding.spec.ts |
| E Location + Safety | 9, 10 | src/features/location/*, src/features/safety/alerts.ts (one line), src/screens/Safety.tsx, src/features/safety/PhoneWarnings.tsx |

Task 1 lands first (tokens are shared). MainActivity.java is touched by C and D (one `registerPlugin` line each): the orchestrator resolves that merge.

---

### Task 1: Tokens and fonts (Lane A)

**Files:**
- Modify: `src/styles/tokens.css`, `src/styles/app.css`, `src/styles/glass.css`
- Create: `public/fonts/fraunces-600.woff2`, `public/fonts/jakarta-400.woff2`, `public/fonts/jakarta-600.woff2`, `public/fonts/jakarta-700.woff2` (download from the Google Fonts repo, OFL; add to docs/ASSETS.md with licence line)
- Test: `src/features/look/contrast.test.ts`

- [ ] **Step 1: Write the failing contrast test** (extends the existing file; it already parses tokens.css)

```ts
// src/features/look/contrast.test.ts (add)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { ratio, tokens } from './contrastUtil' // existing helpers in this file's module; if inline, keep inline

const css = readFileSync('src/styles/tokens.css', 'utf8')
describe('v2 palette (D-29)', () => {
  for (const mode of ['light', 'dark'] as const) {
    const t = tokens(css, mode)
    it(`${mode}: ink on ground >= 4.5`, () => expect(ratio(t['--ink'], t['--ground'])).toBeGreaterThanOrEqual(4.5))
    it(`${mode}: muted on card >= 4.5`, () => expect(ratio(t['--muted'], t['--card'])).toBeGreaterThanOrEqual(4.5))
    it(`${mode}: on-green on green >= 4.5`, () => expect(ratio(t['--on-green'], t['--green'])).toBeGreaterThanOrEqual(4.5))
    it(`${mode}: red on card >= 4.5`, () => expect(ratio(t['--red'], t['--card'])).toBeGreaterThanOrEqual(4.5))
  }
})
```

- [ ] **Step 2:** Run `npx vitest run src/features/look/contrast.test.ts` -> FAIL (tokens `--ground`, `--green` missing).
- [ ] **Step 3: Replace tokens.css** with the mockup v6 token block verbatim (light `:root`, `@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){...}}`, `:root[data-theme="dark"]{...}`): `--ground #F6F1E7, --card #FFFCF6, --card2 #EFE8DA, --green #1F3D2B, --green2 #2E5A3F, --soft #DCE5D8, --amber #E8A93A, --amber-ink #7A4E05, --ink #1D1F1C, --muted #5E625B, --line #E4DCCB, --on-green #F6F1E7, --red #C2362B, --red-soft #F7DEDA, --ok #2E7D4F, --warn #B7791F` and the dark values from the mockup. Keep the old token names as aliases so untouched screens still render: `--bg: var(--ground); --cell: var(--card); --ink2: var(--muted); --sep: var(--line); --act: var(--green2); --btn: var(--green); --btn-fg: var(--on-green); --danger: var(--red); --danger-bg: var(--red-soft); --warn-bg: color-mix(in srgb, var(--amber) 22%, var(--card))`.
- [ ] **Step 4: Fonts.** Add to app.css:

```css
@font-face{font-family:"Fraunces";src:url(/fonts/fraunces-600.woff2) format("woff2");font-weight:600;font-display:swap}
@font-face{font-family:"Plus Jakarta Sans";src:url(/fonts/jakarta-400.woff2) format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"Plus Jakarta Sans";src:url(/fonts/jakarta-600.woff2) format("woff2");font-weight:600;font-display:swap}
@font-face{font-family:"Plus Jakarta Sans";src:url(/fonts/jakarta-700.woff2) format("woff2");font-weight:700;font-display:swap}
:root{--f-display:"Fraunces",Georgia,serif;--f-ui:"Plus Jakarta Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
body{font-family:var(--f-ui);font-size:16px;background:var(--ground);color:var(--ink)}
h1,.h-display{font-family:var(--f-display);font-weight:600;letter-spacing:-.015em;text-wrap:balance}
```
  Port the mockup component classes used by Tasks 2-8 into app.css: `.card .pill(.primary/.ghost/.amber/.light/.block) .chip .tile .list .seg .switch .chk .sheet .grab .toast .sec-h .sub .eyebrow .dl`. glass.css: drop the frosted tab bar; keep the `--sky-*` tokens (weather backgrounds in P3).
- [ ] **Step 5:** Run contrast test -> PASS. Run `npm test` and `npm run e2e` -> green (look.spec may need the new background colour in its expectation; update the expected value to `rgb(246, 241, 231)`).
- [ ] **Step 6:** Screenshots 390x844 light + dark of Today, Health, Family, Safety (unchanged layouts, new colours) -> orchestrator review.
- [ ] **Step 7: Commit** `git add src/styles public/fonts docs/ASSETS.md src/features/look e2e/look.spec.ts && git commit -m "look: v2 tokens (D-29) and self-hosted Fraunces + Plus Jakarta Sans"`

---

### Task 2: Shell - tab bar, top bar, routes (Lane B)

**Files:**
- Create: `src/features/shell/routes.ts`, `src/features/shell/routes.test.ts`, `src/features/shell/TopBar.tsx`, `src/features/shell/TabBar.tsx`
- Modify: `src/App.tsx`
- Test: `e2e/shell.spec.ts`

- [ ] **Step 1: Failing route test**

```ts
// src/features/shell/routes.test.ts
import { describe, expect, it } from 'vitest'
import { parseHash, familyEntry } from './routes'

describe('parseHash', () => {
  it('defaults to today', () => expect(parseHash('')).toEqual({ tab: 'today', view: null }))
  it('maps #records to family/records', () => expect(parseHash('#records')).toEqual({ tab: 'family', view: 'records' }))
  it('keeps #me and #notif as views without a tab', () => {
    expect(parseHash('#me')).toEqual({ tab: null, view: 'me' })
    expect(parseHash('#notif')).toEqual({ tab: null, view: 'notif' })
  })
  it('unknown hash falls back to today', () => expect(parseHash('#nope')).toEqual({ tab: 'today', view: null }))
})
describe('familyEntry (D-44)', () => {
  it('opens People during an alert or SOS', () => expect(familyEntry({ alertActive: true, last: 'records' })).toBe('people'))
  it('else reopens the last segment', () => expect(familyEntry({ alertActive: false, last: 'plan' })).toBe('plan'))
  it('first time opens Records', () => expect(familyEntry({ alertActive: false, last: null })).toBe('records'))
})
```

- [ ] **Step 2:** `npx vitest run src/features/shell/routes.test.ts` -> FAIL (module missing).
- [ ] **Step 3: Implement**

```ts
// src/features/shell/routes.ts
export type Tab = 'today' | 'health' | 'family' | 'safety'
export type FamilySeg = 'records' | 'plan' | 'people'
export const TABS: Tab[] = ['today', 'health', 'family', 'safety']
const VIEWS = new Set(['me', 'notif', 'admin'])

export function parseHash(h: string): { tab: Tab | null; view: string | null } {
  const k = h.replace(/^#/, '')
  if (k === 'records' || k === 'plan' || k === 'people') return { tab: 'family', view: k }
  if (VIEWS.has(k)) return { tab: null, view: k }
  return { tab: (TABS as string[]).includes(k) ? (k as Tab) : 'today', view: null }
}

export function familyEntry(o: { alertActive: boolean; last: FamilySeg | null }): FamilySeg {
  if (o.alertActive) return 'people'
  return o.last ?? 'records'
}
```
- [ ] **Step 4:** Test -> PASS.
- [ ] **Step 5: TabBar + TopBar.** `TabBar.tsx` renders 5 buttons in the mockup order Today, Health, [Ask raised centre, opens Ask with `window.dispatchEvent(new Event(ASK_EVENT))` until Ask becomes a tab in P6], Family, Safety; `aria-current="page"` on the active one; 72 px bar, 28 px radius, `var(--card)` fill, the Ask bubble 62 px `var(--green)` with `0 0 0 5px var(--ground), 0 0 0 7px var(--amber)` ring (mockup `.tabbar`). `TopBar.tsx` = avatar button (photo or initial, 44 px, `href="#me"`), greeting + place line (`Sunday, 18 Oct · Tagbilaran` from Task 9's `usePlace()`; until Task 9 merges, show the date only), bell button `href="#notif"` with an amber dot when unread > 0, and `<SyncStatus/>` moved into the offline banner slot (D-51 banner itself ships in P3; keep SyncStatus visible). Admin link leaves the top bar (moves to Me).
- [ ] **Step 6: App.tsx** uses `parseHash`; `view === 'me'` renders `<Me/>` (Task 3), `view === 'notif'` renders a placeholder list "No notifications yet" (inbox ships in P3), `view === 'admin'` keeps AdminScreen for admins. Keep swipe, pull-to-refresh, focus on swipe, `useTrackScreen` names (`me`, `notif` added to the usage allowlist in src/features/admin/events.ts and its test).
- [ ] **Step 7: e2e** add to `e2e/shell.spec.ts`:

```ts
test('tab bar has five slots with Ask raised in the middle', async ({ page }) => {
  await page.goto('/#today')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('button')).toHaveCount(5)
  const ask = nav.getByRole('button', { name: 'Ask Bantay' })
  const box = await ask.boundingBox(); const today = await nav.getByRole('button', { name: 'Today' }).boundingBox()
  expect(box!.y).toBeLessThan(today!.y) // raised
})
test('avatar opens Me and bell opens notifications', async ({ page }) => {
  await page.goto('/#today')
  await page.getByRole('link', { name: /Me and settings/ }).click()
  await expect(page).toHaveURL(/#me$/)
  await page.goto('/#today')
  await page.getByRole('link', { name: /Notifications/ }).click()
  await expect(page).toHaveURL(/#notif$/)
})
```
- [ ] **Step 8:** `npm test && npm run e2e` -> green. Screenshots Today/Me light+dark -> review.
- [ ] **Step 9: Commit** `git commit -m "shell: v2 tab bar with raised Ask, top bar avatar + bell, hash routes (D-44)"`

---

### Task 3: Me screen (Lane B)

**Files:** Create `src/screens/Me.tsx`, `src/screens/Me.test.tsx`; move `src/features/auth/PhoneSettings.tsx` content into Me (Family stops rendering it).

Matches mockup `data-id="me"`: profile card (photo/initial, name, "This phone · fingerprint on|off", Edit -> P3), **Family can see my** (readings, medicines, records, mood, live location; all default OFF per D-34; stored in kv `share.<key>` now, synced in P5), Simple mode switch (kv `mode.simple`), Quiet hours row, Theme picker (System/Light/Dark -> `document.documentElement.dataset.theme`, kv `look.theme`), **Who gets your SOS text** row (opens a sheet listing family members, pick up to 2, kv `sos.contacts`; D-34, A-23), "App 2.0.0 · Screens 18 Oct" + Check for updates (P2 wires it; P1 shows the version from `import.meta.env.VITE_APP_VERSION` and the build date), Admin row (admins only), Switch person, Forget this phone, Print my cards (P5), Privacy.

- [ ] **Step 1: Failing test**

```tsx
// src/screens/Me.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import Me from './Me'

describe('Me', () => {
  it('sharing toggles start off (D-34)', async () => {
    render(<Me />)
    for (const n of ['Share readings', 'Share medicines', 'Share records', 'Share mood', 'Share live location'])
      expect(await screen.findByRole('switch', { name: n })).toHaveAttribute('aria-checked', 'false')
  })
  it('SOS text contacts allow at most two', async () => {
    render(<Me />)
    await userEvent.click(await screen.findByRole('button', { name: /Who gets your SOS text/ }))
    const boxes = await screen.findAllByRole('checkbox')
    await userEvent.click(boxes[0]); await userEvent.click(boxes[1]); await userEvent.click(boxes[2])
    expect(boxes.filter((b) => b.getAttribute('aria-checked') === 'true')).toHaveLength(2)
  })
})
```
  (Add `@testing-library/user-event` to devDependencies if absent.)
- [ ] **Step 2:** run -> FAIL. **Step 3:** implement Me.tsx with the rows above (Dexie kv reads via existing `db.kv`). **Step 4:** run -> PASS. **Step 5:** screenshots light+dark. **Step 6: Commit** `git commit -m "me: profile, sharing toggles off by default, SOS contacts, theme, phone settings"`

---

### Task 4: Merge Google sign-in for admins (Lane C)

**Files:** branch `claude/jovial-wescoff-31c410` (13 files: nativeOAuth.ts + test, pinLogin.ts, urlError.ts, family.ts, SignIn.tsx, main.tsx, capacitor/android gradle + manifest, package.json).

- [ ] **Step 1:** In the lane worktree: `git merge --no-ff claude/jovial-wescoff-31c410 -m "merge: Google sign-in in the APK for admins (D-32)"`. Resolve conflicts in favour of main for styling; keep nativeOAuth.ts as is.
- [ ] **Step 2:** `npm ci && npx tsc --noEmit && npm test` -> green (branch had vitest 383/383 at 6ca9d61).
- [ ] **Step 3:** Hide the Google button for non-admin flows: it shows only behind "Admin? Continue with Google" (mockup `welcome`), and the waiting screen `gwait` ("Finishing sign-in in Chrome...", buttons "I'm back" / "Try again", error text from urlError) renders while `signInWithGoogle()` is pending; `onNativeSignInError` (nativeOAuth.ts) feeds the error line. Test:

```tsx
// src/screens/SignIn.test.tsx (add)
it('shows the Chrome waiting screen while Google sign-in is pending', async () => {
  vi.mocked(signInWithGoogle).mockReturnValue(new Promise(() => {})) // pinLogin.ts on the merged branch
  render(<SignIn />)
  await userEvent.click(screen.getByRole('button', { name: /Admin\? Continue with Google/ }))
  expect(await screen.findByText(/Finishing sign-in in Chrome/)).toBeVisible()
  expect(screen.getByRole('button', { name: "I'm back" })).toBeVisible()
})
```
- [ ] **Step 4:** Lloyd step (orchestrator hands him the block at merge time): add `ph.bantay.family://auth-callback` to Supabase Auth Redirect URLs.
- [ ] **Step 5: Commit.**

---

### Task 5: PIN errors, lockout, forgot PIN, name list (Lane C)

**Files:** Modify `src/screens/SignIn.tsx`, `src/features/auth/pinLogin.ts`; Test `src/screens/SignIn.test.tsx`, `e2e/auth.spec.ts`. Server already locks 5 wrong PINs for 15 min (D-17, supabase/functions/_shared/pin.ts).

Behaviour (mockup `welcome`, `pin`, `pin-locked`, `askadmin`; D-41 proposed: list of first names on a fresh install).
**Security constraint:** `supabase/functions/_shared/login.ts` returns the SAME body for wrong PIN, unknown handle, lock and IP limit so handles cannot be enumerated. Do NOT add `tries_left` or `locked_until` to the server reply. The phone keeps its own count instead:
- kv `pin.fail.<handle>` = `{ n, firstAt }`; each failed reply adds one; success clears it.
- n < 5 -> "That PIN did not work. N tries left before a 15-minute lock." with a dot shake (off under reduced motion).
- n >= 5 -> locked screen "Locked until HH:MM, or ask an admin" (firstAt-window end = last failure + 15 min); the pad is disabled until then. The server enforces the real lock either way.
- "Forgot PIN? Ask an admin" -> `askadmin` screen: names the admins (family list), Call buttons (`tel:` link), "Send a request" calls RPC `request_pin_reset(handle)` (new SQL function inserting into `admin_requests`; migration `supabase/migrations/0009_pin_reset_requests.sql`, callable by anon with its own per-IP limit through `pin_try` and the same reply whether or not the handle exists, admin-select RLS; rehearsal test in supabase/tests/rls_rehearsal.sql). The migration number is 0009 because the records lane owns 0008. Admin > Members gets "Reset PIN" (exists) and "Unlock" (admin-members function: new `unlock` action that calls `clearKey` for that user).
- "Not on the list? Ask an admin to add you." (two admins, A-18).
- "Emergency call 911" link (`tel:911`) on every sign-in screen (A-13).
- Network failure -> "No signal. Try again when you have data." (A-13).

- [ ] **Step 1: Failing tests**

```ts
// src/features/auth/pinAttempts.test.ts (new)
import { describe, expect, it } from 'vitest'
import { afterFailure, pinState } from './pinAttempts'
const T0 = Date.parse('2026-10-18T06:00:00Z')
describe('pin attempts kept on the phone', () => {
  it('counts down tries', () => {
    let s = afterFailure(undefined, T0)
    expect(pinState(s, T0)).toEqual({ kind: 'tries', left: 4 })
    for (let i = 0; i < 3; i++) s = afterFailure(s, T0 + i)
    expect(pinState(s, T0 + 10)).toEqual({ kind: 'tries', left: 1 })
  })
  it('locks after 5 for 15 minutes from the last failure', () => {
    let s = undefined as ReturnType<typeof afterFailure> | undefined
    for (let i = 0; i < 5; i++) s = afterFailure(s, T0 + i * 1000)
    expect(pinState(s!, T0 + 5000)).toEqual({ kind: 'locked', until: T0 + 4000 + 15 * 60_000 })
    expect(pinState(s!, T0 + 4000 + 15 * 60_000 + 1)).toEqual({ kind: 'tries', left: 5 })
  })
})
```
- [ ] **Step 2:** run `npx vitest run src/features/auth/pinAttempts.test.ts` -> FAIL.
- [ ] **Step 3: Implement**

```ts
// src/features/auth/pinAttempts.ts
export const LIMIT = 5, LOCK_MS = 15 * 60_000
export interface Fails { n: number; lastAt: number }
export const afterFailure = (f: Fails | undefined, now: number): Fails => ({ n: (f?.n ?? 0) + 1, lastAt: now })
export function pinState(f: Fails | undefined, now: number): { kind: 'tries'; left: number } | { kind: 'locked'; until: number } {
  if (!f) return { kind: 'tries', left: LIMIT }
  const until = f.lastAt + LOCK_MS
  if (f.n >= LIMIT) return now < until ? { kind: 'locked', until } : { kind: 'tries', left: LIMIT }
  return { kind: 'tries', left: LIMIT - f.n }
}
```
- [ ] **Step 4:** PASS. **Step 5:** wire into SignIn.tsx (kv `pin.fail.<handle>`; offline detection = `signInWithPin` throws a TypeError from fetch -> catch in SignIn and show the no-signal line). SignIn tests: wrong PIN shows "4 tries left"; five failures show the locked screen; Forgot PIN opens askadmin. **Step 6:** e2e auth.spec: route `**/functions/v1/pin-login` to 401 five times -> locked screen visible. **Step 7:** shared.test.ts still asserts identical failure bodies (unchanged). **Step 8: Commit** `git commit -m "sign-in: phone-side tries and lock screen, forgot PIN request, 911 link, no-signal state"`

---

### Task 6: Fingerprint unlock in the APK (Lane C)

**Files:** Create `android/app/src/main/java/ph/bantay/family/BiometricPlugin.java`, `src/features/auth/biometric.ts`, `src/features/auth/biometric.test.ts`; Modify `MainActivity.java` (register), `android/app/build.gradle` (`implementation "androidx.biometric:biometric:1.1.0"`), SignIn.tsx (returning screen `return`), Onboarding fingerprint step (`finger`).

Design (D-32, audit A-15, A-16): the Supabase session stays in WebView storage; the fingerprint only gates showing the app. `BiometricPlugin.status()` -> `{ available: boolean, enrolled: boolean }` via `BiometricManager.canAuthenticate(BIOMETRIC_STRONG | DEVICE_CREDENTIAL)`; `BiometricPlugin.prompt({ title })` -> resolves `{ ok: true }` or rejects with `cancelled`/`failed`. Not enrolled -> step shows "Set up a fingerprint in Settings first" + Open Settings (`Settings.ACTION_BIOMETRIC_ENROLL`) or "Use PIN each time". On the PWA (no native plugin) passkeys stay as today (family.ts). Returning screen shows the person's own photo/name (A-16, A-17); "Not you?" always needs that person's PIN.

- [ ] **Step 1: Failing test**

```ts
// src/features/auth/biometric.test.ts
import { describe, expect, it, vi } from 'vitest'
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false }, registerPlugin: () => ({}) }))
import { unlockMode } from './biometric'
describe('unlockMode', () => {
  it('web uses passkey when the flag is set, else PIN', async () => {
    expect(await unlockMode({ passkeyFlag: true })).toBe('passkey')
    expect(await unlockMode({ passkeyFlag: false })).toBe('pin')
  })
})
```
  and a second describe with `isNativePlatform: () => true` and a plugin mock returning `{available:true,enrolled:false}` -> `'enrol-first'`, `{available:true,enrolled:true}` -> `'fingerprint'`.
- [ ] **Step 2:** FAIL. **Step 3:** implement `unlockMode` + `promptFingerprint()` wrapper with `registerPlugin('Biometric')`. Java plugin ~60 lines using `androidx.biometric.BiometricPrompt` on the activity's main executor. **Step 4:** PASS. **Step 5:** `cd android && ./gradlew assembleDebug` compiles (orchestrator runs on Lloyd's PC if the lane machine has no SDK). **Step 6: Commit.**

---

### Task 7: Setup wizard engine (Lane D)

**Files:** Create `src/features/setup/steps.ts`, `src/features/setup/steps.test.ts`, `src/features/setup/Wizard.tsx`, `src/features/setup/ChecklistCard.tsx`; Modify `src/screens/Onboarding.tsx` (becomes a thin wrapper rendering Wizard), `package.json` (+ `@capacitor/local-notifications@8`), `src/screens/Today.tsx` (render ChecklistCard at the top while any step is left; one line).

Steps in order (mockup `wiz`, audit A-19..A-30): photo, about me (Medical ID fields, each editable, "Not sure" stores UNKNOWN, B-5), medicines (shows "From your prescription of <date>" when present, else "Ask an admin to add them"), **notifications** (allow notifications + allow alarms and reminders + don't let Android pause Bantay + send a test reminder; iPhone line: "Reminders come from the family server, keep notifications on"), location (copy "Updates when you open Bantay", A-24), phone health data (Android only; Play Store branch on Android 13 and older), phone warnings (copy per A-26, B-1), SOS text contacts, sharing (all off), last screen line about usage tracking (A-30).

- [ ] **Step 1: Failing test**

```ts
// src/features/setup/steps.test.ts
import { describe, expect, it } from 'vitest'
import { remaining, type Probe } from './steps'
const all = (v: boolean): Probe => ({ photo: v, about: v, medicines: v, notifications: v, location: v, health: v, warnings: v, sos: v, sharing: v })
describe('remaining', () => {
  it('skips satisfied steps', () => expect(remaining({ ...all(true), notifications: false, warnings: false }, 'android')).toEqual(['notifications', 'warnings']))
  it('iPhone never gets Health Connect', () => expect(remaining(all(false), 'ios')).not.toContain('health'))
  it('one source for counts (A-28)', () => {
    const r = remaining({ ...all(true), sos: false }, 'android')
    expect(r.length).toBe(1)
  })
})
```
- [ ] **Step 2:** FAIL. **Step 3: Implement**

```ts
// src/features/setup/steps.ts
export type StepId = 'photo' | 'about' | 'medicines' | 'notifications' | 'location' | 'health' | 'warnings' | 'sos' | 'sharing'
export type Probe = Record<StepId, boolean>
export type Platform = 'android' | 'ios' | 'web'
export const ORDER: StepId[] = ['photo', 'about', 'medicines', 'notifications', 'location', 'health', 'warnings', 'sos', 'sharing']
const ANDROID_ONLY = new Set<StepId>(['health'])
export const remaining = (p: Probe, platform: Platform): StepId[] =>
  ORDER.filter((s) => !p[s] && (platform === 'android' || !ANDROID_ONLY.has(s)))
```
  plus `probe(): Promise<Probe>` that reads: kv `profile.photo`, Medical ID fields present, medicines count (or admin-set flag), notifications = `LocalNotifications.checkPermissions().display === 'granted'` AND `checkExactNotificationSetting().exact_alarm === 'granted'` AND `SettingsOpener.batteryStatus().ignoring === true` (Task 8) on Android, `Notification.permission === 'granted'` on web; location = kv `loc.asked`; health = sensors permission state; warnings = kv `warnings.done`; sos = kv `sos.contacts` length 2; sharing = kv `share.reviewed`.
- [ ] **Step 4:** PASS. **Step 5:** Wizard.tsx: one step per screen, step dots tappable, Back arrow, Skip, Continue/Finish (A-20); runs `probe()` on open and after returning from Settings (`App.addListener('resume')` from @capacitor/app, already a transitive dep; else `visibilitychange`). "Send a test reminder" schedules `LocalNotifications.schedule({ notifications: [{ id: 9001, title: 'Bantay test', body: 'Reminders work on this phone.', schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true } }] })` - no health value (B-7). ChecklistCard lists the remaining items by name; each opens its own step (A-29). **Step 6:** e2e onboarding.spec: wizard skips a step whose kv flag is set; checklist card shows the same count as the wizard. **Step 7:** screenshots light+dark of every step. **Step 8: Commit.**

---

### Task 8: Battery and settings probes in SettingsOpener (Lane D)

**Files:** Modify `android/app/src/main/java/ph/bantay/family/SettingsOpenerPlugin.java`, `android/app/src/main/AndroidManifest.xml` (`POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` with `android:maxSdkVersion="32"`, `USE_EXACT_ALARM` is NOT used (Play policy irrelevant but keep the user-grantable one), `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` is NOT added: open the list screen instead); `src/features/safety/settingsOpener.ts` (existing TS wrapper) + test.

- [ ] **Step 1: Failing TS test** (wrapper falls back on web)

```ts
// src/features/safety/settingsOpener.test.ts (add)
it('batteryStatus on web reports ignoring=true so the step is not shown', async () => {
  expect(await batteryStatus()).toEqual({ ignoring: true })
})
```
- [ ] **Step 2:** FAIL. **Step 3:** Java: `@PluginMethod batteryStatus(call)` -> `PowerManager.isIgnoringBatteryOptimizations(getContext().getPackageName())`; `@PluginMethod openBattery(call)` -> `Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS` (list screen, no special permission). TS wrapper `batteryStatus()` / `openBattery()`. **Step 4:** PASS + `./gradlew assembleDebug`. **Step 5: Commit.**

---

### Task 9: Location rules - resolvePlace (Lane E)

**Files:** Create `src/features/location/place.ts`, `src/features/location/place.test.ts`; Modify `useLocation.ts` (initial state no longer DAMPAS: `null` until resolved; `getHome()` returns the last chosen zone, default per D-33), `src/features/safety/alerts.ts:30`, `src/screens/Safety.tsx` labels, `src/screens/Onboarding.tsx:34` (no Dampas prefill; Lane D owns Onboarding: hand the one-line change to D via the orchestrator).

Rules (D-33): weather uses the phone position when known; zone data uses the nearest home zone while in the Philippines; outside PH the member picks a zone (last pick kept); no position -> last chosen zone (first ever = the zone picked at setup, else Dampas).

- [ ] **Step 1: Failing test**

```ts
// src/features/location/place.test.ts
import { describe, expect, it } from 'vitest'
import { inPhilippines, resolvePlace } from './place'
const TAG = { lat: 9.65, lon: 123.85 }, GENSAN = { lat: 6.11, lon: 125.17 }, CEBU = { lat: 10.31, lon: 123.89 }, TOKYO = { lat: 35.68, lon: 139.76 }
describe('resolvePlace (D-33)', () => {
  it('weather follows GPS, zone = nearest home zone in PH', () => {
    expect(resolvePlace({ gps: GENSAN, lastZone: 'dampas' })).toEqual({ weather: GENSAN, zone: 'conel', source: 'gps' })
    expect(resolvePlace({ gps: CEBU, lastZone: 'conel' })).toEqual({ weather: CEBU, zone: 'dampas', source: 'gps' })
  })
  it('outside PH keeps the last chosen zone for zone data', () => {
    expect(resolvePlace({ gps: TOKYO, lastZone: 'conel' })).toEqual({ weather: TOKYO, zone: 'conel', source: 'gps-abroad' })
  })
  it('no GPS uses the last chosen zone for both', () => {
    const r = resolvePlace({ gps: null, lastZone: 'conel' })
    expect(r.zone).toBe('conel'); expect(r.source).toBe('zone'); expect(r.weather.lat).toBeCloseTo(6.2015, 3)
  })
  it('PH box', () => { expect(inPhilippines(TAG)).toBe(true); expect(inPhilippines(TOKYO)).toBe(false) })
})
```
- [ ] **Step 2:** FAIL. **Step 3: Implement**

```ts
// src/features/location/place.ts
import { HOME_ZONES, nearestZone, type LatLon } from './geo'
export type ZoneId = (typeof HOME_ZONES)[number]['id']
// ponytail: bounding box, not the national border; upgrade to a polygon only if a member lives near the edge.
export const inPhilippines = (p: LatLon) => p.lat >= 4.2 && p.lat <= 21.3 && p.lon >= 116.0 && p.lon <= 127.0
export function resolvePlace(o: { gps: LatLon | null; lastZone: ZoneId }) {
  const last = HOME_ZONES.find((z) => z.id === o.lastZone)!
  if (!o.gps) return { weather: { lat: last.lat, lon: last.lon }, zone: o.lastZone, source: 'zone' as const }
  if (!inPhilippines(o.gps)) return { weather: o.gps, zone: o.lastZone, source: 'gps-abroad' as const }
  return { weather: o.gps, zone: nearestZone(o.gps).id as ZoneId, source: 'gps' as const }
}
```
- [ ] **Step 4:** PASS. **Step 5:** `usePlace()` hook in useLocation.ts returns `resolvePlace(...)` plus `pickZone(id)` (kv `loc.zone`); replace DAMPAS usages listed above; Safety location chip opens a zone picker (Current / Dampas / Conel, A-89). Grep check: `grep -rn "DAMPAS" src | grep -v geo.ts | grep -v test` returns nothing. **Step 6:** `npm test` (geo.test parity with alerts-ingest stays green). **Step 7: Commit** `git commit -m "location: resolvePlace replaces the Dampas default (D-33)"`

---


### Task 10: Safety refinements D-61, D-62 (Lane E)

**Files:** Modify `src/screens/Safety.tsx`, `src/features/safety/PhoneWarnings.tsx`; Test `src/features/safety/PhoneWarnings.test.tsx`, `e2e/safety.spec.ts`.

- [ ] **Step 1: Failing test** (PhoneWarnings)

```tsx
it('renders nothing when every warning is on (D-61)', async () => {
  mockStatus({ earthquake: 'on', emergency: 'on' })
  const { container } = render(<PhoneWarnings />)
  await waitFor(() => expect(container).toBeEmptyDOMElement())
})
it('lists only the warnings that need fixing', async () => {
  mockStatus({ earthquake: 'off', emergency: 'on' })
  render(<PhoneWarnings />)
  expect(await screen.findByText(/Earthquake alerts are off/)).toBeVisible()
  expect(screen.queryByText(/Emergency alerts/)).toBeNull()
})
```
  (`mockStatus` = the existing test helper in PhoneWarnings.test.tsx that stubs the status source; reuse it.)
- [ ] **Step 2:** FAIL. **Step 3:** filter rows to status !== 'on'; return null when none. **Step 4:** Safety.tsx order: SOS, Call 911 + Medical ID row, IDs + Insurance row (buttons route to `#docs`; until the records lane ships the docs screen they open Records with the upload sheet preset to type id_card / insurance_card), status/advisory card, Quick dial, Live maps, Nearby help, rest unchanged (D-62). e2e safety.spec asserts the advisory card's box is below the 911 button and above "Quick dial". **Step 5:** PASS + screenshots light/dark. **Step 6: Commit** `git commit -m "safety: phone warnings only when something needs fixing (D-61); advisory above quick dial (D-62)"`

---

## After all lanes merge (orchestrator)

1. Merge order: A, E, B, D, C (C last: it touches SignIn + MainActivity).
2. Gates on the merged branch: tsc 0, vitest all, Playwright all, `./gradlew assembleDebug`.
3. Screenshots 390x844 light + dark: welcome, pin (wrong + locked), finger, each wizard step, Today with checklist, Me, Safety zone picker, tab bar. Review against mockup v6 before push.
4. Fable 5.1 review of Lane C (auth) and Lane D (permissions); Opus 5.5 for A, B, E.
5. Push main (orchestrator), Pages deploys; debug APK built and installed by Lloyd (one PowerShell block).
6. **P1 acceptance (Lloyd's phone):** fresh APK install -> pick name -> PIN (wrong once, see tries left) -> fingerprint -> wizard skips what is already on -> test reminder arrives -> Today; reopen = photo + fingerprint; Lloyd's Google sign-in returns to the app; Safety shows GenSan data when the phone is in GenSan.

## Self-review

- Spec coverage: D-29 (Task 1), D-30 simple-mode switch (Task 3; layout P3), D-32 (Tasks 4-7), D-33 (Task 9), D-34 sharing defaults + SOS contacts (Task 3, 7), D-41 name list + PIN states (Task 5), D-44 (Task 2), audit A-10..A-30, A-89, A-90 (Tasks 2-9). Out of P1 by design: offline banner (D-51, P3), inbox content (P3), updater (P2), dependent page (P5/P3).
- No placeholders: UI tasks reference exact mockup screen ids for layout and carry their own tests.
- Types: `Tab`, `FamilySeg`, `StepId`, `Probe`, `ZoneId` used consistently.

## Later phases noted from Lloyd's 2026-10-18 refinements

- D-63 IDs and insurance screen + upload: built by the records lane (session records-db, branch claude/records-db-cf8e91) as part of its document storage.
- D-64 Video of the day: P3 Today task (curated `daily_videos` table, admin list, daily pick by zone risk and season, link-out card, hidden offline).
