import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../auth/client'
import { Icon } from '../shell/Icon'
import { useCarerIds } from './CarerCards'
import FmAvatar from './FmAvatar'
import { dial, type FamilyPerson } from './roster'
import './family.css'

/** Family > Phones (mockup family-phones): can each phone ring its alarms on time? One row per person the user looks after, read from the phone_health
 *  rows the database lets a carer see. Unknown is "not checked yet", never a good or a bad answer (ML-05). */
export interface PhoneHealthRow {
  user_id: string
  platform: string | null
  alarms_ok: boolean | null
  notif_ok: boolean | null
  exact_ok: boolean | null
  battery_ok: boolean | null
  call_ok: boolean | null
  last_open_at: string | null
  alarms_checked_at: string | null
}
const COLUMNS = 'user_id,platform,alarms_ok,notif_ok,exact_ok,battery_ok,call_ok,last_open_at,alarms_checked_at'
const STALE_MS = 48 * 3600_000 // the same 48 hours the server sweep uses

export type PhoneState = 'ok' | 'fix' | 'stale' | 'unknown'

/** One phone's state and the line under the name. */
export function phoneStatus(r: PhoneHealthRow | null, now: Date = new Date()): { state: PhoneState; text: string } {
  if (!r) return { state: 'unknown', text: 'No phone check yet' }
  const web = r.platform === 'web'
  const opened = r.last_open_at ? Date.parse(r.last_open_at) : NaN
  if (!Number.isNaN(opened) && now.getTime() - opened > STALE_MS) {
    const days = Math.floor((now.getTime() - opened) / 86_400_000)
    return { state: 'stale', text: `${web ? 'Browser app · ' : ''}not opened for ${days} days` }
  }
  if (r.alarms_ok === false) {
    return { state: 'fix', text: r.battery_ok === false ? 'Battery saver is stopping alarms' : r.exact_ok === false ? 'Exact alarms are off' : r.notif_ok === false ? 'Notifications are off' : 'Alarms may not ring on time' }
  }
  if (r.call_ok === false) return { state: 'fix', text: 'Hold for help cannot place a call' }
  if (r.alarms_ok === true) return { state: 'ok', text: 'Alarms ring on time' }
  return { state: 'unknown', text: web ? 'Browser app · alarms are not checked here' : 'Not checked yet' }
}

/** The phone_health rows the user may read, keyed by person id. Two reads (people for the auth link, then the rows); an offline phone gets an empty map and `failed`. */
export function usePhones(personIds: string[]): { rows: Record<string, PhoneHealthRow>; failed: boolean; reload: () => void } {
  const [rows, setRows] = useState<Record<string, PhoneHealthRow>>({})
  const [failed, setFailed] = useState(false)
  const [tick, setTick] = useState(0)
  const key = personIds.join(',')
  useEffect(() => {
    const sb = supabase
    if (!sb || !key) return
    let live = true
    void (async () => {
      try {
        const ids = key.split(',')
        const ppl = await sb.from('people').select('id,auth_user_id').in('id', ids)
        if (ppl.error) throw new Error('read')
        const owner = new Map<string, string>() // user id -> person id
        for (const p of (ppl.data ?? []) as { id: string; auth_user_id: string | null }[]) if (p.auth_user_id) owner.set(p.auth_user_id, p.id)
        const ph = owner.size ? await sb.from('phone_health').select(COLUMNS).in('user_id', [...owner.keys()]) : { data: [] as PhoneHealthRow[], error: null }
        if (ph.error) throw new Error('read')
        const out: Record<string, PhoneHealthRow> = {}
        for (const r of (ph.data ?? []) as PhoneHealthRow[]) { const pid = owner.get(r.user_id); if (pid) out[pid] = r }
        if (live) { setRows(out); setFailed(false) }
      } catch { if (live) setFailed(true) }
    })()
    return () => { live = false }
  }, [key, tick])
  return { rows, failed, reload: useCallback(() => setTick((n) => n + 1), []) }
}

export default function FamilyPhones({ people, onBack, onMessage }: { people: FamilyPerson[]; onBack: () => void; onMessage: (personId: string) => void }) {
  const { rows, failed, reload } = usePhones(people.map((p) => p.id))
  const carerIds = useCarerIds()
  const [fix, setFix] = useState<string | null>(null)
  // the people this user looks after, and anyone whose phone the database lets them read
  const list = people.filter((p) => carerIds.includes(p.id) || rows[p.id]).map((p) => ({ p, s: phoneStatus(rows[p.id] ?? null) }))
  const target = list.find((x) => x.p.id === fix)
  const first = (p: FamilyPerson) => p.name.trim().split(/\s+/)[0] || p.name
  return (
    <section aria-label="Phones" className="fp">
      <button type="button" className="fm-back" onClick={onBack}><Icon name="back" size={20} />Family</button>
      <div><h2 className="hd">Phones</h2><p className="sub">Can each phone wake you for alarms?</p></div>
      {failed && <p className="sub fm-warn" role="status">Could not reach the server. Showing what was last read, if anything.</p>}
      {list.length === 0 ? (
        <div className="card"><p className="sub fm-empty">Nobody to show yet. Phones of the people you look after appear here.</p></div>
      ) : (
        <ul className="card fp-list" aria-label="Phones">
          {list.map(({ p, s }) => (
            <li key={p.id} data-state={s.state}>
              <FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={44} />
              <div className="grow"><b>{p.isMe ? 'Your phone' : `${first(p)}'s phone`}</b><div className={`sub${s.state === 'fix' ? ' fp-bad' : s.state === 'stale' ? ' fm-warn' : ''}`}>{s.text}</div></div>
              {s.state === 'ok' && <span className="fp-dot" role="img" aria-label="Working" />}
              {s.state === 'fix' && !p.isMe && <button type="button" className="pill fp-amber" onClick={() => setFix(p.id)}>Needs fixing</button>}
              {s.state === 'stale' && !p.isMe && <button type="button" className="pill ghost fp-act" onClick={() => onMessage(p.id)}>Remind {first(p)}</button>}
            </li>
          ))}
        </ul>
      )}
      {target && (
        <div className="card fp-fix" aria-label={`Fix ${first(target.p)}'s phone`}>
          <b>Fix: {first(target.p)}'s phone</b>
          <div className="sub">Ask {first(target.p)} to open Bantay, then Me, then Phone check. It has one tap for each setting.</div>
          <div className="fm-actions">
            <button type="button" className="pill primary" onClick={() => onMessage(target.p.id)}>Message {first(target.p)}</button>
            {dial(target.p.phone) && <a className="pill ghost" href={`tel:${dial(target.p.phone)}`}>Call {first(target.p)}</a>}
          </div>
        </div>
      )}
      <button type="button" className="pill ghost block" onClick={reload}>Refresh</button>
    </section>
  )
}
