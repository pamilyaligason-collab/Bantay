import { useEffect } from 'react'
import { basemapEntries, downloadBasemap, type StoredBasemap, useStoredBasemaps } from './basemap'
import { FLAGS } from './flags'
import { getIndex, type PackIndex, strictWifi, syncPacks } from './packs'
import { useKv } from './store'

/** The Offline maps screen keeps its settings here; `autoDownload` (default on) is the "Download maps automatically" switch. */
export const OFFLINE_PREFS_KEY = 'safety.offlinePrefs'

const inBox = (b: readonly number[], lat: number, lon: number) => lon >= b[0]! && lon <= b[2]! && lat >= b[1]! && lat <= b[3]!

/** The regional basemap to fetch for this place: listed in the index, covering the place, not already on the phone. Null when nothing is due (unknown place, no listing, already stored). */
export function autoTarget(index: PackIndex | null, stored: StoredBasemap[], lat: number | null | undefined, lon: number | null | undefined): string | null {
  if (typeof lat !== 'number' || typeof lon !== 'number' || !index) return null
  const hit = basemapEntries(index).find((e) => e.code !== 'world' && inBox(e.bounds, lat, lon))
  return hit && !stored.some((s) => s.code === hit.code && s.checksum === hit.checksum) ? hit.code : null
}

const tried = new Set<string>() // once per app session per map: a failure waits for the next launch or the Download button

/** The home area's basemap downloads by itself, once, on Wi-Fi or ethernet (never mobile data, never unknown connection type), unless the person turned it off. */
export function useAutoBasemap(lat: number | null | undefined, lon: number | null | undefined): void {
  const prefs = useKv<{ autoDownload?: boolean } | undefined>(OFFLINE_PREFS_KEY, undefined)
  const stored = useStoredBasemaps()
  const on = FLAGS.offlineMaps && prefs?.autoDownload !== false
  useEffect(() => {
    if (!on || typeof lat !== 'number' || typeof lon !== 'number' || !strictWifi() || (typeof navigator !== 'undefined' && !navigator.onLine)) return
    let live = true
    void (async () => {
      const code = autoTarget(await getIndex().catch(() => null), stored, lat, lon)
      if (!code || !live || tried.has(code)) return
      tried.add(code)
      let r = await downloadBasemap(code) // not tapped: it waits unless strictWifi() holds
      if (r === 'none') { await syncPacks(code); r = await downloadBasemap(code) } // the pack row must exist first
    })().catch(() => undefined)
    return () => { live = false }
  }, [on, lat, lon, stored.length]) // eslint-disable-line react-hooks/exhaustive-deps -- stored is read for its length only
}
