import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { ldb, type MedTaken } from '../log/store'
import { sparkPoints } from '../today/myWeekLogic'
import type { Reading } from './ranges'
import { computeKpis, type Kpi } from './kpisLogic'
import { useActivity } from './useActivity'
import { useMedications } from './useMedications'
import './m7a.css'

const NO_TAKES: MedTaken[] = []

function Spark({ values }: { values: (number | null)[] }) {
  const W = 64
  const H = 24
  const pts = sparkPoints(values, W, H)
  if (!pts) return <span className="kp-spark" aria-hidden="true" />
  return (
    <svg className="kp-spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <polyline points={pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} />
      <circle cx={pts[pts.length - 1]!.x} cy={pts[pts.length - 1]!.y} r="2.5" />
    </svg>
  )
}

function Tile({ k }: { k: Kpi }) {
  return (
    <a className="kp-tile" href={k.href} data-kpi={k.code}>
      <span className="kp-l">{k.label}</span>
      <span className="kp-v"><b>{k.value}</b>{k.unit && <small>{k.unit}</small>}</span>
      <span className="kp-w">{k.when}</span>
      <span className="kp-f">
        {k.state && k.state.kind !== 'none' ? <span className={`kp-chip ${k.state.kind}`}>{k.state.word}</span> : <span className="kp-sub">{k.sub}</span>}
        <Spark values={k.spark} />
      </span>
    </a>
  )
}

/** My KPIs: the latest reading per measure with its time. Nothing logged yet: not drawn. */
export function Kpis({ personId, readings }: { personId: string; readings: Reading[] }) {
  const activity = useActivity(personId, 14)
  const meds = useMedications(personId)
  const [takes, setTakes] = useState(NO_TAKES)
  useEffect(() => {
    if (!personId) return setTakes(NO_TAKES)
    const since = new Date(Date.now() - 9 * 86_400_000).toISOString()
    const sub = liveQuery(() => ldb.meds.where('personId').equals(personId).filter((m) => m.takenAt >= since).toArray()).subscribe({ next: setTakes, error: () => setTakes(NO_TAKES) })
    return () => sub.unsubscribe()
  }, [personId])
  const kpis = useMemo(() => computeKpis({ personId, readings, activity, meds, takes, now: new Date() }), [personId, readings, activity, meds, takes])
  if (!kpis.length) return null
  return (
    <section aria-labelledby="kp-h" data-testid="kpis">
      <div className="kp-hh"><h2 className="hd" id="kp-h">My KPIs</h2><span className="sub">latest reading</span></div>
      <div className="kp-grid">{kpis.map((k) => <Tile key={k.code} k={k} />)}</div>
    </section>
  )
}
