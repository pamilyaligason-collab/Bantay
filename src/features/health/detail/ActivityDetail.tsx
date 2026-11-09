import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { STEP_GOAL } from '../../today/myWeekLogic'
import { useFamilyPeople } from '../../family/roster'
import { useLinkedPeople } from '../../family/useFamilyScope'
import { ldb } from '../../log/store'
import { localDay, type Activity } from '../model'
import { familyRows, monthVsYear, stepsSummary, type FamilyRow } from './activityLogic'
import './detail.css'

const n = (v: number) => v.toLocaleString('en-US')

/** Activity detail hero (the one hero card on the page). The phone gives Bantay steps only, so there are no Move, Exercise or Stand rings: a ring appears only for a value the data has. */
export function ActivityHero({ acts, now }: { acts: Activity[]; now: Date }) {
  const s = stepsSummary(acts, now)
  const cmp = monthVsYear(s.month, s.year)
  return (
    <div className="grp sd-hero" data-testid="activity-hero">
      <div className="row sd-col">
        <span className="sub">Steps today</span>
        <strong className="hv-big">{s.today == null ? '--' : n(s.today)}</strong>
        {s.today == null && <span className="sub">No steps shared today yet.</span>}
        <span className="sub">{s.avg30 == null ? 'No 30-day average yet.' : `${n(s.avg30)} a day on average over the last 30 days`}</span>
        <span className="sub">Goal {n(STEP_GOAL)} steps a day (Bantay's default)</span>
        {cmp && <p className="sd-line" data-testid="activity-compare">{cmp}</p>}
      </div>
    </div>
  )
}

/** A real table: one row per member the viewer may see. */
export function FamilyTable({ rows }: { rows: FamilyRow[] }) {
  return (
    <section aria-labelledby="ft-h" data-testid="family-today">
      <h2 className="hd" id="ft-h">Family today</h2>
      <div className="grp">
        <table className="ft">
          <thead><tr><th scope="col">Person</th><th scope="col">Steps today</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <th scope="row">{r.isMe ? 'You' : r.name}</th>
                <td>{r.steps == null ? 'No steps shared today' : n(r.steps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="sub ft-note">Only people you may see are listed, and only what their phone shares.</p>
    </section>
  )
}

/** Family today for the steps page. Who may be listed is the D-109 set the Family screens use (useLinkedPeople); everyone else this phone knows is dropped before any number is read. Hidden when it would list only you. */
export function FamilyToday({ now }: { now: Date }) {
  const { people } = useFamilyPeople()
  const linked = useLinkedPeople()
  const allowed = useMemo(() => new Set(linked.map((p) => p.id)), [linked])
  const [steps, setSteps] = useState<Record<string, number | null>>({})
  const key = [...allowed].sort().join(',')
  useEffect(() => {
    const ids = key ? key.split(',') : []
    const today = localDay(now.toISOString())
    const sub = liveQuery(() => ldb.activity.where('personId').anyOf(ids).filter((a) => a.kind === 'steps' && typeof a.steps === 'number' && localDay(a.startedAt) === today).toArray()).subscribe({
      next: (rows) => { const m: Record<string, number | null> = {}; for (const r of rows) m[r.personId] = (m[r.personId] ?? 0) + (r.steps ?? 0); setSteps(m) },
      error: () => setSteps({})
    })
    return () => sub.unsubscribe()
  }, [key, now])
  const rows = familyRows(people, allowed, steps)
  return rows.length > 1 ? <FamilyTable rows={rows} /> : null
}
