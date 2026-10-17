/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

declare const process: { cwd(): string; env: Record<string, string | undefined> } // no @types/node in this repo
import { VitePWA } from 'vite-plugin-pwa'

// A production build without Supabase env would open the app with no sign-in. Fail it, unless the e2e test build opts out.
const allowNoAuth = process.env.BANTAY_ALLOW_NO_AUTH === '1'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  if (command === 'build' && !allowNoAuth && !(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY)) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY for a production build (BANTAY_ALLOW_NO_AUTH=1 is for the e2e test build only).')
  }
  return {
  define: { __ALLOW_NO_AUTH__: JSON.stringify(allowNoAuth) },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Family Bantay',
        short_name: 'Bantay',
        description: 'Your family’s health, weather and safety, in one place.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F2F2F7',
        theme_color: '#F2F2F7',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    css: true, // so `tokens.css?raw` returns the real file in chart.test.ts
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts']
  }
}
})
