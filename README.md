# Family Bantay

Vite + React + TS PWA. Design source: `design/Prototype.dc.html` (v5).

1. `npm install`
2. `npm run dev` for local work
3. `npm test` runs Vitest (jsdom, fake-indexeddb)
4. `npm run build` type-checks and builds the PWA (service worker from `src/sw.ts`)
5. `npx playwright install chromium` once, then `npm run e2e` (builds, serves on port 4317)
6. Copy `.env.example` to `.env.local` and add the publishable key. Never commit it.

## Fast checks while iterating

The full Vitest suite takes about 1.5 to 2 minutes (vmThreads pool, see `vite.config.ts`). Run only what your change touches, then the full suite once before a push or release.

| Script | Runs |
| --- | --- |
| `npm run test:affected` | Test files that import (directly or through other files) anything changed since `origin/main`, committed or not. Run `git fetch origin main` first so the base is current |
| `npm run test:changed` | Same, but only for uncommitted changes |
| `npm run test:related -- src/lib/labFormat.ts` | Test files that depend on the files you name |
| `npm run typecheck` | `tsc --noEmit`, incremental (cache in `node_modules/.cache/tsc.tsbuildinfo`) |
| `npm run e2e:changed` | Only Playwright spec files changed since `origin/main` (the specs drive the built app, so a `src/` change alone selects none: use `npm run e2e` for that) |

Caches (all local, all under `node_modules`, nothing to configure): Vitest keeps transformed modules in `node_modules/.vitest-cache` and run results in `node_modules/.vite/vitest` (failed and slow files run first). `npx vitest --clearCache` resets both. A change to `src/test-setup.ts`, `vite.config.ts` or `package.json` makes `test:affected` run the whole suite, which is correct.

## Setup

- Sign-in, Supabase SQL (migrations 0001 to 0005 in order), secrets and function deploys: [docs/AUTH.md](docs/AUTH.md)
- Ask Bantay assistant (n8n + OpenRouter): [docs/ASSISTANT.md](docs/ASSISTANT.md)
- Android and iOS apps: [docs/NATIVE.md](docs/NATIVE.md)

Build env (set at build time, never commit values):

| Name | What |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `VITE_VAPID_PUBLIC_KEY` | Same value as the `VAPID_PUBLIC_KEY` function secret |
| `VITE_ASSISTANT_PROVIDER` | Optional. `edge` sends Jack to the Supabase function `ask`; unset or `n8n` keeps the webhook |
| `VITE_ASSISTANT_URL` | n8n assistant webhook URL (used unless provider is `edge`) |
| `VITE_ASSISTANT_DAILY_CAP` | Optional. Messages per day, default 30 |
| `VITE_KIWIX_URL` | Offline library URL |
| `VITE_APP_VERSION` | Version label recorded with usage events |
