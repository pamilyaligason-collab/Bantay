# Native app (Capacitor): movement and sensors

Why native: a PWA has no step-counter API, DeviceMotion works only while the app is open, and real background steps and sleep need Health Connect (Android) or HealthKit (iOS). The same React app runs inside a Capacitor shell; on a plain browser it falls back to the one-tap walk log.

## Status

| Part | State |
|---|---|
| Android project (`android/`) | Generated, `cap sync` passes. Gradle build not run on the dev PC (no Android SDK, JDK 8 only). Not run on a device. |
| iOS project (`ios/`) | Generated, `cap sync` passes (Swift Package Manager, no CocoaPods). HealthKit path is written and **not tested**. It ships only when a paid Apple developer account exists (D-12). |
| Health Connect path | Code complete, unit-tested with a fake bridge. **Not tested on a real phone.** |
| PWA fallback | Tested in unit and Playwright (`e2e/sensors.spec.ts`). |

## Plugin choice

`@capgo/capacitor-health` **8.11.12**, licence **MPL-2.0**.

- Only maintained plugin found that reads all four types we need through one API on both platforms: steps, sleep, heart rate, blood pressure (Health Connect and HealthKit). Released 2026-10-15, peer dependency `@capacitor/core >=8`.
- `capacitor-health` 8.4.0 (MIT) was the alternative. It has no sleep, heart rate (except inside workouts) or blood pressure reads, so it cannot do the job.
- GPL-3.0 compatibility: MPL-2.0 section 3.3 lets MPL code be combined into a larger work under GPL-3.0 as a "Secondary License". We use the plugin unmodified, so MPL file-level obligations (keep its notices, publish any changes to its files) do not bite. Capacitor itself is MIT.
- Risk: plugin is maintained by one vendor (Capgo). Pinned exact. The app talks to it only through `HealthBridge` in `src/features/sensors/health.ts` and `bridge.ts`, so swapping it is one file.

## What the code does

- `src/features/sensors/health.ts`: per-type enable and disable, permission request per type only when its switch is turned on, `syncAll` (normalise, dedupe, write through `logActivity` / `logReading`), `syncOnResume` (runs when the app returns to the foreground).
- Mapping: steps become Activity `kind 'steps'`; sleep becomes Activity `kind 'sleep'` (asleep, light, deep and REM minutes only); heart rate becomes Reading `heart_rate` (one per 15 minutes); blood pressure becomes Readings `bp_systolic` and `bp_diastolic`. Source is `health-connect` on Android and `healthkit` on iOS.
- Dedupe: Activity by (person, source, kind, startedAt), Readings by (person, test, takenAt). A per-type cursor means only new data is read. `Reading` has no source field, so a hand-typed reading at the exact same instant would also be skipped.
- First sync after a switch is turned on looks back 7 days. Without the optional history permission Health Connect only returns about 30 days anyway.
- If the user removes access in Health Connect or iOS Settings, the next sync turns that type off in the app. It does not nag.
- No notification path: nothing in `src/features/sensors/` touches the Notification API, the service worker or push (B-7). Not a medical device (B-6): the UI says so in the privacy page and shows no judgement of the numbers.
- DeviceMotion step estimate: **skipped**. It needs an iOS permission prompt and a tuned step detector, only works while the screen is open, and a wrong number is worse than none.

## Permissions

Android (`android/app/src/main/AndroidManifest.xml`): the plugin manifest declares many read and write permissions. The app manifest keeps only `READ_STEPS`, `READ_SLEEP`, `READ_HEART_RATE`, `READ_BLOOD_PRESSURE` and strips every other one (including all `WRITE_*`) with `tools:node="remove"`. The plugin's `PermissionsRationaleActivity` and the Android 14 `ViewPermissionUsageActivity` alias merge in and show `privacypolicy.html` (from `public/privacypolicy.html`, copied into the app by `cap sync`). **Lloyd must read and approve that page, and host a public copy before any Play Store listing.** minSdk is 26 (Health Connect minimum).

iOS: `NSHealthShareUsageDescription` is in `ios/App/App/Info.plist`. The app only reads, so `NSHealthUpdateUsageDescription` is not set. Still to do in Xcode on a Mac: open `ios/App/App.xcodeproj`, Signing & Capabilities, add **HealthKit**, set the team (needs the paid Apple account). Apple's HealthKit does not say whether a read was denied, so on iOS a denied type simply returns no data.

## Build a debug APK (Windows, sideload to a family phone)

One-time setup:
1. Install Android Studio (current stable). Let it install JDK 21 (bundled "jbr") and Android SDK Platform 36 plus Build-Tools.
2. Set `JAVA_HOME` to Android Studio's `jbr` folder and `ANDROID_HOME` to the SDK folder (usually `%LOCALAPPDATA%\Android\Sdk`).

Each build, one PowerShell 5.1 block from `D:\Claude\Bantay` (or any checkout of this branch):

```powershell
$ErrorActionPreference = 'Stop'
npm ci;                              if ($LASTEXITCODE -ne 0) { throw 'step 1 npm ci failed' }
npm run build;                       if ($LASTEXITCODE -ne 0) { throw 'step 2 build failed' }
npx cap sync android;                if ($LASTEXITCODE -ne 0) { throw 'step 3 cap sync failed' }
Push-Location android
.\gradlew.bat assembleDebug;         if ($LASTEXITCODE -ne 0) { Pop-Location; throw 'step 4 gradle failed' }
Pop-Location
'APK: android\app\build\outputs\apk\debug\app-debug.apk'
```

Install: copy the APK to the phone and open it (allow "install unknown apps" for that file manager once), or `adb install -r android\app\build\outputs\apk\debug\app-debug.apk` with USB debugging on.

On the phone: Android 14 and newer have Health Connect built in. Android 13 and older need "Health Connect by Android" from the Play Store. Open Bantay, go to the sensor settings, turn on Steps. The phone asks once for that type only.

Debug APKs are signed with Android's debug key. That is fine for sideloading to family. For Play Store you need your own upload keystore, created and kept outside the repo (never commit it), plus Google's health apps declaration.

## Risks and unknowns

- Nothing here has run on a device. First real test: turn on Steps with a watch or Google Fit / Samsung Health writing to Health Connect, confirm rows appear and a second open does not duplicate.
- Step records from Health Connect can be many small rows. Sync reads up to 1000 per type per run and keeps a cursor, so a first sync of a busy week may need two opens. Thin or bucket if the Activity table grows too fast.
- Web push does not work inside the Capacitor WebView. If the native app is to receive storm alerts it needs `@capacitor/push-notifications` (FCM). Out of scope for this lane.
- Service worker and IndexedDB inside the WebView (`https://localhost`) are expected to work but are untested.
- HealthKit path is untested and cannot ship without the paid Apple account.
- Live app config (Supabase URL and anon key, VAPID key) comes from Vite env at build time. Check them before building the APK.
