import { alertRef } from '../location/place'
import { usePlace } from '../location/useLocation'
import { ALERTS_KEY, type Alert, affectsUs, freshness, freshText, newestChecked, outdatedLine, plainWhat } from '../safety/alerts'
import { useNow } from '../safety/AlertCard'
import { useKv } from '../safety/store'
import { zoneAlert } from './heroCards'

const NONE: Alert[] = []

/** The top band of Today, drawn only while an official warning is active for the area. No warning: nothing. No motion.
 *  It says whether the warning reaches the family, when alerts were last checked, and (amber) when that is too long ago. */
export default function AlertBand() {
  const place = usePlace()
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const now = useNow()
  const ref = place ? alertRef(place) : null
  const a = zoneAlert(alerts, ref)
  if (!a) return null
  const who = affectsUs(a, ref)
  const f = freshness(newestChecked(alerts), now)
  return (
    <section className="td-alertband" role="region" aria-label="Active warning">
      <div className="td-k">{who.affects ? 'Warning' : 'Nearby report'} · {a.where} · {a.source}</div>
      <h2>{a.title}</h2>
      {a.kind === 'gdacs' && plainWhat(a) && <p>{plainWhat(a)}</p>}
      <p><b>{who.line}</b>{who.km != null && ` (${who.km} km away)`}</p>
      {who.steps && <p>{a.doNow}</p>}
      <p>{freshText(f)}</p>
      {f.tone !== 'ok' && <p role="status">{outdatedLine(newestChecked(alerts))}</p>}
      <div className="td-act"><a className="td-pill light" href="#safety/warnings">{who.affects ? 'What to do' : 'See details'}</a></div>
    </section>
  )
}
