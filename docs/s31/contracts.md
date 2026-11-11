# S31 contract (Lloyd approved 2026-11-11: "Approve, build it")

Goal: one link (bantay.pages.dev/get) that installs Bantay when missing and, when installed, opens a "Set up everything" screen; every app icon generated from one source.
Platform limits (state them in the UI, never pretend): Android needs one Install tap (and once, "allow installs from this source"); iPhone needs Share > Add to Home Screen; notifications need one Allow tap.

Base: main ea79cde6 + this file. Every lane rebases on the commit that adds this file.

| Lane | Owns (only these) | PW_PORT |
|---|---|---|
| L1 Link + setup | public/get/**, android/app/src/main/AndroidManifest.xml (deep link intent filter only), src/features/setup/All*.tsx + new helpers under src/features/setup/all/**, the route entry for #setup/all, the appUrlOpen handler for ph.bantay.family://setup (src/features/auth/nativeOAuth.ts may only gain a non-auth branch or a sibling file), src/features/update/** (auto download), e2e/s31-setup*.spec.ts | 5341 |
| L2 Icons | one icon source under assets/icon/**, generated android/app/src/main/res/mipmap-*/** and drawable notification icon, public/icons/** + manifest icons in vite.config.ts (icons block only) and index.html icon links, splash drawables, scripts/icons/** generator, e2e/s31-icons*.spec.ts | 5342 |

Shared names
- Deep link: `ph.bantay.family://setup` opens `#setup/all`. Web fallback: `https://bantay.pages.dev/#setup/all`.
- Icon version: `ICON_VERSION` (string, e.g. "2026-11-11") exported from src/features/update/iconVersion.ts (L2 writes the file; L1 may read it). latest.json gains no new field; the APK version carries the launcher icon.
- APK version for this release: 2.9.0 (versionCode 2009000), passed by scripts/release-apk.ps1. Lanes never build or publish an APK.

Rules
- Never install, grant or download anything without the person's tap where the OS requires one; say what each tap does in plain words.
- No new third-party host. No tracking. Rule A (D-184) for UI (e2e/s29-cards.spec.ts at 4 sizes).
- Never deploy, push, publish a release or edit latest.json. The orchestrator does.
- Playwright `--workers=1`. Repo is PUBLIC: no family names.
