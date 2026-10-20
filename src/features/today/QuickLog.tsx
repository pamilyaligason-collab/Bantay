import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { liveMedicines } from '../health/meds'
import { FAIL_TEXT, logBp, logMood, logSugar, logWeight, takeDose, takeMedication, type LogResult } from './actions'
import { useMyDoseRows, useMyMedications } from './useMyTakes'
import QuickWalk from '../sensors/QuickWalk'


const ICONS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  gauge: 'M4 16a8 8 0 1 1 16 0M12 16l4-5',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z',
  scale: 'M8.5 10a3.5 3.5 0 0 1 7 0zM12 10l1.5-2M3 8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z',
  pill: 'M9.5 8.5l5 7M5.6 13.4l7.8-7.8a3.5 3.5 0 0 1 5 5l-7.8 7.8a3.5 3.5 0 0 1-5-5z',
  walk: 'M13.5 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM12 8l-2.5 3.5 2.5 2 .5 6M9.5 11.5L7 13M12 8l3 3 2.5.5M12 13.5l3 2.5',
  more: 'M4.5 12h1.5M11.25 12h1.5M18 12h1.5',
  smile: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01'
} as const
export function TodayIcon({ name, size = 22 }: { name: keyof typeof ICONS; size?: number }) {
  return <svg className="td-ic" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICONS[name]} /></svg>
}

type Kind = 'bp' | 'sugar' | 'weight' | 'walk' | 'dose' | 'mood'
const PILLS: { id: Kind; label: string; icon: keyof typeof ICONS; aria: string }[] = [
  { id: 'bp', label: 'BP', icon: 'gauge', aria: 'Log blood pressure' },
  { id: 'sugar', label: 'Sugar', icon: 'drop', aria: 'Log blood sugar' },
  { id: 'weight', label: 'Weight', icon: 'scale', aria: 'Log weight' },
  { id: 'walk', label: 'Walk', icon: 'walk', aria: 'Log a walk' },
  { id: 'dose', label: 'Dose', icon: 'pill', aria: 'Log a medicine you took' },
  { id: 'mood', label: 'Mood', icon: 'smile', aria: 'Log how you feel' }
]

/** Reads a typed number: whole text must be a finite number inside the range, else null. Never 0 for blank. */
export const readNum = (s: string, min: number, max: number): number | null => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

function Sheet({ title, onClose, children, focusFirst = true }: { title: string; onClose: () => void; children: ReactNode; focusFirst?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ;(focusFirst ? box.current?.querySelector<HTMLElement>('input, button.td-opt') : box.current)?.focus() // a sheet with chips first must not pop the keyboard
    return () => prev?.focus?.()
  }, [])
  // Portal into .bt: the scroll area is its own stacking context, so a sheet inside it would sit under the tab bar.
  return createPortal(
    <div className="td-sheet-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="td-sheet" ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
        <div className="td-grab" />
        <div className="td-sheet-h"><h2>{title}</h2><button type="button" className="td-x" onClick={onClose} aria-label="Close">Close</button></div>
        {children}
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}

/** Quick log: six buttons in a 3 x 2 grid (BP, Sugar, Weight, Walk, Dose, Mood), icon above the label. Each opens a small sheet and ends with a toast. */
export default function QuickLog({ notify }: { notify: (msg: string) => void }) {
  const [open, setOpen] = useState<Kind | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const allMeds = useMyMedications()
  const takes = useMyDoseRows()
  const meds = useMemo(() => liveMedicines(allMeds, allMeds[0]?.personId ?? ''), [allMeds])
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [fasting, setFasting] = useState(true)

  const close = () => { setOpen(null); setErr(''); setA(''); setB('') }
  const run = async (p: Promise<LogResult>, done: string) => {
    if (busy) return
    setBusy(true)
    const r = await p
    setBusy(false)
    if (r === 'ok') { close(); notify(done) } else setErr(FAIL_TEXT[r])
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (open === 'bp') {
      const s = readNum(a, 50, 300)
      const d = readNum(b, 30, 200)
      if (s == null || d == null || d >= s) return setErr('Type the top number (50 to 300) and the bottom number (30 to 200). The top is the bigger one.')
      void run(logBp(Math.round(s), Math.round(d)), `Saved blood pressure ${Math.round(s)}/${Math.round(d)}`)
    } else if (open === 'sugar') {
      const v = readNum(a, 20, 700)
      if (v == null) return setErr('Type your sugar in mg/dL, a number from 20 to 700.')
      void run(logSugar(v, fasting), `Saved sugar ${v}`)
    } else if (open === 'weight') {
      const v = readNum(a, 20, 300)
      if (v == null) return setErr('Type your weight in kg, a number from 20 to 300.')
      void run(logWeight(v), `Saved weight ${v} kg`)
    }
  }

  return (
    <>
      <div className="td-quick" role="group" aria-label="Quick log">
        {PILLS.map((p) => (
          <button key={p.id} type="button" className="td-q" aria-label={p.aria} onClick={() => setOpen(p.id)}>
            <TodayIcon name={p.icon} size={26} /><span>{p.label}</span>
          </button>
        ))}
      </div>
      {(open === 'bp' || open === 'sugar' || open === 'weight') && (
        <Sheet title={open === 'bp' ? 'Blood pressure' : open === 'sugar' ? 'Blood sugar' : 'Weight'} onClose={close}>
          <form className="td-form" onSubmit={submit} noValidate>
            {open === 'bp' ? (
              <div className="td-two">
                <label>Top number<input inputMode="numeric" value={a} onChange={(e) => setA(e.target.value)} placeholder="120" /></label>
                <label>Bottom number<input inputMode="numeric" value={b} onChange={(e) => setB(e.target.value)} placeholder="80" /></label>
              </div>
            ) : (
              <label>{open === 'sugar' ? 'Sugar (mg/dL)' : 'Weight (kg)'}<input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} placeholder={open === 'sugar' ? '100' : '60'} /></label>
            )}
            {open === 'sugar' && (
              <div className="td-seg" role="group" aria-label="When">
                <button type="button" aria-pressed={fasting} onClick={() => setFasting(true)}>Before eating</button>
                <button type="button" aria-pressed={!fasting} onClick={() => setFasting(false)}>After eating</button>
              </div>
            )}
            {err && <p className="td-err" role="alert">{err}</p>}
            <button type="submit" className="td-pill light solid" disabled={busy}>Save</button>
          </form>
        </Sheet>
      )}
      {open === 'walk' && (
        <Sheet title="Walk" onClose={close} focusFirst={false}>
          <QuickWalk embedded onSaved={(m) => { close(); notify(`Saved: walked about ${m} minutes`) }} />
        </Sheet>
      )}
      {open === 'dose' && (
        <Sheet title="Which medicine did you take?" onClose={close}>
          <div className="td-form">
            {meds.length ? meds.map((m) => (
              <button key={m.serverId ?? m.clientId ?? m.id} type="button" className="td-opt" disabled={busy} onClick={() => void run(takeMedication(m, takes), `Marked ${m.name} taken`)}>{m.name}{m.dose ? ` ${m.dose}` : ''}</button>
            )) : (
              <>
                <label>Medicine name<input value={a} onChange={(e) => setA(e.target.value)} placeholder="Losartan" /></label>
                <button type="button" className="td-pill light solid" disabled={busy || !a.trim()} onClick={() => void run(takeDose(a.trim()), `Marked ${a.trim()} taken`)}>Mark taken</button>
              </>
            )}
            {err && <p className="td-err" role="alert">{err}</p>}
          </div>
        </Sheet>
      )}
      {open === 'mood' && (
        <Sheet title="How are you feeling?" onClose={close}>
          <div className="td-form">
            {([['good', 'Good'], ['ok', 'Okay'], ['low', 'Not so good']] as const).map(([m, label]) => (
              <button key={m} type="button" className="td-opt" disabled={busy} onClick={() => void run(logMood(m), 'Saved how you feel')}>{label}</button>
            ))}
            {err && <p className="td-err" role="alert">{err}</p>}
          </div>
        </Sheet>
      )}
    </>
  )
}
