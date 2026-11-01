import { alertRef } from '../location/place'
import { usePlace } from '../location/useLocation'
import { ALERTS_KEY, rankAlerts, type Alert } from '../safety/alerts'
import { useKv } from '../safety/store'
import { liveSignals } from '../safety/stormMode'
import { zoneAlert } from './heroCards'
import { slotPool } from './WarningCard'
import { ACK_KEY, isAcked, type AckMap } from './warnAck'

const NONE: Alert[] = []
const NO_ACK: AckMap = {}
const SHOW = 3

/** Other notices for the member's area (power, water, air, smaller warnings) under the hero. The alert already on the hero card is left out.
 *  Nothing to show: nothing is drawn (the hero says all is calm). Rows open the Safety tab. */
export default function NearbyList() {
  const place = usePlace()
  const all = useKv<Alert[]>(ALERTS_KEY, NONE)
  const ref = place ? alertRef(place) : null
  const acks = useKv<AckMap>(ACK_KEY, NO_ACK)
  const storm = liveSignals(all)[0]
  const top = zoneAlert(slotPool(all, acks, !!storm), ref)
  // a closed warning stays out of the list too (it is "Hidden here"), and a live storm already has its own card
  const rest = rankAlerts(all.filter((a) => a.id !== top?.id && a.id !== storm?.id && !isAcked(acks, a)), ref)
  if (!rest.length) return null
  return (
    <section aria-label="Other notices for your area" data-reveal>
      <div className="card td-list">
        {rest.slice(0, SHOW).map((a) => (
          <a key={a.id} className="td-lrow press" href="#safety/warnings">
            <span className="td-grow"><b>{a.title}</b><span className="td-sub">{a.where} · {a.source}</span></span>
          </a>
        ))}
        {rest.length > SHOW && <a className="td-lrow td-more press" href="#safety/warnings">{rest.length - SHOW} more on the Safety tab</a>}
      </div>
    </section>
  )
}
