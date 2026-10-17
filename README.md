# Family Bantay

Vite + React + TS PWA. Design source: `design/Prototype.dc.html` (v5).

1. `npm install`
2. `npm run dev` for local work
3. `npm test` runs Vitest (jsdom, fake-indexeddb)
4. `npm run build` type-checks and builds the PWA (service worker from `src/sw.ts`)
5. `npx playwright install chromium` once, then `npm run e2e` (builds, serves on port 4317)
6. Copy `.env.example` to `.env.local` and add the publishable key. Never commit it.
