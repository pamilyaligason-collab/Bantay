import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { STEP_GOAL } from '../../today/myWeekLogic'
import { useFamilyPeople } from '../../family/roster'
import { useLinkedPeople } from '../../family/useFamilyScope'
import { ldb } from '../../log/store'
import { properName } from '../medName'
import type { Activity } from '../model'
import { compareRows, thirtyDay } from './compareLogic'
import './detail.css'

/** Me against the Bantay goal, one family member you choose, and the family average. 30-day averages from rows this phone already holds for the people you may see
 *  (the same D-109 set as Family today: useLinkedPeople). Each comparison needs 7 days of data, else it is left out. */
export function ActivityCompare({ acts, now }: { acts: Activity[]; now: Date }) {
  const { people } = useFamilyPeople()
  const linked = useLinkedPeople()
  const [pick, setPick] = useState('')
  const others = useMemo(() => people.filter((p) => !p.isMe && linked.some((l) => l.id === p.id)), [people, linked])
  const key = others.map((p) => p.id).sort().join(',')
  const [rows, setRows] = useState<Record<string, Activity[]>>({})
  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (!ids.length) { setRows({}); return }
    const since = new Date(Date.now() - 31 * 86_400_000).toISOString()
    const sub = liveQuery(() => ldb.activity.where('personId').anyOf(ids).filter((a) => a.kind === 'steps' && a.startedAt >= since).toArray()).subscribe({
      next: (r) => { const m: Record<string, Activity[]> = {}; for (const a of r) (m[a.personId] ??= []).push(a); setRows(m) },
      error: () => setRows({})
    })
    return () => sub.unsubscribe()
  }, [key])
  const t = (id: string) => thirtyDay(rows[id] ?? [], now)
  const chosen = others.find((p) => p.id === pick) ?? others[0]
  const list = compareRows({ me: thirtyDay(acts, now), member: chosen ? { name: properName(chosen.name), t: t(chosen.id) } : null, others: others.map((p) => t(p.id)), goal: STEP_GOAL })
  if (list.length === 0) return <p className="sub ft-note" data-testid="compare-wait">Comparisons show after 7 days of steps.</p>
  return (
    <section aria-labelledby="ac-h" data-testid="activity-compare-card">
      <h2 className="hd" id="ac-h">How you compare</h2>
      {others.length > 1 && (
        <label className="ac-pick">Compare with
          <select value={chosen?.id ?? ''} onChange={(e) => setPick(e.target.value)}>{others.map((p) => <option key={p.id} value={p.id}>{properName(p.name)}</option>)}</select>
        </label>
      )}
      <div className="grp">
        {list.map((r) => (
          <div className="row sd-col" key={r.id} data-testid={`compare-${r.id}`}>
            <span className="sub">{r.title}</span>
            <strong>{r.value} steps a day</strong>
            <span className="sd-line">{r.line}</span>
          </div>
        ))}
      </div>
      <p className="sub ft-note">30-day averages, on the days steps were shared. Only people you may see are used.</p>
    </section>
  )
}
