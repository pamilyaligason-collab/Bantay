import { useEffect, useState } from 'react'
import { HOME_UNIT } from '../location/geo'
import { coversHere } from './dial'
import type { Entry } from './entries'
import { FLAGS } from './flags'
import { cleanup, loadPack, syncPacks } from './packs'
import { claims, loadUnits, type Unit, UnitTracker, unitAt } from './unitAt'

interface PlaceLike { source: string; zone: string; weather: { lat: number; lon: number } }

// shortcut: the tracker lives for the page load; a restart takes the first fix at once. Upgrade to a kv row if restarts flap.
export const tracker = new UnitTracker()

/** The pack unit for this place. A picked home zone is its own unit; a GPS place is looked up on the phone, with the border hysteresis. Null when the flag is off. */
export const useUnit = (place: PlaceLike | null): string | null => useUnitInfo(place).unit

/** The unit plus whether it is PROVEN: a picked home zone, or a position that an outline puts inside it. A GPS place that only falls in the 30 km home circle (no outlines file shipped) is not proven. */
export function useUnitInfo(place: PlaceLike | null): { unit: string | null; proven: boolean } {
  const [info, setInfo] = useState<{ unit: string | null; proven: boolean; key: string }>({ unit: null, proven: false, key: '' })
  const lat = place?.weather.lat, lon = place?.weather.lon
  const key = `${place?.source}|${place?.zone}|${lat}|${lon}`
  useEffect(() => {
    if (!FLAGS.localPacks || !place || lat === undefined || lon === undefined) return
    let live = true
    setInfo((i) => ({ ...i, proven: false })) // a new place never inherits the last place's proof
    void (async () => {
      // No outlines file shipped yet: a place inside a home area still gets that home unit (same test as the old lists), anywhere else gets none.
      // loadUnits gets 5 s: on a poor signal the place stays unproven (and the home-circle fallback answers) rather than waiting.
      let timer: ReturnType<typeof setTimeout> | undefined
      const units = place.source === 'zone' ? [] : await Promise.race([loadUnits(), new Promise<Unit[]>((r) => { timer = setTimeout(() => r([]), 5000) })]).finally(() => clearTimeout(timer))
      const u = place.source === 'zone' || !units.length ? (coversHere(place) ? (HOME_UNIT[place.zone] ?? null) : null) : unitAt({ lat, lon }, units)
      const cur = u !== null && place.source === 'zone' ? u : tracker.push(u, Date.now())
      // Proven only for a picked zone, or when an outline put THIS position in the unit we are returning (the tracker may still hold the old unit: a point in no outline, or a pending switch).
      if (live) setInfo({ unit: cur, proven: cur !== null && (place.source === 'zone' || (units.length > 0 && u === cur && claims({ lat, lon }, units) === 1)), key })
    })().catch(() => { if (live) setInfo({ unit: null, proven: false, key }) })
    return () => { live = false }
  }, [lat, lon, place?.source, place?.zone]) // eslint-disable-line react-hooks/exhaustive-deps
  return { unit: info.unit, proven: info.proven && info.key === key }
}

/** Rows for the unit: from the phone at once, then refreshed after a background sync. Null = flag off or no pack for this place. */
export function usePackEntries(place: PlaceLike | null): { unit: string | null; entries: Entry[] | null } {
  const unit = useUnit(place)
  const [state, setState] = useState<{ unit: string | null; entries: Entry[] | null }>({ unit: null, entries: null })
  useEffect(() => {
    if (!FLAGS.localPacks || !unit) { setState({ unit: null, entries: null }); return }
    let live = true
    void (async () => {
      const first = await loadPack(unit)
      if (live && first) setState({ unit, entries: first })
      const r = await syncPacks(unit)
      if (r.fetched.length) { const again = await loadPack(unit); if (live && again) setState({ unit, entries: again }) }
      await cleanup().catch(() => undefined)
    })().catch(() => undefined)
    return () => { live = false }
  }, [unit])
  return state.unit === unit ? state : { unit, entries: null } // never show the last unit's rows for a new place
}
