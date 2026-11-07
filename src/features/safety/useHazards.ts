import { useCallback, useEffect, useState } from 'react'
import { db } from '../../db'
import { FLAGS } from './flags'
import type { HazardLevels } from './hazardLookup' // type only: the reader itself is imported lazily below
import { downloadHazards, getIndex, packFileUrl, syncPacks } from './packs'
import { useUnitInfo } from './usePacks'

interface PlaceLike { source: string; zone: string; weather: { lat: number; lon: number } }
export interface HazardState {
  /** 'off' = flag off; 'ready' = levels read from the phone; 'missing' = no hazard file on this phone for this place. */
  status: 'off' | 'checking' | 'ready' | 'missing'
  levels: HazardLevels | null
  /** Size in bytes of the file the member can tap to download, when the server lists one. */
  size: number | null
  busy: boolean
  download: () => void
  /** True when 'ready' levels were read online from the public file (HAZ-ONLINE), not from a file on this phone. */
  online?: boolean
  /** Why there is no reading when 'missing': the area is not saved on this phone (offline or not downloaded yet), or NOAH has no pack for it. */
  gap?: 'offline' | 'nopack' | 'unread' | null
}

/** Hazard levels for the place from the unit's NOAH file. The file downloads by itself on Wi-Fi, or when the member taps. Never reads without a file on the phone. */
export function useHazards(place: PlaceLike | null): HazardState {
  const { unit, proven } = useUnitInfo(place)
  const [s, setS] = useState<{ status: HazardState['status']; levels: HazardLevels | null; size: number | null; at?: string; online?: boolean; gap?: HazardState['gap'] }>({ status: 'off', levels: null, size: null })
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const lat = place?.weather.lat, lon = place?.weather.lon
  const where = `${lat}|${lon}`
  useEffect(() => {
    if (!FLAGS.localPacks || !unit || lat === undefined || lon === undefined) { setS({ status: 'off', levels: null, size: null }); return }
    // "No mapped hazard" is only true for a point inside the unit the file covers. A GPS place that merely falls in the 30 km home circle is not proven (no outlines file): not checked.
    if (!proven) { setS({ status: 'ready', levels: { flood: null, landslide: null, surge: null }, size: null }); return }
    let live = true
    void (async () => {
      const row = await db.packs.get(unit)
      const owner = row?.hazardsFrom ? await db.packs.get(row.hazardsFrom) : row
      if (owner?.hazards) {
        const { hazardsAt, blobBytes } = await import('./hazardLookup') // lazy: the reader is only needed here
        const b = owner.hazards.bounds
        const levels = await hazardsAt({ lat, lon }, blobBytes(owner.hazards.blob), b && !Array.isArray(b) ? b : undefined)
        if (live) setS({ status: 'ready', levels, size: null, at: where })
        return
      }
      if (live) setS((o) => ({ ...o, status: 'missing', levels: null }))
      const idx = await getIndex()
      const size = idx?.packs.find((p) => p.code === unit)?.hazards?.size ?? null
      const hz = idx?.packs.find((p) => p.code === unit)?.hazards
      const gap = idx && !hz ? 'nopack' as const : 'offline' as const // only a loaded index can say NOAH has nothing here; no index = we cannot tell, so say "not saved"
      if (live) setS({ status: 'missing', levels: null, size, gap })
      // Online fallback: read just this point from the public file with Range requests. Order: stored file > online > empty. Failure leaves the empty state.
      const url = hz ? packFileUrl(hz.path) : null
      const isOnline = typeof navigator === 'undefined' || navigator.onLine !== false
      // The Wi-Fi download starts first and the online read runs beside it, so a slow host never delays the download.
      const wifi = !tick ? (async () => { // Wi-Fi only; mobile data waits for the tap
        await syncPacks(unit)
        if ((await downloadHazards(unit)) === 'done' && live) setTick(1)
      })().catch(() => undefined) : Promise.resolve() // a failed sync never undoes a good online reading
      if (hz && url && isOnline) {
        try {
          const { hazardsOnline } = await import('./hazardLookup')
          const levels = await hazardsOnline({ lat, lon }, url, hz.checksum, hz.bounds && !Array.isArray(hz.bounds) ? hz.bounds : undefined)
          // A failed read throws (metadata, range, status). All null after a good read = the point is outside every layer's bounds: 'Not checked', as with a stored file.
          if (live) setS({ status: 'ready', levels, size, at: where, online: true })
        } catch { if (live) setS({ status: 'missing', levels: null, size, gap: 'unread' }) }
      }
      await wifi
    })().catch(() => { if (live) setS({ status: 'missing', levels: null, size: null }) })
    return () => { live = false }
  }, [unit, proven, lat, lon, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const download = useCallback(() => {
    if (!unit) return
    setBusy(true)
    void syncPacks(unit, { tapped: true }).then(() => downloadHazards(unit, { tapped: true })).then((r) => { if (r === 'done') setTick((t) => t + 2) }).catch(() => undefined).finally(() => setBusy(false))
  }, [unit])
  // Never hand out levels read for a different place: until this place is proven, whatever was read before is replaced by "not checked".
  const levels = s.levels && (!proven || s.at !== where) ? { flood: null, landslide: null, surge: null } : s.levels
  return { ...s, levels, busy: busy, download }
}
