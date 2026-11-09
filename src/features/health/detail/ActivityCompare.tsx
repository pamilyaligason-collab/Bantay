import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { STEP_GOAL } from '../../today/myWeekLogic'
import { useFamilyPeople } from '../../family/roster'
import { useLinkedPeople } from '../../family/useFamilyScope'
import { ldb } from '../../log/store'
import { givenName, properName } from '../medName'
import { localDay, type Activity } from '../model'
import { compareRows, thirtyDay } from './compareLogic'
import './detail.css'

const HUE = { goal: 'green', member: 'blue', family: 'amber' } as const

/** The VIEWED person (personId, from useHealthPerson) against the Bantay goal, one other person you choose, and the family average. 30-day averages from rows this phone already holds for the people you may see
 *  (the same D-109 set as Family today: useLinkedPeople). The viewer is one of the "others" when they look at someone else. Each comparison needs 7 days of data, else it is left out. */
export function ActivityCompare({ acts, now, personId }: { acts: Activity[]; now: Date; personId: string }) {
  const { people, selfId } = useFamilyPeople()
  const linked = useLinkedPeople()
  const [pick, setPick] = useState('')
  const viewer = selfId != null && selfId === personId
  const viewed = people.find((p) => p.id === personId)
  const others = useMemo(() => linked.filter((p, i) => p.id !== personId && linked.findIndex((l) => l.id === p.id) === i), [linked, personId]) // never the viewed person twice; read-only links are not in `linked`
  const key = others.map((p) => p.id).sort().join(',')
  const day = localDay(now.toISOString())
  const [rows, setRows] = useState<Record<string, Activity[]>>({})
  useEffect(() => {
    const ids = key ? key.split(',') : []
    if (!ids.length) { setRows({}); return }
    const since = new Date(new Date(`${day}T12:00:00`).getTime() - 31 * 86_400_000).toISOString() // from the page's own clock, not Date.now()
    const sub = liveQuery(() => ldb.activity.where('personId').anyOf(ids).filter((a) => a.kind === 'steps' && a.startedAt >= since).toArray()).subscribe({
      next: (r) => { const m: Record<string, Activity[]> = {}; for (const a of r) (m[a.personId] ??= []).push(a); setRows(m) },
      error: () => setRows({})
    })
    return () => sub.unsubscribe()
  }, [key, day])
  const t = (id: string) => thirtyDay(rows[id] ?? [], now)
  const chosen = others.find((p) => p.id === pick) ?? others[0]
  const first = viewed ? givenName(viewed.name) : ''
  const list = compareRows({
    me: thirtyDay(acts, now),
    who: { viewer, name: first },
    member: chosen ? { name: properName(chosen.name), isYou: chosen.isMe, t: t(chosen.id) } : null,
    others: others.map((p) => t(p.id)),
    goal: STEP_GOAL
  })
  if (list.length === 0) return <p className="sub ft-note" data-testid="compare-wait">Comparisons show after 7 days of steps.</p>
  return (
    <section aria-labelledby="ac-h" data-testid="activity-compare-card">
      <h2 className="hd cd-title" id="ac-h">{viewer ? 'How you compare' : first ? `How ${first} compares` : 'How they compare'}</h2>
      {others.length > 1 && (
        <label className="ac-pick">Compare with
          <select value={chosen?.id ?? ''} onChange={(e) => setPick(e.target.value)}>{others.map((p) => <option key={p.id} value={p.id}>{p.isMe ? 'You' : properName(p.name)}</option>)}</select>
        </label>
      )}
      <div className="ac-list">
        {list.map((r) => (
          <div className="card tint ac-card" data-hue={HUE[r.id]} key={r.id} data-testid={`compare-${r.id}`}>
            <span className="cd-kicker">{r.title}</span>
            <span><strong className="cd-value">{r.value}</strong> <span className="cd-meta">steps a day</span></span>
            <span className="sd-line">{r.line}</span>
          </div>
        ))}
      </div>
      <p className="sub ft-note">30-day averages, on the days steps were shared. Only people you may see are used.</p>
    </section>
  )
}
