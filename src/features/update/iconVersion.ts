// S31 L2: one icon set, one version. Bump ICON_VERSION when assets/icon/** changes and run `npm run icons`:
// the generator writes public/icons/<name>-<slug>.png, so a new set has new file names and no cache can serve the old one.
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
const CACHE_PREFIX = 'bantay-icons-'

/** Service worker install hook: fetch this version's icons into their own cache and drop the caches of older icon sets. */
export async function refreshIcons(store: Pick<CacheStorage, 'open' | 'keys' | 'delete'>, get: (url: string) => Promise<Response>, v: string = ICON_VERSION): Promise<boolean> {
  const current = CACHE_PREFIX + iconSlug(v)
  try {
    const c = await store.open(current)
    for (const { name } of WEB_ICONS) {
      const url = iconUrl(name, v)
      if (await c.match(url)) continue
      const r = await get(url)
      if (!r.ok) throw new Error('icon ' + url + ' ' + r.status) // a failed set is never kept half-filled as "current"
      await c.put(url, r)
    }
    for (const k of await store.keys()) if (k.startsWith(CACHE_PREFIX) && k !== current) await store.delete(k)
    return true
  } catch {
    await store.delete(current).catch(() => false)
    return false // offline or a missing file: the next service worker update tries again, the precache still serves the files
  }
}
