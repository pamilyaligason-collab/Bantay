import { alertRef } from '../location/place'
import { usePlace } from '../location/useLocation'
import { ALERTS_KEY, allQuiet, type Alert, type LatLon, rankAlerts } from './alerts'
import AlertCard, { useNow } from './AlertCard'
import { useKv } from './store'
import './safety.css'

export { ALERTS_KEY }
const NONE: Alert[] = []

/** Ranked official warnings. The sync layer writes the list to Dexie kv 'safety.alerts'.
 *  `loc` overrides the phone's current position (D-27); left out, the D-33 place is used: the phone inside the Philippines, else the saved zone (never a foreign point). */
export default function SafetyBrief({ loc, limit }: { loc?: LatLon | null; limit?: number }) {
  const place = usePlace()
  const all = useKv<Alert[]>(ALERTS_KEY, NONE)
  const now = useNow() // a fresh row turns quiet with time; keeps the cards in step with the Warnings hero
  const ref = loc === undefined ? (place ? alertRef(place) : null) : loc
  const shown = rankAlerts(all, ref).slice(0, limit ?? all.length)
  const quietOk = allQuiet(all, ref, now) // the whole list, not the slice: a row behind the limit still counts
  if (!shown.length)
    return <p className="sf-empty" role="status">No active warnings for your area right now. Official bulletins always come first.</p>
  return (
    <section className="sf" aria-label="Active warnings">
      {shown.map((a) => <AlertCard key={a.id} alert={a} quietOk={quietOk} />)}
      {limit != null && all.length > limit && <p className="sf-empty">{all.length - limit} more on the Safety tab.</p>}
    </section>
  )
}
