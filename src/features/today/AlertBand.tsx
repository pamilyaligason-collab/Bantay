import { alertRef } from '../location/place'
import { usePlace } from '../location/useLocation'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { useKv } from '../safety/store'
import { zoneAlert } from './heroCards'

const NONE: Alert[] = []

/** The top band of Today, drawn only while an official warning (PAGASA, PHIVOLCS) is active for the area. No warning: nothing. No motion. */
export default function AlertBand() {
  const place = usePlace()
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const a = zoneAlert(alerts, place ? alertRef(place) : null)
  if (!a) return null
  return (
    <section className="td-alertband" role="region" aria-label="Active warning">
      <div className="td-k">Warning · {a.where} · {a.source}</div>
      <h2>{a.title}</h2>
      <p>{a.doNow}</p>
      <div className="td-act"><a className="td-pill light" href="#safety/warnings">What to do</a></div>
    </section>
  )
}
