import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ph.bantay.family',
  appName: 'Family Bantay',
  webDir: 'dist',
  // The family APK opens the live site so sign-in (ALLOWED_ORIGIN = bantay.pages.dev) works and updates need no reinstall.
  // ponytail: remote server.url is fine for sideloading; a Play Store build needs bundled assets plus an app origin on the server allowlist.
  // Google sign-in returns on ph.bantay.family://auth-callback: it must be in Supabase Auth > URL Configuration > Redirect URLs.
  // CAP_SERVER_URL points a test build (2.3.0-rc) at a Pages branch preview; unset = production.
  server: { url: process.env.CAP_SERVER_URL ?? 'https://bantay.pages.dev', cleartext: false }
}

export default config
