import { useEffect, useState } from 'react'
import { db } from '../../db'
import { supabase } from '../auth/client'
import { getMember } from '../auth/session'
import { loadCarerOf } from '../family/reportData'

type Client = { from: (t: string) => any; rpc: (fn: string, args: object) => any } // eslint-disable-line @typescript-eslint/no-explicit-any
const KEY = 'digest.on' // { userId, on }: a cache only. The server row (carer_prefs, 0039) decides; no row = on.

/** The "8 PM summary" switch in Me, only for someone who cares for another person. Off hides the calm 8 PM note (kind digest) and nothing else:
 *  missed-medicine, Unwell, SOS and review alerts are never affected (dose-watch drops kind digest only). */
export default function DigestToggle() {
  const [state, setState] = useState<{ userId: string; on: boolean } | null>(null) // null = not a carer, or still loading
  const [note, setNote] = useState('')

  useEffect(() => {
    let live = true
    void (async () => {
      const m = await getMember().catch(() => null)
      if (!m) return
      const ids = (await loadCarerOf(supabase as Client | null, m.userId)).filter((id) => id !== m.personId)
      if (!live || !ids.length) return
      let on = true
      try {
        const r = await (supabase as Client | null)?.from('carer_prefs').select('digest_on').eq('user_id', m.userId).maybeSingle()
        if (r && !r.error) { on = r.data ? r.data.digest_on !== false : true; await db.kv.put({ key: KEY, value: { userId: m.userId, on } }).catch(() => {}) }
        else throw new Error('offline')
      } catch {
        const c = (await db.kv.get(KEY).catch(() => undefined))?.value as { userId?: string; on?: boolean } | undefined
        if (c?.userId === m.userId && typeof c.on === 'boolean') on = c.on // the last answer the server gave
      }
      if (live) setState({ userId: m.userId, on })
    })()
    return () => { live = false }
  }, [])

  if (!state) return null
  const set = async (on: boolean) => {
    setNote('')
    const prev = state.on
    setState({ ...state, on })
    try {
      const r = await (supabase as Client | null)?.rpc('set_digest', { p_on: on }) // 0039: the table has no write grant, a PostgREST upsert would be refused
      if (!r || r.error) throw new Error('save failed')
      await db.kv.put({ key: KEY, value: { userId: state.userId, on } }).catch(() => {})
    } catch {
      setState({ ...state, on: prev }) // the server holds the choice; say so rather than pretend it saved
      setNote('Could not save. Try again when you are online.')
    }
  }
  return (
    <>
      <div className="sh-card sh-list" data-testid="digest-toggle">
        <div>
          <div className="sh-grow"><b>8 PM summary</b><div className="sh-sub">One calm note at 8 PM about who still has medicine to take.</div></div>
          <button type="button" className="sh-switch" role="switch" aria-checked={state.on} aria-label="8 PM summary" onClick={() => void set(!state.on)} />
        </div>
      </div>
      <p className="sh-sub sh-note">Turning this off never stops missed-medicine or Unwell alerts.</p>
      {note && <p className="sh-sub sh-note" role="status">{note}</p>}
    </>
  )
}
