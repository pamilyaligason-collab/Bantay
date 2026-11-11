// S31 L2: one icon set, one version. Bump ICON_VERSION when assets/icon/** changes and run `npm run icons`:
// the generator writes public/icons/<name>-<slug>.png, so a new set has new file names; the Workbox precache (vite-plugin-pwa) fetches them on the next service worker update.
export const ICON_VERSION = '2026-11-11'
export const iconSlug = (v: string = ICON_VERSION) => v.replace(/-/g, '')
/** Web icon files under public/icons (name, pixel size). The generator and the tests read this list too. */
export const WEB_ICONS = [
  { name: 'icon-192', size: 192 },
  { name: 'icon-512', size: 512 },
  { name: 'icon-maskable-512', size: 512 },
  { name: 'apple-touch-icon', size: 180 },
  { name: 'favicon-32', size: 32 },
  { name: 'favicon-16', size: 16 }
] as const
export const iconUrl = (name: string, v: string = ICON_VERSION) => `/icons/${name}-${iconSlug(v)}.png`
