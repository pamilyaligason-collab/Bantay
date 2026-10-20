import { useMemo } from 'react'
import { usePlace } from '../location/useLocation'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { stormName } from '../safety/LiveMaps'
import { useKv } from '../safety/store'
import { awayText, nearbyStorm } from './stormView'

const NO_ALERTS: Alert[] = []

/** The storm within 500 km of my place, as Next up text (null when none). Shared by full Today and Simple mode. */
export function useStorm(): { title: string; body: string } | null {
  const place = usePlace()
  const alerts = useKv<Alert[]>(ALERTS_KEY, NO_ALERTS)
  const from = place?.weather ?? null
  const s = useMemo(() => nearbyStorm(alerts, from), [alerts, from?.lat, from?.lon]) // eslint-disable-line react-hooks/exhaustive-deps -- from is rebuilt each render; its numbers are the key
  return useMemo(() => (s ? { title: `${stormName(s)} is near`, body: `${s.level ? `${s.level} alert, ` : ''}${awayText(from, s) ?? 'check the tracker'}` } : null), [s]) // eslint-disable-line react-hooks/exhaustive-deps
}
