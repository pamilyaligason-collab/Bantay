import { defineConfig, devices } from '@playwright/test'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

const PORT = Number(process.env.PW_PORT ?? 4317) // lanes set PW_PORT so parallel runs do not collide
// The sign-in spec needs a build WITH Supabase env (the normal build has none, so AuthGate is bypassed). Test values only, nothing real.
const AUTH_PORT = PORT + 500
const AUTH_ENV = { VITE_SUPABASE_URL: 'https://bantay-test.supabase.test', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key' }

export default defineConfig({
  testDir: 'e2e',
  workers: 2, // ponytail: more workers time out on this PC (heavy bundle); raise on a bigger runner
  reporter: 'list',
  // PW_CHANNEL=chrome runs against an installed Chrome when the bundled chromium is not downloaded.
  projects: [
    { name: 'chromium', testIgnore: /(auth|records-db|medicines)\.spec/, use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL, baseURL: `http://localhost:${PORT}` } },
    { name: 'auth', testMatch: /(auth|records-db|medicines)\.spec/, use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL, baseURL: `http://localhost:${AUTH_PORT}`, serviceWorkers: 'block' } }
  ],
  webServer: [
    {
      command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
      env: { BANTAY_ALLOW_NO_AUTH: '1', DOCS_HARNESS: '1' }, // the e2e build has no Supabase env on purpose (see vite.config.ts); DOCS_HARNESS adds the docs test page
      url: `http://localhost:${PORT}`,
      reuseExistingServer: false,
      timeout: 180_000
    },
    {
      command: `npx vite build --outDir dist-auth && npx vite preview --outDir dist-auth --port ${AUTH_PORT} --strictPort`,
      env: AUTH_ENV,
      url: `http://localhost:${AUTH_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000
    }
  ]
})
