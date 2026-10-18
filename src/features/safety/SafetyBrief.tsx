import { alertRef } from '../location/place'
import { usePlace } from '../location/useLocation'
import { ALERTS_KEY, type Alert, type LatLon, rankAlerts } from './alerts'
import AlertCard from './AlertCard'
import { useKv } from './store'
import './safety.css'

export { ALERTS_KEY }
const NONE: Alert[] = []

/** Ranked official warnings. The sync layer writes the list to Dexie kv 'safety.alerts'.
 *  `loc` overrides the phone's current position (D-27); left out, the D-33 place is used: the phone inside the Philippines, else the saved zone (never a foreign point). */
export default function SafetyBrief({ loc, limit }: { loc?: LatLon | null; limit?: number }) {
  const place = usePlace()
  const all = useKv<Alert[]>(ALERTS_KEY, NONE)
  const shown = rankAlerts(all, loc === undefined ? (place ? alertRef(place) : null) : loc).slice(0, limit ?? all.length)
  if (!shown.length)
    return <p className="sf-empty" role="status">No active warnings for your area right now. Official bulletins always come first.</p>
  return (
    <section className="sf" aria-label="Active warnings">
      {shown.map((a) => <AlertCard key={a.id} alert={a} />)}
      {limit != null && all.length > limit && <p className="sf-empty">{all.length - limit} more on the Safety tab.</p>}
    </section>
  )
}
