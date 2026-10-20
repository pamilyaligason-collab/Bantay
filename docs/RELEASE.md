# Releasing the Android app

APKs and `latest.json` live on GitHub Releases of `pamilyaligason-collab/Bantay` (Cloudflare Pages has a 25 MiB per-file limit, so APKs never go on Pages). The in-app updater reads `releases/latest/download/latest.json`. The `/get` page (`public/get/index.html`) reads the same-origin copy `/latest.json` (`public/latest.json`), which the release script writes and commits as `release: latest.json <version>`; push that commit so Pages serves it.

## One-time: signing key

Lloyd's step, never done by an agent. The key and its passwords never enter the repo, chat or vault.

1. `keytool -genkeypair -v -keystore D:\Claude\Bantay-keys\bantay-release.jks -alias bantay -keyalg RSA -keysize 4096 -validity 10000`
2. Write `android/keystore.properties` (git-ignored) with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`.
3. Back the `.jks` up offline. Losing it means every member must uninstall Bantay to update.

## Each release (GitHub, no PC needed)

GitHub > Actions > **Release Android app** > Run workflow (the GitHub phone app works too). Type the notes; leave the
version empty for the next patch (2.1.0 -> 2.1.1) or type one. The workflow runs the tests, builds and signs the APK,
refuses to publish if it is not signed with the family key (`ANDROID_CERT_SHA256`), creates release `v<version>` with the
three files, and commits `public/latest.json` to main (Pages then serves `/get`). Phones on the APK see the update in
the app. A failed run publishes nothing; fix and run it again.

One-time setup, in repo Settings > Secrets and variables > Actions (Lloyd's step; the key never leaves GitHub secrets):
- secret `ANDROID_KEYSTORE_BASE64`: the `.jks` as base64; secret `ANDROID_KEYSTORE_PASSWORD`: its password (store and key are the same, PKCS12).
- variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (public build values) and `ANDROID_CERT_SHA256`
  (`bd95d4fd50fabcbf17d3d0979e8fb46e47a3daf46ccaf080ae754fa9f66cc218`, the certificate of the v2.1.0 APK).

## Each release (from the PC, fallback)

```powershell
.\scripts\release-apk.ps1 -Version 2.0.1 -Notes "Faster sign-in." -DryRun   # builds, prints latest.json, writes scripts/fixtures/latest.sample.json, no release
.\scripts\release-apk.ps1 -Version 2.0.1 -Notes "Faster sign-in."            # same, then gh release create v2.0.1
```

- versionCode = major*1_000_000 + minor*1_000 + patch (2.0.1 -> 2000001).
- `-MinShell` (default 2000000): shells older than this get the full-screen "update required" screen. Raise it only for a breaking native change.
- The release needs the production Supabase env in the build (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`). Use the `pamilyaligason-collab` gh account (repo-local credential helper).
- Assets per release: `bantay-<v>.apk` (versioned, named in `latest.json`), `bantay.apk` (stable name for `/get`), `latest.json`.
- The script stops at the first failing step. `-ApkPath` (with `-DryRun`) skips the build and hashes a given file; it exists to test the `latest.json` part only.

## Known limits

- `/get` shows version, size and SHA-256 from `/latest.json` (same origin, so no CORS problem; GitHub release assets send no CORS headers). If it cannot be read the facts line stays hidden and the Download button still works.
- Old installed web app: the banner (`PwaBanner`) tells Android users to switch. On the first APK sign-in the server should drop that member's Android web-push subscriptions (delete rows where member = me, user agent like `%Android%`, endpoint not FCM). That is a P3 follow-up when FCM lands.
- `getInstalledRelatedApps` for a sideloaded APK is UNVERIFIED, so the web manifest has no `related_applications`.
