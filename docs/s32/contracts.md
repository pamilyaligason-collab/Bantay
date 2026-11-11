# S32 contract (Lloyd approved 2026-11-11: "Yes, build auto-update")

Goal: Android updates itself. No new website trick: the first install still needs the OS Install tap.
Base: main + this file.

| Lane | Owns (only these) | PW_PORT |
|---|---|---|
| L1 Auto-update | src/features/update/** (new autoUpdate.ts + hook-up), the one-line start call in src/main.tsx or App.tsx, android/app/src/main/java/ph/bantay/family/AppUpdaterPlugin.java only if a change is truly needed, e2e/s32-*.spec.ts | 5351 |

Behaviour
- Native Android only. On app start and on resume (at most once every 6 h, kv update.autoAt), read latest.json; if versionCode is newer than the running shell: download (respect the existing update.wifiOnly setting; default Wi-Fi only), SHA-256 check (existing), then install with the existing PackageInstaller session (USER_ACTION_NOT_REQUIRED where Android allows it).
- If Android needs a tap (STATUS_PENDING_USER_ACTION, or "Install unknown apps" not allowed yet): one local notification "Bantay update ready: tap to install", plus the existing update sheet. Never more than one such notice a day.
- A setting in Settings > Phone: "Update Bantay by itself" (default on), off stops all automatic checks.
- Never while a call/SOS is active, never on mobile data when wifiOnly, never a downgrade, never a URL outside the existing GitHub allow-list.
- Web build: unchanged (service worker updates).

Rules: never publish, push or edit public/latest.json. Repo is PUBLIC. Senior-first copy. Playwright --workers=1.
