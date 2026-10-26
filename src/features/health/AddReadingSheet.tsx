import { useState } from 'react'
import '../family/family.css'
import '../setup/setup.css'
import Sheet from '../family/Sheet'
import { logReading } from '../log/store'
import { chipTime, crisisOf, previewReading, type Crisis, type EntrySpec } from './readingPreview'
import CrisisCard from './bpcheck/CrisisCard'
import type { Range } from './ranges'
import './m7a.css'

type Chip = 'now' | 'morning' | 'evening' | 'other'
const CHIPS: { id: Chip; label: string }[] = [{ id: 'now', label: 'Now' }, { id: 'morning', label: 'Morning' }, { id: 'evening', label: 'Evening' }, { id: 'other', label: 'Other time' }]
const localInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

/** Add one reading for a person: top/bottom/pulse for blood pressure or a single value, a time chip, and the colour and plain line before saving. Writes through logReading (local first, synced later). */
export default function AddReadingSheet({ spec, personId, forName, family, onClose, onSaved }: { spec: EntrySpec; personId: string; forName: string; family?: Range | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [top, setTop] = useState('')
  const [bottom, setBottom] = useState('')
  const [pulse, setPulse] = useState('')
  const [value, setValue] = useState('')
  const [chip, setChip] = useState<Chip>('now')
  const [other, setOther] = useState(localInput(new Date()))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [crisis, setCrisis] = useState<Crisis | null>(null)
  const bp = spec.kind === 'bp'
  const p = previewReading(spec, { top, bottom, value }, family)
  const typed = bp ? top !== '' || bottom !== '' : value !== ''
  const when = () => (chip === 'other' ? new Date(other) : chipTime(chip, new Date()))

  const save = async () => {
    if (p.state === 'invalid') return setErr(p.line)
    const at = when()
    if (Number.isNaN(at.getTime()) || at.getTime() > Date.now() + 5 * 60_000) return setErr('Pick a time that has already passed.')
    const pu = pulse.trim() === '' ? null : Number(pulse)
    if (pu != null && (!Number.isFinite(pu) || pu < 20 || pu > 250)) return setErr('Check the pulse: it looks too small or too big.')
    setBusy(true)
    const takenAt = at.toISOString()
    try {
      if (bp) {
        await logReading({ personId, takenAt, test: 'bp_systolic', value: Number(top), unit: 'mmHg' })
        await logReading({ personId, takenAt, test: 'bp_diastolic', value: Number(bottom), unit: 'mmHg' }, { track: false })
        if (pu != null) await logReading({ personId, takenAt, test: 'heart_rate', value: pu, unit: 'bpm' }, { track: false })
      } else {
        await logReading({ personId, takenAt, test: spec.code, value: Number(value), unit: spec.unit })
      }
      onSaved(`${spec.label[0]!.toUpperCase()}${spec.label.slice(1)} saved.`)
      // a dangerous reading is saved first (the family row never waits on this screen), then the sheet shows what to do instead of closing
      const c = crisisOf(spec.kind === 'bp' ? 'bp' : spec.code, bp ? { top: Number(top), bottom: Number(bottom) } : { value: Number(value), unit: spec.unit })
      if (c) { setCrisis(c); setBusy(false); return }
      onClose()
    } catch { setErr('Could not save on this phone. Try again.'); setBusy(false) }
  }

  if (crisis) return <Sheet title={`Add ${spec.label}`} onClose={onClose}><CrisisCard kind={crisis} onClose={onClose} /></Sheet>
  return (
    <Sheet title={`Add ${spec.label}`} onClose={onClose}>
      <div className="fm-form md-form">
        <p className="sub">For {forName}</p>
        {bp ? (
          <div className="ar-three">
            <div><label htmlFor="ar-top">Top</label><input id="ar-top" inputMode="numeric" autoComplete="off" aria-describedby="ar-hint" value={top} onChange={(e) => setTop(e.target.value)} /><small>mmHg</small></div>
            <div><label htmlFor="ar-bot">Bottom</label><input id="ar-bot" inputMode="numeric" autoComplete="off" value={bottom} onChange={(e) => setBottom(e.target.value)} /><small>mmHg</small></div>
            <div><label htmlFor="ar-pul">Pulse</label><input id="ar-pul" inputMode="numeric" autoComplete="off" value={pulse} onChange={(e) => setPulse(e.target.value)} /><small>bpm, optional</small></div>
          </div>
        ) : (
          <div className="ar-one"><label htmlFor="ar-val">{spec.label[0]!.toUpperCase() + spec.label.slice(1)} ({spec.unit})</label><input id="ar-val" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} /></div>
        )}
        {bp && <p className="sub" id="ar-hint">Example: 120 on top, 80 on the bottom.</p>}
        <div role="group" aria-label="When" className="md-chips">
          {CHIPS.map((c) => <button key={c.id} type="button" className="wz-chip" aria-pressed={chip === c.id} onClick={() => setChip(c.id)}>{c.label}</button>)}
        </div>
        {chip === 'other' && <input type="datetime-local" aria-label="Date and time" value={other} max={localInput(new Date())} onChange={(e) => setOther(e.target.value)} />}
        {typed && (
          <div className="ar-prev" data-testid="reading-preview" data-state={p.state} role="status">
            {p.word && <span className={`hv-state ${p.state}`}>{p.word}</span>}
            <span>{p.line}</span>
          </div>
        )}
        {err && <p className="md-err" role="alert">{err}</p>}
        <div className="md-foot"><button type="button" className="btn" disabled={busy} onClick={() => void save()}>Save reading</button></div>
      </div>
    </Sheet>
  )
}
