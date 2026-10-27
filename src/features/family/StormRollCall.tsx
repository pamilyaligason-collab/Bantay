import { liveQuery } from 'dexie'
import { useEffect, useMemo, useState } from 'react'
import { givenName } from '../health/medName'
import { ALERTS_KEY, type Alert } from '../safety/alerts'
import { ensureStormTasks, fetchRollcall, STORM_TASKS, stormTaskId, tally, type RollRow } from '../safety/rollcall'
import { liveSignals, stormRef } from '../safety/stormMode'
import { useKv } from '../safety/store'
import FmAvatar from './FmAvatar'
import { dial, useFamilyPeople } from './roster'
import { fdb, type FamilyTask } from './store'
import { toggleTask } from './tasks'
import './family.css'
import './plan.css'
import '../safety/safety.css'

const NONE: Alert[] = []
const POLL_MS = 30_000

/** Family > People during a storm (mockup family-home, board 7b): who is safe, who needs help, who has not answered yet (with a Call button), "n of m safe",
 *  and the shared Do now list (4 family tasks per storm, made once). Hidden when no wind signal is live. Answers are read online; an unreadable list says so, never "nobody answered". */
export function StormRollCall({ now }: { now?: number }) {
  const alerts = useKv<Alert[]>(ALERTS_KEY, NONE)
  const top = liveSignals(alerts, now)[0]
  const ref = top ? stormRef(top) : null
  const { people } = useFamilyPeople()
  const [rows, setRows] = useState<RollRow[] | null>(null)
  const [tasks, setTasks] = useState<FamilyTask[]>([])

  useEffect(() => {
    if (!ref) return
    let live = true
    const load = () => void fetchRollcall(ref).then((r) => { if (live && r) setRows(r) })
    load()
    const t = setInterval(load, POLL_MS)
    window.addEventListener('online', load)
    return () => { live = false; clearInterval(t); window.removeEventListener('online', load) }
  }, [ref])

  useEffect(() => {
    if (!ref) return
    let sub: { unsubscribe(): void } | null = null
    let live = true
    void (async () => {
      await ensureStormTasks(ref)
      const ids = new Set(await Promise.all(STORM_TASKS.map((t) => stormTaskId(ref, t))))
      if (!live) return
      sub = liveQuery(() => fdb.tasks.filter((t) => ids.has(t.clientId)).toArray()).subscribe({
        next: (list) => setTasks(STORM_TASKS.flatMap((title) => list.filter((t) => t.title === title).slice(0, 1))),
        error: () => {}
      })
    })()
    return () => { live = false; sub?.unsubscribe() }
  }, [ref])

  const t = useMemo(() => tally(people.map((p) => p.id), rows ?? []), [people, rows])
  if (!ref || people.length === 0) return null
  const status = (id: string) => rows?.find((r) => r.personId === id)?.status ?? null

  return (
    <section className="sf" aria-label="Storm roll call">
      <article className="card fm-storm">
        <h2 className="sf-h2">Is everyone safe?</h2>
        <p className="sub" role="status" style={{ margin: 0 }}>{rows === null ? 'Checking who has answered…' : t.line}</p>
        <ul className="fm-list" aria-label="Storm check-ins">
          {people.map((p) => {
            const s = status(p.id)
            const tel = dial(p.phone)
            return (
              <li key={p.id} className="fm-row" data-k={s ?? 'none'}>
                <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={44} />
                <span className="grow">
                  <b>{p.isMe ? 'You' : givenName(p.name)}</b>
                  <span className={`sub${s === 'need_help' ? ' fm-warn' : ''}`}>{rows === null ? ' ' : s === 'ok' ? 'Safe' : s === 'need_help' ? 'Needs help' : 'No answer yet'}</span>
                </span>
                {!p.isMe && tel && (s === null || s === 'need_help') && rows !== null && <a className="pill" href={`tel:${tel}`} aria-label={`Call ${givenName(p.name)}`}>Call</a>}
              </li>
            )
          })}
        </ul>
      </article>
      {tasks.length > 0 && (
        <article className="card fm-storm">
          <h2 className="sf-h2">Do now, together</h2>
          <ul className="fm-list fm-rows" aria-label="Storm checklist">
            {tasks.map((k) => (
              <li key={k.clientId} className="fm-row">
                <button type="button" className="fm-chk" role="checkbox" aria-checked={k.done} aria-label={k.title} onClick={() => void toggleTask(k)} />
                <span className="grow"><b className={k.done ? 'done' : ''}>{k.title}</b></span>
              </li>
            ))}
          </ul>
        </article>
      )}
    </section>
  )
}

export default StormRollCall
