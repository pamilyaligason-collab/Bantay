import { liveQuery } from 'dexie'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db, enqueue } from '../../db'
import { DEAD_KEY, getSyncState, subscribeSync, syncCounts, type DeadLetter } from './sync'

export interface Counts { waiting: number; unknown: number; dead: number }

/** Pure so it can be tested: the one line a person reads. Empty when nothing needs saying (not ready, signed out, all sent). */
export function statusText(s: { ready: boolean; signedIn: boolean; offline: boolean }, c: Counts): string {
  if (!s.ready || !s.signedIn) return ''
  const n = c.waiting + c.unknown + c.dead // rows we will not send still are not safe on the server
  if (s.offline) return n ? `Offline, ${n} waiting to send` : 'Offline'
  return n ? `${n} waiting to send` : ''
}

/** One plain sentence per server code. Never quotes row values. */
export function reasonText(code: string): string {
  if (code === '0rows') return 'The server had no matching row to change.'
  if (/^(401|403|42501|HTTP40[13])$/.test(code)) return 'The server said this phone is not allowed to save it.'
  if (/^(23505|HTTP409)$/.test(code)) return 'The server already has a row like this.'
  if (/^(23502|23514|22\w*|HTTP400|HTTP422)$/.test(code)) return 'The server did not accept the shape of the data.'
  if (/^(PGRST205|42P01|HTTP404)$/.test(code)) return 'The server is missing the place to keep it. An admin needs to update the database.'
  if (/^HTTP5/.test(code)) return 'The server had a problem. Try again later.'
  return 'The server refused it.'
}
const fields = (p: unknown) => (p && typeof p === 'object' ? Object.keys(p as object).join(', ') : '')
const timeText = (at: number) => new Date(at).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const readDead = async () => ((await db.kv.get(DEAD_KEY))?.value as DeadLetter[] | undefined) ?? []
const writeDead = (l: DeadLetter[]) => db.kv.put({ key: DEAD_KEY, value: l })

/** Sheet listing what could not sync. Table and field names only, never the values. */
export function DeadSheet({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<DeadLetter[]>([])
  useEffect(() => {
    const sub = liveQuery(readDead).subscribe({ next: setList, error: () => {} })
    return () => sub.unsubscribe()
  }, [])
  const retry = async (rows: DeadLetter[]) => {
    for (const d of rows) await enqueue(d.table, d.op, d.payload)
    await writeDead((await readDead()).filter((d) => !rows.includes(d) && !rows.some((r) => r.at === d.at && r.clientId === d.clientId && r.table === d.table)))
  }
  const discard = async (rows: DeadLetter[]) => writeDead((await readDead()).filter((d) => !rows.some((r) => r.at === d.at && r.clientId === d.clientId && r.table === d.table)))
  return (
    <div className="sh sh-sheet-wrap" onClick={onClose}>
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-label="Waiting to send" onClick={(e) => e.stopPropagation()}>
        <h2 className="sh-h2">Waiting to send</h2>
        {list.length === 0 ? <p className="sh-sub">Nothing is stuck.</p> : <p className="sh-sub">{list.length === 1 ? 'This change' : `These ${list.length} changes`} saved on this phone but the server did not take {list.length === 1 ? 'it' : 'them'}. Try again, or discard {list.length === 1 ? 'it' : 'them'} if you no longer need {list.length === 1 ? 'it' : 'them'}.</p>}
        {list.map((d) => (
          <div className="sh-card" key={`${d.table}-${d.clientId}-${d.at}`} data-testid="dead-row">
            <b>{d.table.replace(/_/g, ' ')} ({d.op})</b>
            <p className="sh-sub" style={{ margin: '4px 0' }}>{reasonText(d.code)} Code {d.code}, {timeText(d.at)}.{fields(d.payload) && ` Fields: ${fields(d.payload)}.`}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn2" onClick={() => void retry([d])}>Try again</button>
              <button type="button" className="btn2" onClick={() => void discard([d])}>Discard</button>
            </div>
          </div>
        ))}
        {list.length > 1 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn2" onClick={() => void retry(list)}>Try all again</button>
            <button type="button" className="btn2" onClick={() => void discard(list)}>Discard all</button>
          </div>
        )}
        <button type="button" className="btn2" onClick={onClose}>Close</button>
      </div>
    </div>
  )
}

const NONE: Counts = { waiting: 0, unknown: 0, dead: 0 }

/** Small text badge. Place it anywhere (for example under the page heading). */
export function SyncStatus() {
  const s = useSyncExternalStore(subscribeSync, getSyncState)
  const [c, setC] = useState<Counts>(NONE)
  useEffect(() => {
    // outbox and kv (dead letters) both change the counts
    const sub = liveQuery(() => syncCounts()).subscribe({ next: setC, error: () => {} })
    return () => sub.unsubscribe()
  }, [])
  const [open, setOpen] = useState(false)
  const text = statusText(s, c)
  const tappable = c.dead > 0 && s.signedIn // parked rows can be seen and discarded offline too
  if (!text) return null
  const amber = c.waiting + c.unknown + c.dead > 0
  return (
    <>
      <p role="status" className="sync-status" style={{ margin: 0 }}>
        {tappable
          ? <button type="button" className="sync-pill" data-amber={amber} onClick={() => setOpen(true)} aria-haspopup="dialog">{text}</button>
          : <span className="sync-pill" data-amber={amber}>{text}</span>}
      </p>
      {open && <DeadSheet onClose={() => setOpen(false)} />}
    </>
  )
}
