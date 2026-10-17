import { ALERTS_KEY, type Alert, type LatLon, rankAlerts } from './alerts'
import AlertCard from './AlertCard'
import { useKv } from './store'
import './safety.css'

export { ALERTS_KEY }
const NONE: Alert[] = []

/** Ranked official warnings. The sync layer writes the list to Dexie kv 'safety.alerts'.
 *  `loc` is the phone's current position when known (L5 provides it); null ranks by the home zone. */
export default function SafetyBrief({ loc = null, limit }: { loc?: LatLon | null; limit?: number }) {
  const all = useKv<Alert[]>(ALERTS_KEY, NONE)
  const shown = rankAlerts(all, loc).slice(0, limit ?? all.length)
  if (!shown.length)
    return <p className="sf-empty" role="status">No active warnings for Dampas right now. Official bulletins always come first.</p>
  return (
    <section className="sf" aria-label="Active warnings">
      {shown.map((a) => <AlertCard key={a.id} alert={a} />)}
      {limit != null && all.length > limit && <p className="sf-empty">{all.length - limit} more on the Safety tab.</p>}
    </section>
  )
}
