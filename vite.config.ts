/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

declare const process: { env: Record<string, string | undefined> } // no @types/node in this repo

export default defineConfig({
  // SYNC_HARNESS=1 also builds sync-harness.html, the page the sync e2e spec drives. Off by default: not shipped.
  build: process.env.SYNC_HARNESS ? { rollupOptions: { input: { main: 'index.html', harness: 'sync-harness.html' } } } : {},
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
    include: ['src/**/*.test.{ts,tsx}']
  }
})
