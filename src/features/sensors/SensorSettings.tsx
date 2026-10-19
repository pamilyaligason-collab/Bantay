import { useEffect, useState } from 'react'
import { track } from '../admin/events'
import { useKv } from '../safety/store'
import { capgoBridge, isNative } from './bridge'
import { disableType, enableTypes, reconcileGranted, type EnableResult, type HealthBridge, type HealthDiag, SENSORS, type SensorType, STATE_KEY, syncAll } from './health'

const NO_STATE = { enabled: [] as SensorType[] }
const MSG: Record<Exclude<EnableResult, 'on'>, string> = {
  denied: 'Not turned on. You said no, or your phone is blocking it. Open Health Connect, tap App permissions, tap Bantay, and allow it.',
  unavailable: 'Health Connect is not on this phone yet. Install “Health Connect by Android” from the Play Store, then try again.'
}

/** One switch per kind of body data. Each asks your phone for permission only when you turn it on.
 *  Mount on Family or a settings screen. `bridge` is injectable for tests. */
export default function SensorSettings({ bridge, native = isNative() }: { bridge?: HealthBridge; native?: boolean }) {
  const st = useKv(STATE_KEY, NO_STATE)
  const [note, setNote] = useState<Partial<Record<SensorType, string>>>({})
  const [busy, setBusy] = useState<SensorType | 'all' | null>(null)
  const [result, setResult] = useState('')
  const [diag, setDiag] = useState<{ d: HealthDiag | null; error: string } | null>(null)
  const [fix, setFix] = useState<{ kind: 'settings' | 'install'; text: string; error?: string } | null>(null)

  useEffect(() => { // the OS may already allow what the app does not list yet
    if (!native) return
    const b = bridge ?? capgoBridge()
    void reconcileGranted(b).then((added) => { if (added.length) void syncAll(b) }, () => undefined)
  }, [native, bridge])

  if (!native)
    return (
      <section aria-labelledby="ss-h">
        <h2 id="ss-h" className="hd">Phone health data</h2>
        <div className="grp" style={{ padding: 16 }}>
          <span className="sub">Steps, sleep, heart rate and blood pressure sync need the Bantay app on your phone. Until then, tap how long you walked on the Today screen.</span>
        </div>
      </section>
    )

  const explain = (r: EnableResult, error?: string) => {
    if (r === 'on') return setFix(null)
    setFix({ kind: r === 'unavailable' ? 'install' : 'settings', text: MSG[r], error })
  }
  const turnOnAll = async () => {
    if (busy) return
    setBusy('all')
    setFix(null)
    setResult('')
    try {
      const b = bridge ?? capgoBridge()
      const r = await enableTypes(SENSORS.map((x) => x.type), b)
      const n = r.granted.length
      if (r.result === 'on') { void track('action', 'sensors_on'); void syncAll(b) }
      if (r.result === 'on' && n < SENSORS.length) setFix({ kind: 'settings', text: 'Some were not allowed. You can allow the rest in Health Connect.' })
      else explain(r.result, r.error)
      // always end with one visible line
      setResult(r.result === 'on' ? `Allowed ${n} of ${SENSORS.length}.` : r.result === 'unavailable' ? `Not allowed: Health Connect is not available.${r.error ? ` (${r.error})` : ''}` : r.error ? `Not allowed (0 of ${SENSORS.length}). Error: ${r.error}` : `Declined: 0 of ${SENSORS.length} allowed.`)
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(null)
    }
  }
  const check = async () => {
    const b = bridge ?? capgoBridge()
    try {
      setDiag({ d: (await b.diagnose?.()) ?? null, error: b.diagnose ? '' : 'This phone has no check available.' })
    } catch (e) {
      setDiag({ d: null, error: e instanceof Error ? e.message : String(e) })
    }
  }
  const android = /Android\s+([\d.]+)/.exec(navigator.userAgent)?.[1] ?? 'unknown'
  const details = diag ? JSON.stringify({ android, userAgent: navigator.userAgent, ...diag.d, error: diag.error || undefined }, null, 2) : ''
  const openFix = () => void (bridge ?? capgoBridge()).openSettings?.(fix!.kind).catch(() => {})

  const toggle = async (type: SensorType, on: boolean) => {
    if (busy) return
    setBusy(type)
    setNote((n) => ({ ...n, [type]: '' }))
    try {
      if (on) {
        await disableType(type)
        void track('action', 'sensors_off')
        setNote((n) => ({ ...n, [type]: 'Turned off. To remove access completely, use Health Connect or Settings.' }))
      } else {
        const b = bridge ?? capgoBridge()
        const r = await enableTypes([type], b)
        if (r.result === 'on') { void track('action', 'sensors_on'); void syncAll(b) }
        else { setNote((n) => ({ ...n, [type]: MSG[r.result as Exclude<EnableResult, 'on'>] })); explain(r.result, r.error) }
      }
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby="ss-h">
      <h2 id="ss-h" className="hd">Phone health data</h2>
      <p className="sec">Off until you turn a switch on. Bantay only reads. It never changes your phone’s health data, and never puts these numbers in a notification.</p>
      <div className="grp">
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          <span className="grow">
            <span style={{ display: 'block' }}>Turn on all four</span>
            <span className="sub" style={{ display: 'block', fontSize: 14 }}>Your phone asks once.</span>
          </span>
          <button type="button" className="btn2" style={{ width: '100%' }} disabled={busy !== null} onClick={() => void turnOnAll()}>Turn on all</button>
          {result && <span className="sub" role="status" style={{ display: 'block', fontSize: 14 }}>{result}</span>}
        </div>
        {fix && (
          <div className="row">
            <span className="grow">
              <span className="sub" aria-live="polite" style={{ fontSize: 14 }}>{fix.text}</span>
              {fix.error && <span className="sub" style={{ fontSize: 12 }}>{fix.error}</span>}
            </span>
            <button type="button" className="btn2" onClick={openFix}>{fix.kind === 'install' ? 'Get Health Connect' : 'Open Health Connect'}</button>
          </div>
        )}
        <details className="row" style={{ display: 'block' }} onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) void check() }}>
          <summary style={{ cursor: 'pointer', minHeight: 32 }}>Health Connect check</summary>
          {!diag && <p className="sub" style={{ fontSize: 14 }}>Checking...</p>}
          {diag && (
            <div className="sub" style={{ fontSize: 14 }}>
              <p>Health Connect: {diag.d?.available == null ? 'could not tell' : diag.d.available ? 'available' : 'not available'}. {diag.d?.reason}</p>
              <p>Android version: {android}</p>
              <p>Allowed now: {diag.d?.granted.length ? diag.d.granted.join(', ') : 'none'}</p>
              {diag.error && <p>Error: {diag.error}</p>}
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>{details}</pre>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn2" onClick={() => void (bridge ?? capgoBridge()).openSettings?.('settings').catch(() => {})}>Open Health Connect</button>
                <button type="button" className="btn2" onClick={() => void navigator.clipboard?.writeText(details).catch(() => {})}>Copy details</button>
              </div>
            </div>
          )}
        </details>
      </div>
      <div className="grp">
        {SENSORS.map(({ type, label, why }) => {
          const on = st.enabled.includes(type)
          return (
            <div className="row" key={type}>
              <span className="grow">
                <span>{label}</span>
                <span className="sub" style={{ fontSize: 14 }}>{why}</span>
                {note[type] && <span className="sub" role="status" style={{ fontSize: 14 }}>{note[type]}</span>}
              </span>
              <button type="button" role="switch" aria-checked={on} aria-label={label} className="sw" disabled={busy !== null}
                style={{ background: on ? 'var(--ok)' : 'var(--sep)' }} onClick={() => toggle(type, on)}>
                <span style={{ left: on ? 22 : 2 }} />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
