import { useMemo, useState } from 'react'
import { usePlace } from '../location/useLocation'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { stormName } from '../safety/LiveMaps'
import { useKv } from '../safety/store'
import { FAIL_TEXT } from './actions'
import type { HeroCard } from './heroCards'
import { joinNames, pickNext } from './nextPick'
import { usePlanCard } from './planCard'
import { awayText, nearbyStorm } from './stormView'
import { markDue, useDueMeds } from './useDueMeds'

const NO_ALERTS: Alert[] = []
export const MEDS_HREF = '#health/meds' // lane M2's medicines screen; until it lands the Health tab opens

/** Today's one "Next up" card: the dose due within 3 hours or missed in the last 2 (mine or someone I care for), else the plan, else a nearby storm,
 *  else all clear. A footer row counts medicines waiting for "Still taking it?". Weather has its own card. */
export default function NextUp({ notify }: { notify: (msg: string) => void }) {
  const place = usePlace()
  const alerts = useKv<Alert[]>(ALERTS_KEY, NO_ALERTS)
  const { due, review, tick } = useDueMeds()
  const [busy, setBusy] = useState(false)
  const plan = usePlanCard(tick)
  const from = place?.weather ?? null
  const s = nearbyStorm(alerts, from)
  const storm = s ? { title: `${stormName(s)} is near`, body: `${s.level ? `${s.level} alert, ` : ''}${awayText(from, s) ?? 'check the tracker'}` } : null

  const item = useMemo(
    () => pickNext({ due, plan: plan as HeroCard | null, storm }),
    [due, plan, storm?.title, storm?.body] // eslint-disable-line react-hooks/exhaustive-deps -- storm is rebuilt each render; its text is the key
  )

  const act = async (skip: boolean) => {
    const w = item.who
    if (!w || busy) return
    setBusy(true)
    const ok = await markDue(w, skip)
    setBusy(false)
    const what = joinNames([...new Set(w.slots.map((x) => x.name))])
    notify(ok ? (skip ? `Skipped ${what}` : `Marked ${what} taken`) : FAIL_TEXT.failed)
  }

  return (
    <section aria-labelledby="t-next">
      <h2 id="t-next" className="td-sech">Next up</h2>
      <article className={`td-slide ${item.kind}${review > 0 ? ' has-foot' : ''}`} aria-label={item.title}>
        <div className="td-k">{item.kicker}</div>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
        {item.who && (
          <div className="td-act">
            <button type="button" className="td-pill light td-taken" disabled={busy} onClick={() => void act(false)}>Taken</button>
            <button type="button" className="td-skip" disabled={busy} onClick={() => void act(true)}>Skip</button>
          </div>
        )}
        {item.href && <div className="td-act"><a className="td-pill light" href={item.href}>{item.linkLabel}</a></div>}
        {review > 0 && (
          <a className="td-foot" href={MEDS_HREF}>
            <span>{review} {review === 1 ? 'medicine' : 'medicines'} to check</span>
            <span aria-hidden="true">›</span>
          </a>
        )}
      </article>
    </section>
  )
}
