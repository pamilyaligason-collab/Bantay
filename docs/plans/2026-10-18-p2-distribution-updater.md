# P2 Distribution and Updater Implementation Plan

**Goal:** Lloyd installs Bantay 2.0.0 from bantay.pages.dev/get, and publishing 2.0.1 shows "Update ready" in the app and installs in one or two taps; the old web app tells Android users to switch and iPhone users to stay.

**Architecture:** Signed release APKs and a `latest.json` live on GitHub Releases of pamilyaligason-collab/Bantay (served as application/vnd.android.package-archive with Content-Disposition attachment; Cloudflare Pages has a 25 MiB per-file limit, so APKs never go on Pages). A Java Capacitor plugin `AppUpdater` downloads to the app cache, checks SHA-256, and installs with a PackageInstaller session (handles STATUS_PENDING_USER_ACTION; asks for "Install unknown apps" for Bantay on the first update). The web layer compares the shell version with `latest.json` and with the minimum shell a feature needs. `/get` is a static page on Pages with an Android and an iPhone branch.

**Tech Stack:** Capacitor 8.5.3 Android (Java), Gradle 8.14.3 + JDK 21, GitHub Releases + `gh` CLI, React 19 + TS, Vitest, Playwright.

**Sources:** vault research/session-4-install-update.md (tap counts, SessionParams rules, hosting), sources-and-updater-research.md Part B, D-35, D-50, audit A-1..A-9, A-96..A-101; mockup v6 screens `get`, `get-ios`, `pwa`, sheet `update`, Today "Update ready" card, Me version row.

**Gates:** tsc 0, vitest green, Playwright green, `./gradlew assembleRelease` signed, screenshots 390x844 light+dark of /get (both branches), PWA banner, update sheet states, Today card; Fable 5.1 review of the plugin (installs code on phones) before merge.

---

## Lanes

| Lane | Tasks | Files (exclusive) |
|---|---|---|
| F Native updater | 1, 2 | android/.../AppUpdaterPlugin.java (new), MainActivity.java (one line), AndroidManifest.xml, android/app/build.gradle, android/app/src/main/res/xml/file_paths.xml |
| G Web updater UI | 3, 4 | src/features/update/* (new), src/screens/Today.tsx (card slot), src/screens/Me.tsx (version row) |
| H Distribution | 5, 6, 7 | public/get/index.html (new), public/_headers, src/features/update/PwaBanner.tsx (new), scripts/release-apk.ps1 (new), docs/RELEASE.md (new), vite.config.ts (manifest related_applications) |

Lane G codes against the plugin interface in Task 1 Step 3 (contract); Lane F implements it.

---

### Task 1: Release signing and versioning (Lane F)

**Files:** Modify `android/app/build.gradle`; Create `android/keystore.properties.example`; `.gitignore` (+ `android/keystore.properties`, `*.jks`).

- [ ] **Step 1:** build.gradle: read `keystore.properties` if present; `signingConfigs { release { storeFile file(p['storeFile']); storePassword p['storePassword']; keyAlias p['keyAlias']; keyPassword p['keyPassword'] } }`; `buildTypes.release.signingConfig signingConfigs.release`; `versionCode` and `versionName` from `-PversionCode` / `-PversionName` with defaults 2000000 / "2.0.0" (versionCode = major*1_000_000 + minor*1_000 + patch).
- [ ] **Step 2:** Lloyd step (one PowerShell block from the orchestrator): `keytool -genkeypair -v -keystore D:\Claude\Bantay-keys\bantay-release.jks -alias bantay -keyalg RSA -keysize 4096 -validity 10000`, write `android/keystore.properties` pointing at it, back the .jks up offline (losing it means members must uninstall to update). The key and passwords never enter the repo, chat or vault (FACTS secrets policy: names only).
- [ ] **Step 3:** `./gradlew assembleRelease -PversionCode=2000000 -PversionName=2.0.0` -> `app-release.apk`; `apksigner verify --print-certs` shows the bantay certificate.
- [ ] **Step 4: Commit** (no secrets) `git commit -m "android: release signing from keystore.properties, version from gradle props"`

---

### Task 2: AppUpdater plugin (Lane F)

**Files:** Create `android/app/src/main/java/ph/bantay/family/AppUpdaterPlugin.java`, `android/app/src/test/java/ph/bantay/family/AppUpdaterLogicTest.java`; Modify `MainActivity.java` (`registerPlugin(AppUpdaterPlugin.class);`), `AndroidManifest.xml` (`<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES"/>`; `<queries>` not needed), delete the template tests under `com/getcapacitor/myapp/`.

**Contract (Lane G codes against this):**
```ts
interface AppUpdaterPlugin {
  info(): Promise<{ versionCode: number; versionName: string; canInstall: boolean }>        // canInstall = packageManager.canRequestPackageInstalls()
  openInstallPermission(): Promise<void>                                                     // ACTION_MANAGE_UNKNOWN_APP_SOURCES, data package:ph.bantay.family
  download(o: { url: string; sha256: string; size: number }): Promise<{ path: string }>      // emits 'progress' {done,total}; rejects 'checksum' | 'space' | 'network'
  install(o: { path: string }): Promise<{ status: 'success' | 'pending_user' | 'failure'; message?: string }>
}
```

- [ ] **Step 1: Failing JVM test** for the pure helpers (no Android needed)

```java
// android/app/src/test/java/ph/bantay/family/AppUpdaterLogicTest.java
package ph.bantay.family;
import static org.junit.Assert.*;
import org.junit.Test;
import java.nio.charset.StandardCharsets;
public class AppUpdaterLogicTest {
  @Test public void sha256MatchesKnownVector() throws Exception {
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      AppUpdaterPlugin.sha256Hex(new java.io.ByteArrayInputStream("abc".getBytes(StandardCharsets.UTF_8))));
  }
  @Test public void onlyHttpsGithubHostsAllowed() {
    assertTrue(AppUpdaterPlugin.allowedUrl("https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/bantay-2.0.1.apk"));
    assertFalse(AppUpdaterPlugin.allowedUrl("http://github.com/x.apk"));
    assertFalse(AppUpdaterPlugin.allowedUrl("https://evil.example/bantay.apk"));
  }
}
```
- [ ] **Step 2:** `cd android && ./gradlew testDebugUnitTest` -> FAIL (class missing).
- [ ] **Step 3: Implement** (outline; the lane writes the full class, ~150 lines):
  - `static String sha256Hex(InputStream)` with `MessageDigest.getInstance("SHA-256")`, 64 KB buffer, lowercase hex.
  - `static boolean allowedUrl(String)` -> scheme https AND host in {`github.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`} (GitHub redirects downloads; follow redirects only to these hosts).
  - `download`: background thread; `HttpURLConnection` with `setInstanceFollowRedirects(false)` and a manual redirect loop (max 5) checking `allowedUrl` each hop; check free space (`getCacheDir().getUsableSpace() > size * 2` else reject `space`); write to `getCacheDir()/update/bantay.apk`; `notifyListeners("progress", {done,total})` every 256 KB; verify `sha256Hex` equals the expected value (case-insensitive) else delete the file and reject `checksum`.
  - `install`: `PackageInstaller.SessionParams(MODE_FULL_INSTALL)`; on API 31+ `setRequireUserAction(SessionParams.USER_ACTION_NOT_REQUIRED)`; copy the APK into `session.openWrite`, `fsync`, commit with a `PendingIntent.getBroadcast(..., FLAG_MUTABLE | FLAG_UPDATE_CURRENT)` to a receiver registered at runtime (`RECEIVER_NOT_EXPORTED` on API 33+). In the receiver: `STATUS_PENDING_USER_ACTION` -> start the `EXTRA_INTENT` activity (Android shows its own Update box) and resolve `pending_user`; `STATUS_SUCCESS` -> `success` (the app restarts on update); other -> `failure` with `EXTRA_STATUS_MESSAGE`.
  - `info`: `PackageInfoCompat.getLongVersionCode`, `versionName`, `canRequestPackageInstalls()`.
- [ ] **Step 4:** `./gradlew testDebugUnitTest assembleDebug` -> PASS.
- [ ] **Step 5: Device test (Lloyd's phone, orchestrator guides):** install 2.0.0 release; publish a 2.0.1 test release (Task 6 script); first update shows the "Allow Bantay to install updates" explainer then Android's permission screen, then the Update box; second update (2.0.2) needs 1 or 2 taps. Record the real tap counts in the vault (research note said UNVERIFIED whether NOT_REQUIRED skips the box).
- [ ] **Step 6: Commit** `git commit -m "android: AppUpdater plugin (GitHub-only download, SHA-256, PackageInstaller session)"`

---

### Task 3: Update check logic (Lane G)

**Files:** Create `src/features/update/check.ts`, `src/features/update/check.test.ts`, `src/features/update/plugin.ts` (registerPlugin('AppUpdater') typed with the Task 2 contract; web stub returns `{ versionCode: 0, versionName: 'web', canInstall: false }`).

`latest.json` (published by Task 6):
```json
{ "versionCode": 2000001, "versionName": "2.0.1", "url": "https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/bantay-2.0.1.apk",
  "sha256": "<64 hex>", "size": 9437184, "minShell": 2000000, "notes": "Faster sign-in and a fix for medicine reminders." }
```
Fetched from `https://github.com/pamilyaligason-collab/Bantay/releases/latest/download/latest.json` (stable URL), at most once per 6 h (kv `update.checkedAt`), on app open and from Me > Check for updates.

- [ ] **Step 1: Failing test**

```ts
// src/features/update/check.test.ts
import { describe, expect, it } from 'vitest'
import { decide, parseLatest } from './check'
const L = { versionCode: 2000001, versionName: '2.0.1', url: 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/bantay-2.0.1.apk', sha256: 'a'.repeat(64), size: 9437184, minShell: 2000000, notes: 'x' }
describe('decide', () => {
  it('newer release -> ready', () => expect(decide({ versionCode: 2000000 }, L)).toEqual({ kind: 'ready', latest: L }))
  it('same -> none', () => expect(decide({ versionCode: 2000001 }, L)).toEqual({ kind: 'none' }))
  it('shell below minShell -> required (full screen, D-50)', () => expect(decide({ versionCode: 1999999 }, L).kind).toBe('required'))
  it('web build never offers an APK', () => expect(decide({ versionCode: 0 }, L)).toEqual({ kind: 'none' }))
})
describe('parseLatest', () => {
  it('rejects a non-GitHub url or a bad hash', () => {
    expect(parseLatest({ ...L, url: 'https://evil.example/a.apk' })).toBeNull()
    expect(parseLatest({ ...L, sha256: 'xyz' })).toBeNull()
  })
  it('accepts the published shape', () => expect(parseLatest(L)).toEqual(L))
})
```
- [ ] **Step 2:** FAIL. **Step 3: Implement**

```ts
// src/features/update/check.ts
export interface Latest { versionCode: number; versionName: string; url: string; sha256: string; size: number; minShell: number; notes: string }
const GH = /^https:\/\/github\.com\/pamilyaligason-collab\/Bantay\/releases\/download\/[^/]+\/[^/]+\.apk$/
export function parseLatest(x: unknown): Latest | null {
  const o = x as Partial<Latest> | null
  if (!o || typeof o !== 'object') return null
  const okNum = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0
  if (!okNum(o.versionCode) || !okNum(o.size) || !okNum(o.minShell)) return null
  if (typeof o.url !== 'string' || !GH.test(o.url)) return null
  if (typeof o.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(o.sha256)) return null
  if (typeof o.versionName !== 'string' || typeof o.notes !== 'string') return null
  return o as Latest
}
export function decide(shell: { versionCode: number }, l: Latest): { kind: 'none' } | { kind: 'ready' | 'required'; latest: Latest } {
  if (shell.versionCode === 0) return { kind: 'none' } // PWA or browser
  if (shell.versionCode < l.minShell) return { kind: 'required', latest: l }
  return shell.versionCode < l.versionCode ? { kind: 'ready', latest: l } : { kind: 'none' }
}
export const needsShell = (shell: { versionCode: number }, min: number) => shell.versionCode !== 0 && shell.versionCode < min
```
- [ ] **Step 4:** PASS. **Step 5: Commit.**

---

### Task 4: Update UI (Lane G)

**Files:** Create `src/features/update/UpdateSheet.tsx`, `src/features/update/UpdateCard.tsx`, `src/features/update/RequiresUpdate.tsx`, `src/features/update/UpdateSheet.test.tsx`; Modify Today.tsx (card below quick log, never above an alert hero: render only when no alert is active), Me.tsx (version row "App 2.0.0 · Screens <build date>", Check for updates opens the sheet).

States (mockup sheet `update`): explainer when `canInstall` is false ("First update only: Android asks once to let Bantay install updates. Turn it on, go Back, then tap Update." + Open Settings -> `openInstallPermission()`, re-check on resume); "Download on Wi-Fi only" switch (kv `update.wifiOnly`; when on and `navigator.connection?.type === 'cellular'`, the card says "Waiting for Wi-Fi"); progress "Downloading 4.1 of 9 MB"; "Checked. Tap Update in Android's box." (after `install()` -> `pending_user`); errors: checksum -> "The download was damaged. Try again."; space -> "Not enough space. Free up N MB and try again."; network -> "Download stopped. Try again when you have signal."; `required` -> full-screen RequiresUpdate (only for breaking shell versions). Web code that needs a newer shell uses `needsShell()` and shows "Update the app to use this" (A-98). After a live web deploy, a "Bantay was updated" toast shows on the next screen change (service worker `controllerchange`, A-101).

- [ ] **Step 1: Failing test**

```tsx
// src/features/update/UpdateSheet.test.tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { UpdateSheet } from './UpdateSheet'
const latest = { versionCode: 2000001, versionName: '2.0.1', url: 'https://github.com/pamilyaligason-collab/Bantay/releases/download/v2.0.1/b.apk', sha256: 'a'.repeat(64), size: 9_437_184, minShell: 2000000, notes: 'Fixes' }
describe('UpdateSheet', () => {
  it('asks for install permission first when Bantay cannot install', async () => {
    const api = { info: vi.fn().mockResolvedValue({ versionCode: 2000000, versionName: '2.0.0', canInstall: false }), openInstallPermission: vi.fn(), download: vi.fn(), install: vi.fn() }
    render(<UpdateSheet latest={latest} api={api} />)
    expect(await screen.findByText(/Android asks once to let Bantay install updates/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Open Settings' }))
    expect(api.openInstallPermission).toHaveBeenCalled()
  })
  it('shows the damaged-download message on checksum failure', async () => {
    const api = { info: vi.fn().mockResolvedValue({ versionCode: 2000000, versionName: '2.0.0', canInstall: true }), openInstallPermission: vi.fn(), download: vi.fn().mockRejectedValue(new Error('checksum')), install: vi.fn() }
    render(<UpdateSheet latest={latest} api={api} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }))
    expect(await screen.findByText('The download was damaged. Try again.')).toBeVisible()
  })
})
```
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** screenshots of every state light+dark. **Step 6: Commit.**

---

### Task 5: /get landing page (Lane H)

**Files:** Create `public/get/index.html` (static, no app bundle, inline CSS using the v2 tokens and the self-hosted fonts from P1 Task 1); Modify `public/_headers` (`/get/*` Cache-Control no-cache).

Content (mockup `get` and `get-ios`): detects `/(iPhone|iPad)/` in the user agent -> iPhone branch: "Bantay on iPhone stays a web app" + Add to Home Screen 3 steps (Share > Add to Home Screen > Add) + "Allow notifications when Bantay asks"; Android: in-app browser check (`/FBAN|FBAV|Messenger|Instagram|Line\//` in UA) -> "Opened from Messenger? Tap the menu and choose Open in Chrome first" with a copy-link button; 4 steps (Download anyway + Open; Settings, Allow from this source, Back; Play Protect scan then Install; Open Bantay), version + size + SHA-256 line read from latest.json, the Download button links to `https://github.com/pamilyaligason-collab/Bantay/releases/latest/download/bantay.apk` (stable asset name, Task 6), and "Didn't see it? Open Files > Downloads". Old-icon card phrased "If you have the old Bantay icon..." (A-5).

- [ ] **Step 1: Failing e2e**

```ts
// e2e/get.spec.ts
import { expect, test } from '@playwright/test'
test('Android visitor sees 4 steps and the APK link', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 Chrome/141 Mobile Safari/537.36', viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage(); await page.goto('/get/')
  await expect(page.getByRole('listitem')).toHaveCount(4)
  await expect(page.getByRole('link', { name: /Download Bantay/ })).toHaveAttribute('href', /releases\/latest\/download\/bantay\.apk$/)
})
test('iPhone visitor gets Add to Home Screen, no APK', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage(); await page.goto('/get/')
  await expect(page.getByText(/Add to Home Screen/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Download Bantay/ })).toHaveCount(0)
})
test('Messenger in-app browser is told to open Chrome', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (Linux; Android 15) Chrome/141 Mobile [FBAN/Messenger;FBAV/480.0]' })
  const page = await ctx.newPage(); await page.goto('/get/')
  await expect(page.getByText(/Open in Chrome/)).toBeVisible()
})
```
- [ ] **Step 2:** FAIL. **Step 3:** build the page. **Step 4:** PASS + no sideways scroll at 360 px. **Step 5: Commit.**

---

### Task 6: Release script (Lane H)

**Files:** Create `scripts/release-apk.ps1`, `docs/RELEASE.md`.

One PowerShell 5.1 block (Lloyd's standing order: stops at the first failure, labels each step): parse `-Version 2.0.1 [-MinShell 2000000] -Notes "..."`; compute versionCode; `npm ci`; `npx tsc --noEmit`; `npm test`; `npx cap sync android`; `.\gradlew.bat assembleRelease -PversionCode=... -PversionName=...`; copy to `bantay-<v>.apk` and `bantay.apk`; `Get-FileHash -Algorithm SHA256`; write `latest.json` (Task 3 shape); `gh release create v<v> bantay-<v>.apk bantay.apk latest.json --repo pamilyaligason-collab/Bantay --title "Bantay <v>" --notes "<notes>"` using the pamilyaligason-collab gh account (FACTS: repo-local credential helper). Each native command followed by `if ($LASTEXITCODE -ne 0) { throw "step N failed" }`; `$ErrorActionPreference='Stop'`. Test: run with `-DryRun` (skips `gh release create`, prints the latest.json) in CI-less local check; the orchestrator runs the dry run, Lloyd runs the real one.

- [ ] Steps: write script -> `powershell -File scripts/release-apk.ps1 -Version 2.0.0 -Notes "First v2" -DryRun` prints a valid latest.json that `parseLatest` accepts (add a vitest that reads `scripts/fixtures/latest.sample.json` written by the dry run) -> commit.

---

### Task 7: Old web app banner (Lane H)

**Files:** Create `src/features/update/PwaBanner.tsx`, `src/features/update/PwaBanner.test.tsx`; Modify App.tsx (one line: render above Today content) - coordinate with P1 Lane B's App.tsx; `vite.config.ts` manifest: no `related_applications` (getInstalledRelatedApps for a sideloaded APK is UNVERIFIED; do not depend on it).

Rules (D-35, A-6, A-7, A-9): show only when `matchMedia('(display-mode: standalone)').matches` AND Android UA AND not native (`Capacitor.isNativePlatform()` false); never on iOS. Steps: 1 install from /get and sign in again, 2 "All saved to the family account" when the outbox is empty, else "3 entries still waiting, connect to send" and step 3 stays disabled, 3 remove the old icon (long-press > Uninstall). "Later" hides it for 24 h (kv). On first APK sign-in, the server drops that member's Android web-push subscriptions (one SQL line in the existing push-subscribe path: delete rows where member = me and user_agent like '%Android%' and endpoint not FCM) - follow-up task in P3 when FCM lands; note it in docs/RELEASE.md.

- [ ] **Step 1: Failing test**

```tsx
// src/features/update/PwaBanner.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { shouldShowPwaBanner } from './PwaBanner'
describe('shouldShowPwaBanner', () => {
  it('Android installed web app -> yes', () => expect(shouldShowPwaBanner({ standalone: true, ua: 'Linux; Android 15', native: false })).toBe(true))
  it('iPhone -> never', () => expect(shouldShowPwaBanner({ standalone: true, ua: 'iPhone OS 18_0', native: false })).toBe(false))
  it('inside the APK -> never', () => expect(shouldShowPwaBanner({ standalone: true, ua: 'Android 15', native: true })).toBe(false))
  it('browser tab -> no', () => expect(shouldShowPwaBanner({ standalone: false, ua: 'Android 15', native: false })).toBe(false))
})
```
- [ ] **Step 2:** FAIL. **Step 3:** `export const shouldShowPwaBanner = (o: { standalone: boolean; ua: string; native: boolean }) => o.standalone && !o.native && /Android/.test(o.ua) && !/iPhone|iPad/.test(o.ua)` + the banner component reading the outbox count from the existing sync module. **Step 4:** PASS. **Step 5: Commit.**

---

## After merge (orchestrator)

1. Merge F, then G, then H. Gates: tsc, vitest, Playwright, `./gradlew testDebugUnitTest assembleRelease`.
2. Fable 5.1 review of AppUpdaterPlugin (URL allow-list, redirect handling, checksum before install, PendingIntent flags, receiver export).
3. Lloyd: keystore block (Task 1 Step 2), then the release block for 2.0.0, install from /get on his phone (count the taps), then release 2.0.1 and update from the Today card (count the taps). Record both in the vault BASELINE.
4. Register a free Android developer account with limited distribution (<= 20 devices) before 2027 (D-50); not needed for 2026 installs in the Philippines.

## Self-review

- Spec coverage: D-35 (Tasks 2, 5, 7), D-50 (Tasks 2-6), A-1..A-9 (Tasks 5, 7), A-96..A-101 (Tasks 3, 4). Out of scope: FCM (P3), web-push retirement (P3 follow-up noted).
- No placeholders: the Java class is specified method by method with exact APIs; the lane writes it and the JVM test pins the pure helpers.
- Types: `Latest`, `decide`, `needsShell`, plugin contract identical in Tasks 2, 3, 4.
