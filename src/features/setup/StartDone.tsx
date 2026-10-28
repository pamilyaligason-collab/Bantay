import { useEffect, useState } from 'react'
import { JackArt } from '../look/JackArt'
import { hasPasskeyFlag, loadFamily } from '../auth/family'
import { getMember } from '../auth/session'
import { PhoneCheckCard } from '../phonecheck/PhoneCheckCard'
import { probe, probeProblems, type ProbeResult } from '../phonecheck/probe'
import { Icon } from '../shell/Icon'
import { applyTextSize, TEXT_SIZE_KEY, type TextSize } from '../shell/textSize'
import { useKv } from '../shell/useKv'
import { recordConsent } from './consent'
import './setup.css'

const Switch = ({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) =>
  <button type="button" role="switch" className="sh-switch" aria-label={label} aria-checked={on} onClick={() => onChange(!on)} />

const known = (r: ProbeResult) => [r.notif_ok, r.exact_ok, r.battery_ok, r.alarms_ok].some((v) => v !== null)

/** `start-done` (3 of 3) and `start-done-fix`: replaces the old consent, phone check, text size and recap steps with one last screen.
 *  Consent is one quiet line, never a question: it is written when the person taps Open Today. The phone check runs by itself;
 *  when it passes there are two ticks and nothing else, when it fails the short fix card shows on top and Today still opens (the card's Remind me later is kept by S3's PhoneCheckCard in kv, so the Today card comes from S3 and S7, not from this screen). */
export default function StartDone({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('')
  const [finger, setFinger] = useState(false)
  const [phone, setPhone] = useState<ProbeResult | null>(null)
  const [big, setBig] = useKv<TextSize>(TEXT_SIZE_KEY, 'normal')
  const [simple, setSimple] = useKv<boolean>('mode.simple', false)
  useEffect(() => {
    let live = true
    void getMember().then((m) => {
      if (!live || !m?.personId) return
      setName(loadFamily().find((f) => f.personId === m.personId)?.displayName.trim().split(/\s+/)[0] ?? '')
      setFinger(hasPasskeyFlag(m.personId))
    }).catch(() => undefined)
    void probe().then((r) => { if (live) setPhone(r) }).catch(() => undefined) // in the background: never blocks Open Today
    return () => { live = false }
  }, [])
  const problems = phone ? probeProblems(phone) : []
  const open = () => { void recordConsent(); onDone() }
  return (
    <div className="bt">
      <div className="topbar" />
      <main className="scroll si-set">
        <span className="si-eyebrow">Step 3 of 3 · then Today</span>
        <div className="si-steps" aria-hidden="true"><i className="on" /><i className="on" /><i className="on" /></div>
        <div className="si-c">
          <JackArt name="hello" size={112} />
          <h1 className="pname">{name ? `You're in, ${name}` : "You're in"}</h1>
          <p className="si-hint">Jack will remind you about your medicines and help you call your family if you need help.</p>
        </div>
        {problems.length > 0 && phone && <PhoneCheckCard result={phone} onLater={() => undefined} />}
        <ul className="grp si-ticks" aria-label="Checks">
          {phone && known(phone) && (
            <li><span className={`si-tick ${problems.length ? 'bad' : 'ok'}`} aria-hidden="true"><Icon name={problems.length ? 'close' : 'check'} size={16} /></span>
              <div><b>Alarms, phone and text apps</b><span className="si-hint">{problems.length ? 'One thing to fix above' : 'Checked in the background. All good.'}</span></div></li>
          )}
          <li><span className="si-tick ok" aria-hidden="true"><Icon name="check" size={16} /></span>
            <div><b>{finger ? 'PIN and fingerprint' : 'PIN'}</b><span className="si-hint">Ready on this phone</span></div></li>
        </ul>
        <div className="grp si-opts">
          <div className="si-switchrow"><div className="grow"><b>Bigger text</b><span className="si-hint">Easier to read everywhere</span></div>
            <Switch label="Bigger text" on={big === 'large' || big === 'xlarge'} onChange={(v) => { const t: TextSize = v ? 'large' : 'normal'; setBig(t); applyTextSize(t) }} /></div>
          <div className="si-switchrow"><div className="grow"><b>Simple mode</b><span className="si-hint">Just big buttons for the daily things</span></div>
            <Switch label="Simple mode" on={simple === true} onChange={setSimple} /></div>
        </div>
        <p className="si-hint si-c">By using Bantay you agree to share your health records with your family. AI features and privacy are in Me, then Privacy.</p>
        <button type="button" className="btn" onClick={open}>Open Today</button>
      </main>
    </div>
  )
}
