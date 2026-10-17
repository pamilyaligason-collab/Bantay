import { defineConfig, devices } from '@playwright/test'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

const PORT = 4317

export default defineConfig({
  testDir: 'e2e',
  reporter: 'list',
  use: { baseURL: `http://localhost:${PORT}` },
  // PW_CHANNEL=chrome runs against an installed Chrome when the bundled chromium is not downloaded.
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000
  }
})
