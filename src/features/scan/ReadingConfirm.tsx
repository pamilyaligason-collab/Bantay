// Scan & Capture, device reading: the numbers read off the photo, shown big. The person confirms or edits them BEFORE anything is saved.
import { useState } from 'react'
import { logReading } from '../log/store'
import { buildReadings, KIND_LABEL, KIND_ORDER, toTyped, UNIT_WORD, UNITS, type ReadingDraft, type ReadingKind } from './reading'

export default function ReadingConfirm({ draft, failed, personId, forName, onSaved, onBack }: {
  draft: ReadingDraft; failed: boolean; personId: string; forName: string; onSaved: () => void; onBack: () => void
}) {
  const [kind, setKind] = useState<ReadingKind>(draft.kind ?? 'bp')
  const [t, setT] = useState(toTyped(draft))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof t, v: string) => setT((x) => ({ ...x, [k]: v }))
  const pickKind = (k: ReadingKind) => { setKind(k); setT((x) => ({ ...x, unit: UNITS[k][0]!, value: k === draft.kind ? x.value : '' })); setErr('') }
  const empty = kind === 'bp' ? !t.systolic && !t.diastolic : !t.value
  const note = failed ? 'Could not read the photo (no signal or a problem). Type the numbers from the device.'
    : draft.kind == null ? 'That does not look like a health device. Pick what it is and type the numbers.'
    : empty ? 'The numbers were not clear. Type them from the device.' : 'Check these match the device before you save.'

  const save = async () => {
    const b = buildReadings(kind, t)
    if (!b.ok) return setErr(b.error)
    setBusy(true)
    const takenAt = new Date().toISOString()
    try {
      for (const [i, r] of b.readings.entries()) await logReading({ personId, takenAt, ...r }, { track: i === 0 })
      onSaved()
    } catch { setErr('Could not save on this phone. Try again.'); setBusy(false) }
  }

  return (
    <div className="sc-rd" data-testid="reading-confirm">
      <p className="sub" role="status">{note}</p>
      <p className="sub">For {forName}</p>
      <div className="dc-chips" role="group" aria-label="What is the device">
        {KIND_ORDER.map((k) => <button key={k} type="button" className="dc-chip" aria-pressed={k === kind} onClick={() => pickKind(k)}>{KIND_LABEL[k]}</button>)}
      </div>
      {kind === 'bp' ? (
        <div className="sc-big3">
          <div><label htmlFor="rd-top">Top</label><input id="rd-top" inputMode="numeric" autoComplete="off" value={t.systolic} onChange={(e) => set('systolic', e.target.value)} /><small>mmHg</small></div>
          <div><label htmlFor="rd-bot">Bottom</label><input id="rd-bot" inputMode="numeric" autoComplete="off" value={t.diastolic} onChange={(e) => set('diastolic', e.target.value)} /><small>mmHg</small></div>
          <div><label htmlFor="rd-pul">Pulse</label><input id="rd-pul" inputMode="numeric" autoComplete="off" value={t.pulse} onChange={(e) => set('pulse', e.target.value)} /><small>bpm, optional</small></div>
        </div>
      ) : (
        <div className="sc-big1">
          <label htmlFor="rd-val">{KIND_LABEL[kind]}</label>
          <input id="rd-val" inputMode="decimal" autoComplete="off" value={t.value} onChange={(e) => set('value', e.target.value)} />
          {UNITS[kind].length > 1
            ? <div className="dc-chips" role="group" aria-label="Unit">{UNITS[kind].map((u) => <button key={u} type="button" className="dc-chip" aria-pressed={u === t.unit} onClick={() => set('unit', u)}>{UNIT_WORD[u] ?? u}</button>)}</div>
            : <small>{UNITS[kind][0]}</small>}

        </div>
      )}
      {err && <p className="dc-err" role="alert">{err}</p>}
      <div className="sc-tools">
        <button type="button" className="dc-btn" disabled={busy} onClick={onBack}>Back</button>
        <button type="button" className="dc-btn dc-primary" disabled={busy} onClick={() => void save()}>Save reading</button>
      </div>
    </div>
  )
}
