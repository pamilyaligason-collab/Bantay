import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'ph.bantay.family',
  appName: 'Family Bantay',
  webDir: 'dist',
  // The family APK opens the live site so sign-in (ALLOWED_ORIGIN = bantay.pages.dev) works and updates need no reinstall.
  // ponytail: remote server.url is fine for sideloading; a Play Store build needs bundled assets plus an app origin on the server allowlist.
  // Google sign-in returns on ph.bantay.family://auth-callback: it must be in Supabase Auth > URL Configuration > Redirect URLs.
  // CAP_SERVER_URL points a test build (2.3.0-rc) at a Pages branch preview; unset = production.
  server: { url: process.env.CAP_SERVER_URL || 'https://bantay.pages.dev', cleartext: false },
  plugins: {
    // S31 L2: the status-bar icon of local reminders. Must equal the drawable scripts/icons/generate.mjs writes (tested). Pushes use the manifest meta-data in docs/s31/manifest-icon-snippet.xml.
    LocalNotifications: { smallIcon: 'ic_stat_icon_config_sample', iconColor: '#1E6B4E' },
    // D-138, D-149: the daily place update while the app is closed. The script is bundled (public/runners/bgplace.js -> dist), not read from the live site.
    // It does nothing until the app arms it (src/features/family/bgPlace.ts). label must equal BG_PLACE_LABEL there; interval is minutes (Android runs it about once a day, never exactly).
    BackgroundRunner: { label: 'ph.bantay.family.place', src: 'runners/bgplace.js', event: 'dailyPlace', repeat: true, interval: 1440, autoStart: true }
  }
}

export default config
