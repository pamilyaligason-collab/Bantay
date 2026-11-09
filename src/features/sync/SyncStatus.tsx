import { liveQuery } from 'dexie'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db, enqueue } from '../../db'
import { DEAD_KEY, getSyncState, retryStuck, subscribeSync, syncCounts, syncNow, type DeadLetter } from './sync'
import type { OutboxRow } from '../../db'
import { isSyncable, TABLES } from './tables'

export interface Counts { waiting: number; unknown: number; dead: number }

/** Pure so it can be tested: the one line a person reads. Empty when nothing needs saying (not ready, signed out, all sent). */
export function statusText(s: { ready: boolean; signedIn: boolean; offline: boolean; paused?: boolean }, c: Counts): string {
  if (!s.ready || !s.signedIn) return ''
  if (s.paused) return 'Paused - sign in again' // a 401 stopped sync until a new session; the count alone would read as "still trying"
  const q = c.waiting + c.unknown // queued rows (those we will not send yet too); dead letters are counted apart (D-142)
  const text = [q && `${q} waiting to send`, c.dead && `${c.dead} could not be sent`].filter(Boolean).join(', ')
  if (s.offline) return text ? `Offline, ${text}` : 'Offline'
  return text
}

/** Plain words for the tables a row can wait for. Never a value. */
const TABLE_WORDS: Record<string, string> = {
  readings: 'health readings', consults: 'doctor visit notes', meds_taken: 'medicine check-ins', activity: 'activity', food_entries: 'meals', water_entries: 'water',
  nutrition_goals: 'nutrition goals', push_subscriptions: 'notification settings', usage_events: 'app usage', people_profile: 'profile changes', family_tasks: 'family tasks',
  family_events: 'family events', family_notes: 'family notes', medications: 'medicines', appointments: 'appointments', prescriptions: 'follow-ups', family_messages: 'family messages',
  phone_health: 'phone check', sos_events: 'SOS alerts', sos_events_update: 'SOS updates', sos_acks: 'SOS seen marks', safety_overrides: 'safety list edits',
}
export const tableWords = (t: string) => TABLE_WORDS[t] ?? t.replace(/_/g, ' ')

const PROBLEM = 'The server had a problem. Try again later.'
const BUSY = 'The server was busy. It will try again.'
/** One plain sentence per answer, worded by the HTTP status when it is known: a 5xx is always a server problem and a 4xx never is, whatever its code. Never quotes row values. */
export function reasonText(code: string, status = 0): string {
  if (status >= 500) return PROBLEM
  if (status === 408 || status === 429) return BUSY
  const t = codeText(code)
  return status >= 400 && (t === PROBLEM || t === BUSY) ? 'The server refused it.' : t
}
function codeText(code: string): string {
  if (code === '0rows') return 'The server had no matching row to change.'
  if (/^(401|auth|PGRST30[13]|HTTP401)$/.test(code)) return 'Sign in again to send this.'
  if (/^(403|42501|PGRST30\d|HTTP403)$/.test(code)) return 'The server said this phone is not allowed to save it.'
  if (/^(23505|HTTP409)$/.test(code)) return 'The server already has a row like this.'
  if (/^(23502|23514|22\w*|HTTP400|HTTP422)$/.test(code)) return 'The server did not accept the shape of the data.'
  if (/^(PGRST205|42P01|HTTP404)$/.test(code)) return 'The server is missing the place to keep it. An admin needs to update the database.'
  if (code === 'wait-limit') return 'The server never got the place to keep it, even after a day. An admin needs to update the database.'
  if (code === 'unknown-table') return 'This version of Bantay does not know where to send it.'
  if (code === 'insert-queued') return 'Waiting for the first part to be sent.'
  if (code === 'error') return 'Something went wrong while sending. It will try again.'
  if (code === 'net') return 'This phone could not reach the server. It will try again.'
  if (/^HTTP(408|429)$/.test(code)) return BUSY
  // no status (an old row): HTTP 5xx, PostgREST connection codes and Postgres server-side classes (53 resources, 57 operator, 58 system, XX internal)
  if (/^(HTTP5\d\d|PGRST00\d|5[378][0-9A-Z]{3}|XX[0-9A-Z]{3})$/.test(code)) return PROBLEM
  return 'The server refused it.'
}
/** A network failure gives its try back, so tries 0 with a code is not "Tried 0 times". */
export function queuedNote(r: { tries: number; lastCode?: string; lastStatus?: number; table?: string; stuck?: boolean }): string {
  if (r.stuck) return `Could not be sent - call instead.${r.lastCode ? ` Code ${r.lastCode}.` : ''}` // an SOS the server refused five times: kept, retried only on its slow (30 min) schedule
  // an SOS is never given up on: any server failure on an urgent row is retried (5xx with or without a PostgREST code)
  if (r.table && isSyncable(r.table) && TABLES[r.table].urgent && r.lastCode && r.lastCode !== 'net' && r.lastCode !== 'insert-queued' && !/^(auth|HTTP401|PGRST30[123])$/.test(r.lastCode)) {
    // worded by the HTTP status when known (reasonText); the one "It will keep trying." replaces the "try again" tail of the plain text
    return `${reasonText(r.lastCode, r.lastStatus).replace(/ (It will try again|Try again later)\.$/, '')} It will keep trying. Code ${r.lastCode}.`
  }
  const tried = r.tries > 0 ? `Tried ${r.tries} ${r.tries === 1 ? 'time' : 'times'}. ` : ''
  if (r.lastCode === 'net') return `${tried}Waiting for a connection.`
  if (r.lastCode === 'insert-queued') return `${tried}${reasonText(r.lastCode)}` // an internal wait, not a server code
  return r.lastCode ? `${tried}${reasonText(r.lastCode, r.lastStatus)} Code ${r.lastCode}.` : tried.trim() || 'Not tried yet.'
}
const fields = (p: unknown) => (p && typeof p === 'object' ? Object.keys(p as object).join(', ') : '')
const timeText = (at: number) => new Date(at).toLocaleString('en-PH', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

const readDead = async () => ((await db.kv.get(DEAD_KEY))?.value as DeadLetter[] | undefined) ?? []
const writeDead = (l: DeadLetter[]) => db.kv.put({ key: DEAD_KEY, value: l })

/** Sheet listing what could not sync. Table and field names only, never the values. */
const OLD_MS = 30 * 86_400_000
const sameDead = (a: DeadLetter, b: DeadLetter) => a.at === b.at && a.clientId === b.clientId && a.table === b.table

export function DeadSheet({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<DeadLetter[]>([])
  const [queued, setQueued] = useState<OutboxRow[]>([])
  const [confirm, setConfirm] = useState<number | 'old' | null>(null) // a queued row id, or the old dead letters
  const [sending, setSending] = useState(false)
  const paused = useSyncExternalStore(subscribeSync, getSyncState).paused
  useEffect(() => {
    const sub = liveQuery(readDead).subscribe({ next: setList, error: () => {} })
    const sub2 = liveQuery(() => db.outbox.orderBy('id').toArray()).subscribe({ next: (r) => setQueued(r.filter((x) => x.table !== 'usage_events')), error: () => {} })
    return () => { sub.unsubscribe(); sub2.unsubscribe() }
  }, [])
  const groups = [...queued.reduce((m, r) => m.set(r.table, [...(m.get(r.table) ?? []), r]), new Map<string, OutboxRow[]>())]
  const old = list.filter((d) => d.at < Date.now() - OLD_MS)
  const sendNow = async () => { setSending(true); try { await syncNow(true) } finally { setSending(false) } }
  const retry = async (rows: DeadLetter[]) => {
    for (const d of rows) await enqueue(d.table, d.op, d.payload)
    await writeDead((await readDead()).filter((d) => !rows.includes(d) && !rows.some((r) => r.at === d.at && r.clientId === d.clientId && r.table === d.table)))
  }
  const discard = async (rows: DeadLetter[]) => writeDead((await readDead()).filter((d) => !rows.some((r) => r.at === d.at && r.clientId === d.clientId && r.table === d.table)))
  return (
    <div className="sh sh-sheet-wrap" onClick={onClose}>
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-label="Waiting to send" onClick={(e) => e.stopPropagation()}>
        <h2 className="sh-h2">Waiting to send</h2>
        {queued.length > 0 && (
          <section aria-label="Queued">
            <h3 className="sh-h2" style={{ fontSize: 16 }}>Queued</h3>
            <p className="sh-sub">{queued.length === 1 ? 'This change is' : `These ${queued.length} changes are`} saved on this phone and not sent yet.{paused && ' Sign in again to send them.'}</p>
            <p className="sh-sub" data-testid="queued-summary">{groups.map(([t, rows]) => `${rows.length} ${tableWords(t)}`).join(', ')}.</p>
            {groups.map(([table, rows]) => (
              <div className="sh-card" key={table} data-testid="queued-group">
                <b>{tableWords(table)} ({rows.length})</b>
                {rows.map((r) => (
                  <div key={r.id} data-testid="queued-row" style={{ margin: '6px 0' }}>
                    <p className="sh-sub" style={{ margin: '4px 0' }}>{r.op}, {timeText(r.createdAt)}. {queuedNote(r)}</p>
                    {confirm === r.id ? (
                      <div role="alert">
                        <p className="sh-sub" style={{ margin: '4px 0' }}>This change has not reached the server. Discard it for good?</p>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button type="button" className="btn2" onClick={() => void db.outbox.delete(r.id!).then(() => setConfirm(null))}>Yes, discard</button>
                          <button type="button" className="btn2" onClick={() => setConfirm(null)}>Keep it</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {r.stuck && <button type="button" className="btn2" aria-label={`Try again, ${tableWords(table)}`} onClick={() => void retryStuck(r.id)}>Try again</button>}
                        <button type="button" className="btn2" aria-label={`Discard queued ${tableWords(table)} ${r.op}`} onClick={() => setConfirm(r.id!)}>Discard</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
            <button type="button" className="btn2" disabled={sending} onClick={() => void sendNow()}>Send now</button>
          </section>
        )}
        {list.length === 0 ? (queued.length === 0 ? <p className="sh-sub">Nothing is stuck.</p> : null) : <p className="sh-sub">{list.length === 1 ? 'This change' : `These ${list.length} changes`} saved on this phone but the server did not take {list.length === 1 ? 'it' : 'them'}. Try again, or discard {list.length === 1 ? 'it' : 'them'} if you no longer need {list.length === 1 ? 'it' : 'them'}.</p>}
        {list.map((d) => (
          <div className="sh-card" key={`${d.table}-${d.clientId}-${d.at}`} data-testid="dead-row">
            <b>{tableWords(d.table)} ({d.op})</b>
            <p className="sh-sub" style={{ margin: '4px 0' }}>{reasonText(d.code, d.status)} Code {d.code}, {timeText(d.at)}.{fields(d.payload) && ` Fields: ${fields(d.payload)}.`}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn2" onClick={() => void retry([d])}>Try again</button>
              <button type="button" className="btn2" onClick={() => void discard([d])}>Discard</button>
            </div>
          </div>
        ))}
        {old.length > 0 && (confirm === 'old' ? (
          <div role="alert">
            <p className="sh-sub" style={{ margin: '4px 0' }}>Discard {old.length} {old.length === 1 ? 'change' : 'changes'} older than 30 days for good?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn2" onClick={() => void readDead().then((l) => writeDead(l.filter((d) => !old.some((o) => sameDead(o, d))))).then(() => setConfirm(null))}>Yes, discard</button>
              <button type="button" className="btn2" onClick={() => setConfirm(null)}>Keep them</button>
            </div>
          </div>
        ) : <button type="button" className="btn2" onClick={() => setConfirm('old')}>Discard all older than 30 days</button>)}
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

export { OfflineBar, QueuedBadge } from './OfflineBar'

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
  const amber = c.waiting + c.unknown + c.dead > 0 || (s.paused && s.signedIn)
  const tappable = amber && s.signedIn // queued and parked rows can be seen and discarded offline too
  return (
    <>
      <p role="status" className="sync-status" style={{ margin: 0 }}>
        {!text ? null : tappable
          ? <button type="button" className="sync-pill" data-amber={amber} onClick={() => setOpen(true)} aria-haspopup="dialog">{text}</button>
          : <span className="sync-pill" data-amber={amber}>{text}</span>}
      </p>
      {open && <DeadSheet onClose={() => setOpen(false)} />}
    </>
  )
}
