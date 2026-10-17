import { useState } from 'react'
import { useKv } from '../safety/store'
import { capgoBridge, isNative } from './bridge'
import { disableType, enableType, type EnableResult, type HealthBridge, SENSORS, type SensorType, STATE_KEY, syncAll } from './health'

const NO_STATE = { enabled: [] as SensorType[] }
const MSG: Record<Exclude<EnableResult, 'on'>, string> = {
  denied: 'Not turned on. You said no, or your phone is blocking it. You can allow it in Health Connect or Settings.',
  unavailable: 'Health Connect is not on this phone yet. Install “Health Connect by Android” from the Play Store, then try again.'
}

/** One switch per kind of body data. Each asks your phone for permission only when you turn it on.
 *  Mount on Family or a settings screen. `bridge` is injectable for tests. */
export default function SensorSettings({ bridge, native = isNative() }: { bridge?: HealthBridge; native?: boolean }) {
  const st = useKv(STATE_KEY, NO_STATE)
  const [note, setNote] = useState<Partial<Record<SensorType, string>>>({})
  const [busy, setBusy] = useState<SensorType | null>(null)

  if (!native)
    return (
      <section aria-labelledby="ss-h">
        <h2 id="ss-h" className="hd">Phone health data</h2>
        <div className="grp" style={{ padding: 16 }}>
          <span className="sub">Steps, sleep, heart rate and blood pressure sync need the Bantay app on your phone. Until then, tap how long you walked on the Today screen.</span>
        </div>
      </section>
    )

  const toggle = async (type: SensorType, on: boolean) => {
    if (busy) return
    setBusy(type)
    setNote((n) => ({ ...n, [type]: '' }))
    try {
      if (on) {
        await disableType(type)
        setNote((n) => ({ ...n, [type]: 'Turned off. To remove access completely, use Health Connect or Settings.' }))
      } else {
        const b = bridge ?? capgoBridge()
        const r = await enableType(type, b)
        if (r === 'on') void syncAll(b)
        else setNote((n) => ({ ...n, [type]: MSG[r] }))
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
