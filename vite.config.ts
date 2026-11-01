/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

declare const process: { cwd(): string; env: Record<string, string | undefined> } // no @types/node in this repo
import { VitePWA } from 'vite-plugin-pwa'

// A production build without Supabase env would open the app with no sign-in. Fail it, unless the e2e test build opts out.
const allowNoAuth = process.env.BANTAY_ALLOW_NO_AUTH === '1'

// Test files that stub window.location: they need the forks pool (see test.projects below). Each project sets its own include: extends:true concatenates arrays.
const FORKS_ONLY = ['src/features/sos/call.test.ts', 'src/features/sos/sosFlow.test.tsx']

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (command === 'build' && !allowNoAuth && !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for a production build (BANTAY_ALLOW_NO_AUTH=1 is for the e2e test build only).')
  }
  return {
  define: { __ALLOW_NO_AUTH__: JSON.stringify(allowNoAuth) },
  // admin.html is the web admin (/admin). SYNC_HARNESS=1 / DOCS_HARNESS=1 also build the test pages the sync and docs e2e specs drive. Off by default: not shipped.
  build: { rollupOptions: { input: { main: 'index.html', admin: 'admin.html', ...(process.env.SYNC_HARNESS ? { harness: 'sync-harness.html' } : {}), ...(process.env.DOCS_HARNESS ? { docs: 'docs-harness.html' } : {}) } } },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg', 'anatomy/body.svg'],
      // Jack 128, 256 and 384 sizes (JackArt serves 384 for the 96 and 112 slots) so the offline band's Jack shows with no network; the 1024s stay online-only.
      injectManifest: { globPatterns: ['**/*.{js,css,html}', 'assets/jack-*-{128,256,384}-*.webp'] },
      manifest: {
        name: 'Family Bantay',
        short_name: 'Bantay',
        description: 'Your family’s health, weather and safety, in one place.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F6F1E7',
        theme_color: '#1F3D2B',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    css: true, // so `tokens.css?raw` returns the real file in chart.test.ts
    vmMemoryLimit: '300MB', // root-only option; ignored inside a project (see below)
    testTimeout: 15000, // ponytail: parallel lanes load the PC; raise only if a real test needs more
    // vmThreads makes one jsdom per worker instead of one per file (jsdom setup was 48% of the forks run).
    // Each file still gets a fresh module graph and globals. vmThreads leaks memory per file, so a worker is recycled at 300 MB
    // (4-core run: peak 1.3-1.6 GB, 86 s; uncapped 4.4 GB, 69 s; forks 1.1 GB, 251 s). Files that redefine window.location cannot run there
    // (jsdom's real location is non-configurable), so they stay on forks.
    projects: [
      { extends: true, test: { name: 'unit', pool: 'vmThreads', include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'], exclude: FORKS_ONLY } },
      { extends: true, test: { name: 'forks', pool: 'forks', include: FORKS_ONLY } }
    ]
  }
}
})
