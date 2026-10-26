# Family Bantay

Vite + React + TS PWA. Design source: `design/Prototype.dc.html` (v5).

1. `npm install`
2. `npm run dev` for local work
3. `npm test` runs Vitest (jsdom, fake-indexeddb)
4. `npm run build` type-checks and builds the PWA (service worker from `src/sw.ts`)
5. `npx playwright install chromium` once, then `npm run e2e` (builds, serves on port 4317)
6. Copy `.env.example` to `.env.local` and add the publishable key. Never commit it.

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
