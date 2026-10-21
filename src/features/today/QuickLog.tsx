import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { liveMedicines } from '../health/meds'
import { FAIL_TEXT, logBp, logMood, logSugar, logWeight, takeDose, takeMedication, type LogResult } from './actions'
import { useMyDoseRows, useMyMedications } from './useMyTakes'
import QuickWalk from '../sensors/QuickWalk'
import MovePanel from '../exercise/MovePanel'
import PlateSheet from '../nutrition/PlateSheet'
import SaltTodayCard from '../nutrition/SaltSummary'
import WaterSheet from '../nutrition/WaterSheet'
import { Icon, type IconName, type IconTone } from '../shell/Icon'

type Kind = 'bp' | 'sugar' | 'weight' | 'walk' | 'move' | 'dose' | 'mood' | 'meal' | 'water'
const PILLS: { id: Kind; label: string; icon: IconName; tone: IconTone | undefined; aria: string }[] = [
  { id: 'bp', label: 'BP', icon: 'gauge', tone: 'vitals', aria: 'Log blood pressure' },
  { id: 'sugar', label: 'Sugar', icon: 'drop', tone: 'vitals', aria: 'Log blood sugar' },
  { id: 'weight', label: 'Weight', icon: 'scale', tone: 'vitals', aria: 'Log weight' },
  { id: 'walk', label: 'Walk', icon: 'walk', tone: undefined, aria: 'Log a walk' },
  { id: 'move', label: 'Move', icon: 'move', tone: undefined, aria: 'Gentle exercise for today' },
  { id: 'dose', label: 'Dose', icon: 'pill', tone: 'medicine', aria: 'Log a medicine you took' },
  { id: 'mood', label: 'Mood', icon: 'smile', tone: undefined, aria: 'Log how you feel' },
  { id: 'meal', label: 'Meal', icon: 'meal', tone: undefined, aria: 'Log what you ate' },
  { id: 'water', label: 'Water', icon: 'glass', tone: undefined, aria: 'Log water you drank' }
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

/** Quick log: nine buttons in a 3 x 3 grid (BP, Sugar, Weight, Walk, Move, Dose, Mood, Meal, Water), icon above the label. Each opens a small sheet and ends with a toast. */
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
            <Icon name={p.icon} tone={p.tone} boxed size={20} /><span>{p.label}</span>
          </button>
        ))}
      </div>
      <SaltTodayCard onMeal={() => setOpen('meal')} />
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
      {open === 'move' && (
        <Sheet title="Move" onClose={close} focusFirst={false}>
          <MovePanel notify={(m) => { close(); notify(m) }} />
        </Sheet>
      )}
      {open === 'meal' && (
        <Sheet title="Meal" onClose={close} focusFirst={false}>
          <PlateSheet onDone={(m) => { close(); notify(m) }} />
        </Sheet>
      )}
      {open === 'water' && (
        <Sheet title="Water" onClose={close} focusFirst={false}>
          <WaterSheet />
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
