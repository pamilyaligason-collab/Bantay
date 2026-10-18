import { useEffect, useState } from 'react'
import { db } from '../../db'
import PhoneWarnings, { PW_KEY, itemsFor, osKey, type Rec } from '../safety/PhoneWarnings'
import { isNativeAndroid, openSettings } from '../safety/settingsOpener'
import { onResume, put } from './steps'

type Answer = 'yes' | 'no' | 'unsure' | null

/** Android cannot read or set Emergency and Earthquake alerts, so: open the screen, then ask once. Yes hides this step and the Safety card for good. */
export default function WarningsStep() {
  const [line, setLine] = useState('')
  const [answer, setAnswer] = useState<Answer>(null)
  const [back, setBack] = useState(false)
  useEffect(() => {
    void db.kv.get('setup.warnings').then((r) => { if (r?.value === true) setAnswer('yes') }, () => undefined)
    return onResume(() => setBack(true))
  }, [])
  if (!isNativeAndroid()) return <PhoneWarnings level={2} />
  const open = async (t: 'wea' | 'earthquake') => { setBack(false); setLine((await openSettings(t)).line) }
  const reply = async (a: 'yes' | 'no' | 'unsure') => {
    setAnswer(a)
    if (a !== 'yes') return
    const at = new Date().toISOString()
    const ua = navigator.userAgent
    await put(PW_KEY, { items: Object.fromEntries(itemsFor('android').map((i) => [i.id, { state: 'on', at }])), checkedAt: at, os: osKey(ua) } satisfies Rec)
    await put('setup.warnings', true)
  }
  return (
    <div className="wz-body">
      <p className="sub" style={{ margin: 0 }}>Your phone, not Bantay, gives the warning seconds before an earthquake. Android will not let Bantay switch these on, so open them here.</p>
      <button type="button" className="btn" onClick={() => open('wea')}>Open Emergency alerts</button>
      <button type="button" className="btn2" onClick={() => open('earthquake')}>Open Earthquake alerts</button>
      {line && <p className="sub" role="status" style={{ margin: 0 }}>{line}</p>}
      <div className="grp wz-q" role="group" aria-label="Are Emergency alerts on?">
        <div className="wz-chipfield">
          <strong>{back ? 'Welcome back. Are Emergency alerts on?' : 'Are Emergency alerts on?'}</strong>
          <div className="wz-chips">
            <button type="button" className="wz-chip" aria-pressed={answer === 'yes'} onClick={() => reply('yes')}>Yes</button>
            <button type="button" className="wz-chip" aria-pressed={answer === 'no'} onClick={() => reply('no')}>No</button>
            <button type="button" className="wz-chip" aria-pressed={answer === 'unsure'} onClick={() => reply('unsure')}>Not sure</button>
          </div>
          {answer === 'yes' && <span className="sub" role="status">Thank you. This will not be asked again.</span>}
          {(answer === 'no' || answer === 'unsure') && <span className="sub" role="status">Turn on every alert type, then come back and tap Yes.</span>}
        </div>
      </div>
    </div>
  )
}
