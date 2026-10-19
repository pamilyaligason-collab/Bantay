import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { db } from '../../db'
import { useFamilyPeople } from '../family/roster'
import { usePlace } from '../location/useLocation'
import { ldb } from '../log/store'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { stormName } from '../safety/LiveMaps'
import { useKv } from '../safety/store'
import { useProfiles } from '../setup/useProfile'
import { FAIL_TEXT, takeDose } from './actions'
import { SKIP_KEY, type HeroCard } from './heroCards'
import { dueMeds, pickNext } from './nextPick'
import { placeNameOf } from './placeName'
import { usePlanCard } from './planCard'
import { awayText, nearbyStorm } from './stormView'
import { useWeather, weatherLine } from './weather'

const NO_ALERTS: Alert[] = []
const NO_NAMES: string[] = []
const NO_SKIP = { day: '', names: NO_NAMES }
const NO_TAKEN: { personId: string; name: string; takenAt: string }[] = []
const startOfDay = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }

/** Today's one "Next up" card, plus the one weather line under it (hidden when the card is the weather). */
export default function NextUp({ notify }: { notify: (msg: string) => void }) {
  const place = usePlace()
  const alerts = useKv<Alert[]>(ALERTS_KEY, NO_ALERTS)
  const ownMeds = useKv<string[]>('profile.medicines', NO_NAMES)
  const skip = useKv<{ day: string; names: string[] }>(SKIP_KEY, NO_SKIP)
  const { people } = useFamilyPeople()
  const profiles = useProfiles()
  const [taken, setTaken] = useState(NO_TAKEN)
  const [tick, setTick] = useState(() => new Date())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const sub = liveQuery(() => ldb.meds.where('takenAt').aboveOrEqual(startOfDay().toISOString()).toArray()).subscribe({ next: setTaken, error: () => undefined })
    const t = setInterval(() => setTick(new Date()), 60_000)
    return () => { sub.unsubscribe(); clearInterval(t) }
  }, [])

  const wx = useWeather(place?.weather ?? null)
  const plan = usePlanCard(tick)
  const placeName = placeNameOf(place)
  const skipped = skip.day === tick.toDateString() ? skip.names : NO_NAMES
  const from = place?.weather ?? null
  const s = nearbyStorm(alerts, from)
  const storm = s ? { title: `${stormName(s)} is near`, body: `${s.level ? `${s.level} alert, ` : ''}${awayText(from, s) ?? 'check the tracker'}` } : null

  const item = useMemo(() => {
    const input = people.map((p) => ({ personId: p.id, name: p.name, isMe: p.isMe, entries: profiles[p.id]?.medicines?.length ? profiles[p.id]!.medicines! : p.isMe ? ownMeds : NO_NAMES }))
    return pickNext({ due: dueMeds(input, taken, skipped, tick), plan: plan as HeroCard | null, storm, weather: wx, placeName, now: tick })
  }, [people, profiles, ownMeds, taken, skipped, tick, plan, storm?.title, storm?.body, wx, placeName]) // eslint-disable-line react-hooks/exhaustive-deps -- storm is rebuilt each render; its text is the key

  const markTaken = async () => {
    const w = item.who
    if (!w || busy) return
    setBusy(true)
    let r = 'ok' as 'ok' | 'signedout' | 'failed'
    for (const n of w.meds) { const x = await takeDose(n); if (x !== 'ok') { r = x; break } }
    setBusy(false)
    notify(r === 'ok' ? `Marked ${w.meds.length > 1 ? 'them' : w.meds[0]} taken` : FAIL_TEXT[r])
  }
  const skipIt = () => {
    if (item.who) void db.kv.put({ key: SKIP_KEY, value: { day: tick.toDateString(), names: [...skipped, ...item.who.meds] } }).catch(() => undefined)
  }

  const line = item.kind === 'weather' ? null : weatherLine(wx, tick)
  return (
    <section aria-labelledby="t-next">
      <h2 id="t-next" className="td-sech">Next up</h2>
      <article className={`td-slide ${item.kind}${item.big ? ' has-big' : ''}${item.sky ? ` sky-${item.sky}` : ''}`} aria-label={item.title}>
        {item.sky && <span className="td-sky" aria-hidden="true" />}
        <div className="td-k">{item.kicker}</div>
        {item.big && <div className="td-big" aria-hidden="true">{item.big}</div>}
        <h3>{item.title}</h3>
        <p>{item.body}</p>
        {item.who?.isMe && (
          <div className="td-act">
            <button type="button" className="td-pill light" disabled={busy} onClick={() => void markTaken()}>Mark taken</button>
            <button type="button" className="td-pill" onClick={skipIt}>Skip today</button>
          </div>
        )}
        {item.who && !item.who.isMe && (
          <div className="td-act"><a className="td-pill light" href="#health">See {item.who.name}&apos;s medicines</a></div>
        )}
        {item.href && <div className="td-act"><a className="td-pill light" href={item.href}>{item.linkLabel}</a></div>}
      </article>
      {line && <p className="td-wxline">{line}</p>}
    </section>
  )
}
