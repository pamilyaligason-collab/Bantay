import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../../db'
import { alertRef } from '../location/place'
import { usePlace } from '../location/useLocation'
import { ldb } from '../log/store'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { useKv } from '../safety/store'
import { dueDoses, heroCards, type HeroActionId } from './heroCards'
import { placeNameOf } from './placeName'
import { usePlanCard } from './planCard'
import { useWeather } from './weather'

const NO_ALERTS: Alert[] = []
const NO_NAMES: string[] = []
const NO_SKIP = { day: '', names: NO_NAMES }
const SKIP_KEY = 'today.skipped' // { day, names }: doses marked Skipped today, so the card does not come back on reload
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

/** The one card that matters now, as a row of swipeable cards when more than one applies (D-31/D-43). */
export default function Hero({ onOk, onTaken, next = false, onWeatherFills }: { onOk: () => void; onTaken: (name: string) => void; next?: boolean; onWeatherFills?: (b: boolean) => void }) {
  const H = next ? 'h3' : 'h2' // next: sits under the Next up heading, and weather lives in its own strip
  const place = usePlace()
  const alerts = useKv<Alert[]>(ALERTS_KEY, NO_ALERTS)
  const profile = useKv<string[]>('profile.medicines', NO_NAMES)
  const skip = useKv<{ day: string; names: string[] }>(SKIP_KEY, NO_SKIP)
  const [taken, setTaken] = useState<{ name: string; takenAt: string }[]>([])
  const [tick, setTick] = useState(() => new Date())
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const sub = liveQuery(() => ldb.meds.where('takenAt').aboveOrEqual(startOfDay().toISOString()).toArray()).subscribe({ next: setTaken, error: () => undefined })
    const t = setInterval(() => setTick(new Date()), 60_000)
    return () => { sub.unsubscribe(); clearInterval(t) }
  }, [])

  const ref = place ? alertRef(place) : null
  const wx = useWeather(place?.weather ?? null)
  const plan = usePlanCard(tick)
  const placeName = placeNameOf(place)
  const skipped = skip.day === tick.toDateString() ? skip.names : NO_NAMES
  const cards = useMemo(
    () => {
      const base = { alerts, ref, doses: dueDoses(profile, taken, skipped, tick), placeName, now: tick }
      const c = heroCards({ ...base, weather: next ? null : wx })
      if (!next) return c
      // Next up ranks alert, dose due, plan item, then weather; weather shows only when nothing above applies
      const top = c.filter((x) => x.kind !== 'summary')
      if (plan) top.push(plan)
      return top.length || !wx ? (top.length ? top : c) : heroCards({ ...base, weather: wx })
    },
    [alerts, ref?.lat, ref?.lon, profile, taken, skipped, tick, wx, placeName, next, plan] // eslint-disable-line react-hooks/exhaustive-deps -- ref is rebuilt each render; its numbers are the key
  )
  const at = Math.min(idx, cards.length - 1)
  const wxFills = cards[0]?.kind === 'weather'
  useEffect(() => { onWeatherFills?.(wxFills) }, [wxFills, onWeatherFills])

  const act = (id: HeroActionId, dose?: { name: string }) => {
    if (id === 'ok') onOk()
    else if (id === 'plan') location.hash = '#family/plan'
    else if (id === 'safety') location.hash = '#safety/warnings'
    else if (id === 'taken' && dose) onTaken(dose.name)
    else if (id === 'skip' && dose) void db.kv.put({ key: SKIP_KEY, value: { day: tick.toDateString(), names: [...skipped, dose.name] } }).catch(() => undefined)
  }

  return (
    <>
      <div className={`td-hero${cards.length > 1 ? ' multi' : ''}`} role="region" aria-label="What matters now" onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / Math.max(1, e.currentTarget.clientWidth)))}>
        {cards.map((c) => (
          <article key={c.key} className={`td-slide ${c.kind}${c.big ? ' has-big' : ''}${c.sky ? ` sky-${c.sky}` : ''}`} aria-label={c.title}>
            {c.sky && <span className="td-sky" aria-hidden="true" />}
            <div className="td-k">{c.kicker}</div>
            {c.big && <div className="td-big" aria-hidden="true">{c.big}</div>}
            <H>{c.title}</H>
            <p>{c.body}</p>
            {c.actions.length > 0 && (
              <div className="td-act">
                {c.actions.map((a, i) => (
                  <button key={a.id} type="button" className={`td-pill${i === 0 ? ' light' : ''}`} onClick={() => act(a.id, c.dose)}>{a.label}</button>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      {cards.length > 1 && (
        <div className="td-dots" aria-hidden="true">{cards.map((c, i) => <i key={c.key} className={i === at ? 'on' : ''} />)}</div>
      )}
    </>
  )
}
