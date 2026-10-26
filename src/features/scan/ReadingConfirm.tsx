// Scan & Capture, device reading: the numbers read off the photo, shown big. The person confirms or edits them BEFORE anything is saved.
// R2 hazard: a number the model was not sure of (confidence under 0.9, or none) must be tapped (or edited) before Save works.
import { useRef, useState } from 'react'
import { deviceSpec, previewReading } from '../health/readingPreview'
import { logReading } from '../log/store'
import { buildReadings, KIND_LABEL, KIND_ORDER, toTyped, UNIT_WORD, UNITS, type ReadingDraft, type ReadingKind } from './reading'

const SURE = 0.9
const TEST_OF: Record<ReadingKind, string> = { bp: 'bp_systolic', glucose: 'glucose', weight: 'weight', temp: 'temperature', spo2: 'spo2' }
type Field = 'systolic' | 'diastolic' | 'pulse' | 'value'

export default function ReadingConfirm({ draft, failed, limited = false, personId, onSaved, onBack }: {
  draft: ReadingDraft; failed: boolean; limited?: boolean; personId: string; onSaved: () => void; onBack: () => void
}) {
  const [kind, setKind] = useState<ReadingKind>(draft.kind ?? 'bp')
  const [t, setT] = useState(toTyped(draft))
  const first = useRef(toTyped(draft)).current
  const [tapped, setTapped] = useState<Field[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof t, v: string) => setT((x) => ({ ...x, [k]: v }))
  const pickKind = (k: ReadingKind) => { setKind(k); setT((x) => ({ ...x, unit: UNITS[k][0]!, value: k === draft.kind ? x.value : '' })); setErr('') }
  const empty = kind === 'bp' ? !t.systolic && !t.diastolic : !t.value
  const fields: Field[] = kind === 'bp' ? ['systolic', 'diastolic', 'pulse'] : ['value']
  const unsure = draft.confidence == null || draft.confidence < SURE
  // prefilled, still as read, not yet tapped; editing a number counts as confirming it
  const waiting = fields.filter((f) => unsure && kind === draft.kind && first[f] !== '' && t[f] === first[f] && !tapped.includes(f))
  const tap = (f: Field) => setTapped((x) => (x.includes(f) ? x : [...x, f]))
  const note = limited ? 'Too many photo reads today. Try again tomorrow or type the numbers from the device.'
    : failed ? 'Could not read the photo (no signal or a problem). Type the numbers from the device.'
    : draft.kind == null ? 'That does not look like a health device. Pick what it is and type the numbers.'
    : empty ? 'The numbers were not clear. Type them from the device.'
    : waiting.length ? 'Tap each number to say it matches the device.' : 'Check these match the device before you save.'

  // the same colour and plain line as the add-reading sheet, from the numbers as typed (in the unit of the device)
  const built = buildReadings(kind, t)
  const spec = deviceSpec(TEST_OF[kind])
  const pv = built.ok && spec ? previewReading(spec, kind === 'bp'
    ? { top: String(built.readings[0]!.value), bottom: String(built.readings[1]!.value) }
    : { value: String(built.readings[0]!.value) }) : null

  const save = async () => {
    if (waiting.length) return setErr('Tap each number to confirm it matches the device.')
    if (!built.ok) return setErr(built.error)
    setBusy(true)
    const takenAt = new Date().toISOString()
    try {
      for (const [i, r] of built.readings.entries()) await logReading({ personId, takenAt, ...r }, { track: i === 0 })
      onSaved()
    } catch { setErr('Could not save on this phone. Try again.'); setBusy(false) }
  }

  const confirmBtn = (f: Field, label: string) => waiting.includes(f)
    ? <button type="button" className="dc-chip" data-testid={`tap-${f}`} aria-label={`Confirm ${label}`} onClick={() => tap(f)}>Tap to confirm</button>
    : null

  return (
    <div className="sc-rd" data-testid="reading-confirm">
      <p className="sub" role="status">{note}</p>
      <div className="dc-chips" role="group" aria-label="What is the device">
        {KIND_ORDER.map((k) => <button key={k} type="button" className="dc-chip" aria-pressed={k === kind} onClick={() => pickKind(k)}>{KIND_LABEL[k]}</button>)}
      </div>
      {kind === 'bp' ? (
        <div className="sc-big3">
          <div><label htmlFor="rd-top">Top</label><input id="rd-top" inputMode="numeric" autoComplete="off" value={t.systolic} onChange={(e) => set('systolic', e.target.value)} /><small>mmHg</small>{confirmBtn('systolic', 'top number')}</div>
          <div><label htmlFor="rd-bot">Bottom</label><input id="rd-bot" inputMode="numeric" autoComplete="off" value={t.diastolic} onChange={(e) => set('diastolic', e.target.value)} /><small>mmHg</small>{confirmBtn('diastolic', 'bottom number')}</div>
          <div><label htmlFor="rd-pul">Pulse</label><input id="rd-pul" inputMode="numeric" autoComplete="off" value={t.pulse} onChange={(e) => set('pulse', e.target.value)} /><small>bpm, optional</small>{confirmBtn('pulse', 'pulse')}</div>
        </div>
      ) : (
        <div className="sc-big1">
          <label htmlFor="rd-val">{KIND_LABEL[kind]}</label>
          <input id="rd-val" inputMode="decimal" autoComplete="off" value={t.value} onChange={(e) => set('value', e.target.value)} />
          {UNITS[kind].length > 1
            ? <div className="dc-chips" role="group" aria-label="Unit">{UNITS[kind].map((u) => <button key={u} type="button" className="dc-chip" aria-pressed={u === t.unit} onClick={() => set('unit', u)}>{UNIT_WORD[u] ?? u}</button>)}</div>
            : <small>{UNITS[kind][0]}</small>}
          {confirmBtn('value', KIND_LABEL[kind].toLowerCase())}
        </div>
      )}
      {pv && pv.state !== 'invalid' && (
        <div className="ar-prev" data-testid="reading-verdict" data-state={pv.state} role="status">
          {pv.word && <span className={`hv-state ${pv.state}`}>{pv.word}</span>}
          <span>{pv.line}</span>
        </div>
      )}
      {err && <p className="dc-err" role="alert">{err}</p>}
      <div className="sc-tools">
        <button type="button" className="dc-btn" disabled={busy} onClick={onBack}>Back</button>
        <button type="button" className="dc-btn dc-primary" disabled={busy || waiting.length > 0} onClick={() => void save()}>Save reading</button>
      </div>
    </div>
  )
}
