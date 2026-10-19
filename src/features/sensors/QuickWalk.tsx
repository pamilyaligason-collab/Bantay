import { useState } from 'react'
import { useKv } from '../safety/store'
import { logActivity } from '../log/store'
import { isNative } from './bridge'
import { currentPersonId, STATE_KEY } from './health'

const CHIPS = [10, 20, 30, 45]
const NO_STATE = { enabled: [] as string[] }

/** One-tap walk log for the PWA, and for the app until step sync is on. A phone browser has no step counter,
 *  so the person tells us. Logs source 'manual'. Hidden once the app is reading steps from Health Connect or HealthKit.
 *  ponytail: no DeviceMotion step estimate. It only works while this screen is open, needs an iOS permission prompt and a
 *  tuned detector, and a wrong number is worse than none. Add if the family asks for it. */
export default function QuickWalk({ native = isNative(), embedded = false, onSaved }: { native?: boolean; embedded?: boolean; onSaved?: (minutes: number) => void }) {
  const st = useKv(STATE_KEY, NO_STATE)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [signedOut, setSignedOut] = useState(false)
  if (native && st.enabled.includes('steps')) return null

  const log = async (minutes: number) => {
    if (busy || !Number.isFinite(minutes) || minutes < 1 || minutes > 600) return
    setBusy(true)
    setFailed(false)
    setSignedOut(false)
    try {
      const personId = await currentPersonId()
      if (!personId) return setSignedOut(true)
      const startedAt = new Date(Date.now() - minutes * 60_000).toISOString()
      await logActivity({ personId, kind: 'walk', minutes: Math.round(minutes), steps: null, startedAt, source: 'manual' })
      setDone(Math.round(minutes))
      onSaved?.(Math.round(minutes))
      setCustom('')
    } catch {
      setFailed(true) // storage blocked: say so, do not pretend it saved
    } finally {
      setBusy(false)
    }
  }
  const n = Number(custom)

  const Wrap = embedded ? 'div' : 'section'
  return (
    <Wrap aria-labelledby="qw-h" className={embedded ? 'td-walk' : undefined}>
      {embedded ? <h3 id="qw-h" className="td-sub-h">Did you walk today?</h3> : <h2 id="qw-h" className="hd">Did you walk today?</h2>}
      <div className={embedded ? undefined : 'grp'} style={{ padding: embedded ? 0 : 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <span className="sub">Tap how long you walked. About is fine.</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {CHIPS.map((m) => (
            <button key={m} type="button" className="pill" disabled={busy} onClick={() => log(m)}
              style={{ background: 'var(--fill)', color: 'var(--act)', minHeight: 48, minWidth: 64 }}>
              {m} min
            </button>
          ))}
        </div>
        <form style={{ display: 'flex', gap: 8, alignItems: 'center' }} onSubmit={(e) => { e.preventDefault(); void log(n) }}>
          <input aria-label="Other number of minutes" inputMode="numeric" type="number" min={1} max={600} value={custom}
            onChange={(e) => setCustom(e.target.value)} placeholder="Other"
            style={{ flex: 1, minWidth: 0, minHeight: 48, font: 'inherit', padding: '0 12px', borderRadius: 12, border: '1px solid var(--sep)', background: 'var(--cell)', color: 'var(--ink)' }} />
          <button type="submit" className="pill" disabled={busy || !(n >= 1)} style={{ background: 'var(--btn)', color: 'var(--btn-fg)', minHeight: 48 }}>Log</button>
        </form>
        <span className="sub" role="status" aria-live="polite">
          {signedOut ? 'Sign in to log a walk.' : failed ? 'That did not save. Try again.' : done != null ? `Saved: you walked about ${done} minutes.` : ''}
        </span>
      </div>
    </Wrap>
  )
}
