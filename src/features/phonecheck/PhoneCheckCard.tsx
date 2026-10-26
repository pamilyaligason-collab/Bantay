import { App } from '@capacitor/app'
import { useCallback, useEffect, useState } from 'react'
import { db } from '../../db'
import { applyFix, fixCopy, hasAutostart, openAutostart } from './fix'
import { KEY_PHONE_LATER } from './keys'
import { probe, probeProblems, type ProbeResult } from './probe'
import './phonecheck.css'

/** The fix card of the screen `start-done-fix` ("One thing to fix: battery saver"). Only shown when the background check found a problem; it fixes the most important one with plain steps.
 *  Android never lets an app switch these on, so "Fix it now" asks or opens the right screen and the card checks again when the person comes back.
 *  "Remind me later" keeps a small card on Today until it is fixed (AlarmFixedToast), so the alarm problem is never silently dropped. */
export function PhoneCheckCard({ result, onLater, onFixed }: { result: ProbeResult; onLater?: () => void; onFixed?: () => void }) {
  const [r, setR] = useState(result)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => setR(result), [result])
  const problems = probeProblems(r)
  const top = problems[0]
  const recheck = useCallback(async () => {
    const next = await probe()
    setR(next)
    if (!probeProblems(next).length) { setMsg(''); onFixed?.() }
  }, [onFixed])
  useEffect(() => { // coming back from the Android screen: check again
    let off: (() => void) | undefined
    let gone = false
    try { void Promise.resolve(App.addListener('appStateChange', (s) => { if (s.isActive) void recheck() })).then((h) => { if (gone) void h.remove(); else off = () => void h.remove() }).catch(() => undefined) } catch { /* no app plugin */ }
    return () => { gone = true; off?.() }
  }, [recheck])
  if (!top) return null
  const c = fixCopy(top, r.oem)
  const fix = async () => {
    setBusy(true); setMsg('')
    const o = await applyFix(top)
    setBusy(false)
    if (o === 'failed') setMsg('We could not open Settings on this phone. Follow the steps above.')
    else void recheck()
  }
  const later = () => { void db.kv.put({ key: KEY_PHONE_LATER, value: { at: new Date().toISOString() } }); onLater?.() }
  return (
    <section className="pc-card" aria-label="Phone check">
      <div className="pc-head">
        <span className="pc-x" aria-hidden="true">!</span>
        <div className="pc-grow"><b>{c.title}</b><div className="pc-why">{c.why}</div></div>
      </div>
      <ol className="pc-steps">{c.steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <button type="button" className="pc-btn" disabled={busy} onClick={() => void fix()}>{c.button}</button>
      {top === 'battery' && hasAutostart(r.oem) && <button type="button" className="pc-btn2" onClick={() => void openAutostart()}>Open autostart settings</button>}
      <button type="button" className="pc-link" onClick={later}>Remind me later</button>
      {msg && <p className="pc-msg" role="status">{msg}</p>}
    </section>
  )
}
