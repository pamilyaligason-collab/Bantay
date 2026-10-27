import { liveQuery } from 'dexie'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useActivity } from '../health/useActivity'
import { useMedications } from '../health/useMedications'
import type { Reading } from '../health/ranges'
import { bpDoctorOf, type BpArg } from '../health/verdict'
import { ldb, type MedTaken } from '../log/store'
import { hdb } from '../records/store'
import { useSelfPersonId } from '../setup/useProfile'
import { computeMyWeek, DAYS, nextReadingDue, sparkPoints, type Tile } from './myWeekLogic'
import { useSeenDaily } from './seen'

const NO_READINGS: Reading[] = []
const NO_TAKES: MedTaken[] = []

/** This person's readings and dose takes from the last 7 days (plus a day of slack for time zones), live. */
function useWeekData(personId: string) {
  const [readings, setReadings] = useState(NO_READINGS)
  const [takes, setTakes] = useState(NO_TAKES)
  const [doctor, setDoctor] = useState<BpArg['doctor']>()
  useEffect(() => {
    if (!personId) { setReadings(NO_READINGS); setTakes(NO_TAKES); setDoctor(undefined); return }
    const since = new Date(Date.now() - (DAYS + 1) * 86_400_000).toISOString()
    const a = liveQuery(() => hdb.readings.where('personId').equals(personId).filter((r) => r.takenAt >= since).toArray()).subscribe({ next: setReadings, error: () => undefined })
    const b = liveQuery(() => ldb.meds.where('personId').equals(personId).filter((m) => m.takenAt >= since).toArray()).subscribe({ next: setTakes, error: () => undefined })
    const c = liveQuery(() => hdb.thresholds.toArray()).subscribe({ next: (ts) => setDoctor(bpDoctorOf(ts, personId)), error: () => undefined }) // the doctor's BP targets, so the chip matches Health
    return () => { a.unsubscribe(); b.unsubscribe(); c.unsubscribe() }
  }, [personId])
  return { readings, takes, doctor }
}

/** A tiny 7-day line. Decorative: the tile's text says the same thing. */
export function Spark({ values }: { values: (number | null)[] }) {
  const W = 72
  const H = 28
  const pts = sparkPoints(values, W, H)
  if (!pts) return <span className="td-spark" aria-hidden="true" />
  return (
    <svg className="td-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} />
      <circle cx={pts[pts.length - 1]!.x} cy={pts[pts.length - 1]!.y} r="2.5" />
    </svg>
  )
}

function TileView({ t }: { t: Tile }) {
  return (
    <a className="td-tile" href={t.href}>
      <span className="td-tile-l">{t.label}</span>
      <span className="td-tile-v"><b>{t.value}</b>{t.unit && <span>{t.unit}</span>}</span>
      <span className="td-tile-s">{t.sub}</span>
      <span className="td-tile-f">
        {t.state && t.state.kind !== 'none' ? <span className={`td-chip ${t.state.kind}`}>{t.state.word}</span> : <span />}
        <Spark values={t.spark} />
      </span>
    </a>
  )
}

/** Today's "My week": the signed-in person's last 7 days as tiles. No data for a tile: it is not drawn. No data at all: the card is not drawn. */
export default function MyWeek() {
  const personId = useSelfPersonId() ?? ''
  const { readings, takes, doctor } = useWeekData(personId)
  const activity = useActivity(personId, DAYS + 1)
  const meds = useMedications(personId)
  const tiles = useMemo(() => computeMyWeek({ personId, readings, activity, meds, takes, now: new Date(), doctor }), [personId, readings, activity, meds, takes, doctor])
  const due = useMemo(() => nextReadingDue({ personId, readings, meds, now: new Date() }), [personId, readings, meds])
  const ref = useRef<HTMLElement>(null)
  useSeenDaily(ref, 'card_seen_my_week', tiles.length > 0 || !!due)
  if (!tiles.length && !due) return null
  return (
    <section ref={ref} aria-labelledby="t-myweek">
      <h2 id="t-myweek" className="td-sech">My week</h2>
      {tiles.length > 0 && <div className="td-tiles">{tiles.map((t) => <TileView key={t.code} t={t} />)}</div>}
      {due && <p className="td-due"><a href="#health">{due}</a></p>}
    </section>
  )
}
