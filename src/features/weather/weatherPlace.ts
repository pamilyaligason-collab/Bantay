import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../../db'
import type { LatLon } from '../location/geo'
import { weatherFixState } from '../location/freshness'
import { useLocation, usePlaceFrom } from '../location/useLocation'
import { putKv } from '../safety/store'

export const FOLLOW_KEY = 'wx.follow'

/** D-163: the ONE place-for-weather rule, so Today, Safety and the Weather screen forecast the same point and print the same "Forecast for <place>".
 *  A fix older than 6 h is no fix (S22 G); a zone picked by hand wins over a fix until "Current" is picked again (kv `wx.follow`).
 *  `point` is null while the follow answer is still being read and a fix exists (no forecast for a point the pick may override). */
export function useWeatherPlace() {
  const gpsLoc = useLocation()
  const [follow, setFollow] = useState<'zone' | 'gps' | null | undefined>(undefined) // undefined until kv answered
  useEffect(() => {
    const sub = liveQuery(() => db.kv.get(FOLLOW_KEY)).subscribe({ next: (r) => setFollow((r?.value as 'zone' | 'gps' | undefined) ?? null), error: () => setFollow(null) })
    return () => sub.unsubscribe()
  }, [])
  const rawFix = gpsLoc.source === 'gps' || gpsLoc.source === 'last'
  const dropped = rawFix && weatherFixState(gpsLoc.at, Date.now()) === 'drop'
  const hasFix = rawFix && !dropped
  const zoneWins = (follow === 'zone' && hasFix) || dropped
  const l = useMemo(() => {
    const ask = async () => { void putKv(FOLLOW_KEY, 'gps'); return gpsLoc.ask() }
    // read as "no fix": the place, the zone chip and the forecast then all follow the picked zone
    return zoneWins ? { ...gpsLoc, source: 'home' as const, ask } : { ...gpsLoc, ask }
  }, [gpsLoc, zoneWins])
  const place = usePlaceFrom(l)
  const fix: LatLon | null = follow !== undefined && !zoneWins && (l.source === 'gps' || l.source === 'last') ? { lat: l.lat, lon: l.lon } : null
  // a position wins, unless the place fell back to a home zone (a fix abroad): the forecast follows the label
  const point: LatLon | null = follow === undefined && hasFix ? null : (place?.source !== 'zone' ? fix : null) ?? place?.weather ?? null
  return { gpsLoc, l, place, point, fix, follow, rawFix, hasFix, zoneWins }
}
