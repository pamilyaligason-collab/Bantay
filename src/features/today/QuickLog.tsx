import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { liveMedicines } from '../health/meds'
import { checkIn, FAIL_TEXT, FEELINGS, feelingToast, logBp, logFeeling, logSugar, logWeight, moodLine, takeDose, takeMedication, useHasWriterCarer, type Feeling, type LogResult } from './actions'
import { useMyDoseRows, useMyMedications } from './useMyTakes'
import { useStorm } from './useStorm'
import BpCheckButton from '../health/bpcheck/BpCheckButton'
import { useActingCan, useActingPersonId } from '../viewas/viewAs' // S16-L1: acting person + View only (C-9)
import { logActivity, logReading } from '../log/store'
import QuickWalk from '../sensors/QuickWalk'
import MovePanel from '../exercise/MovePanel'
import PlateSheet from '../nutrition/PlateSheet'
import SaltLine from '../nutrition/SaltSummary'
import WaterSheet from '../nutrition/WaterSheet'
import { Icon, type IconName, type IconTone } from '../shell/Icon'

type Kind = 'bp' | 'sugar' | 'weight' | 'walk' | 'move' | 'dose' | 'mood' | 'meal' | 'water' | 'more' | 'pain' | 'sleep' | 'temp'
const PILLS: { id: Kind; label: string; icon: IconName; tone: IconTone | undefined; aria: string }[] = [
  { id: 'bp', label: 'BP', icon: 'gauge', tone: 'vitals', aria: 'Log blood pressure' },
  { id: 'sugar', label: 'Sugar', icon: 'drop', tone: 'vitals', aria: 'Log blood sugar' },
  { id: 'weight', label: 'Weight', icon: 'scale', tone: 'vitals', aria: 'Log weight' },
  { id: 'mood', label: 'How are you?', icon: 'smile', tone: undefined, aria: 'Log how you feel' },
  { id: 'water', label: 'Water', icon: 'glass', tone: undefined, aria: 'Log water you drank' },
  { id: 'more', label: 'More', icon: 'plus', tone: undefined, aria: 'More things to log' }
]
/** Behind More (frame today-log, 3 x 3): Dose taken, Food, Walk, Move, Pain, Sleep, Temperature, Mood, Water. One meaning per glyph (D-103 rule 5). */
const MORE: { id: Kind; label: string; icon: IconName }[] = [
  { id: 'dose', label: 'Dose taken', icon: 'pill' }, { id: 'meal', label: 'Food', icon: 'meal' }, { id: 'walk', label: 'Walk', icon: 'walk' },
  { id: 'move', label: 'Move', icon: 'move' }, { id: 'pain', label: 'Pain', icon: 'warn' }, { id: 'sleep', label: 'Sleep', icon: 'moon' },
  { id: 'temp', label: 'Temperature', icon: 'therm' }, { id: 'mood', label: 'Mood', icon: 'smile' }, { id: 'water', label: 'Water', icon: 'glass' }
]
/** Pain on the 0-10 scale, as five plain words. Stored as the activity kind `pain-<n>` (the same shape as `mood-<word>`). */
const PAIN: [number, string][] = [[0, 'No pain'], [2, 'Mild'], [5, 'Moderate'], [7, 'Strong'], [10, 'Worst']]

/** S16-L1 (C-5): L6 adds a trailing `personId` to the loggers in today/actions.ts. Until that merges the L0 signatures lack it, so call through this type; it stays valid after. */

const now = () => new Date().toISOString()

/** Pain, Sleep and Temperature have no logger in actions.ts (L6's file), so they write through the shared log store here, for the viewed person. */
async function logFor(personId: string | null, fn: (id: string) => Promise<unknown>): Promise<LogResult> {
  if (!personId) return 'signedout'
  try { await fn(personId); return 'ok' } catch { return 'failed' }
}
const FACE_CLASS: Record<Feeling, string> = { great: 'good', ok: 'good', notgreat: 'mid', unwell: 'bad' }

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

/** Quick log: six big tiles in a 3 x 2 grid (BP, Sugar, Weight, How are you?, Water, More), icon above the label. Each opens a small sheet and ends with a toast.
 *  More holds Dose taken, Food, Walk and Move. In a storm the mood tile reads "Is everyone safe?". */
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
  const storm = useStorm()
  const self = useActingPersonId() // the viewed person while an admin is acting, else me
  const personId = self ?? undefined
  const can = useActingCan() // null when not acting
  const lockLog = !!can && !can.log
  const lockMood = !!can && !can.mood
  const writer = useHasWriterCarer(self)

  const close = () => { setOpen(null); setErr(''); setA(''); setB('') }
  const run = async (p: Promise<LogResult>, done: string) => {
    if (busy) return
    setBusy(true)
    const r = await p
    setBusy(false)
    if (r === 'ok') { close(); notify(done) } else setErr(FAIL_TEXT[r])
  }
  const face = async (f: Feeling) => {
    if (busy) return
    setBusy(true)
    const r = await logFeeling(f, personId)
    setBusy(false)
    if (r === 'told' || r === 'nobody' || r === 'untold' || r === 'refused') { close(); notify(feelingToast(r)) } else setErr(FAIL_TEXT[r])
  }
  /** D-100: the small "I'm OK" beside How are you? is one tap, a check-in with no mood. */
  const imOk = async () => {
    if (busy) return
    setBusy(true)
    const r = await checkIn(personId)
    setBusy(false)
    notify(r === 'ok' ? (can ? 'Saved for them. Their family can see they are OK.' : "Saved. Your family can see you are OK.") : FAIL_TEXT[r])
  }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (open === 'bp') {
      const s = readNum(a, 50, 300)
      const d = readNum(b, 30, 200)
      if (s == null || d == null || d >= s) return setErr('Type the top number (50 to 300) and the bottom number (30 to 200). The top is the bigger one.')
      void run(logBp(Math.round(s), Math.round(d), personId), `Saved blood pressure ${Math.round(s)}/${Math.round(d)}`)
    } else if (open === 'sugar') {
      const v = readNum(a, 20, 700)
      if (v == null) return setErr('Type your sugar in mg/dL, a number from 20 to 700.')
      void run(logSugar(v, fasting, personId), `Saved sugar ${v}`)
    } else if (open === 'weight') {
      const v = readNum(a, 20, 300)
      if (v == null) return setErr('Type your weight in kg, a number from 20 to 300.')
      void run(logWeight(v, personId), `Saved weight ${v} kg`)
    } else if (open === 'temp') {
      const v = readNum(a, 30, 45)
      if (v == null) return setErr('Type the temperature in °C, a number from 30 to 45.')
      void run(logFor(self, (id) => logReading({ personId: id, takenAt: now(), test: 'temperature', value: v, unit: '°C' })), `Saved temperature ${v} °C`)
    } else if (open === 'sleep') {
      const h = readNum(a, 0, 16)
      if (h == null) return setErr('Type the hours you slept, a number from 0 to 16.')
      void run(logFor(self, (id) => logActivity({ personId: id, kind: 'sleep', minutes: Math.round(h * 60), steps: null, startedAt: now(), source: 'manual' })), `Saved sleep ${h} hours`)
    }
  }

  return (
    <>
      <div className="td-quick" role="group" aria-label="Quick log">
        {PILLS.map((p) => p.id === 'mood' ? (
          <div key={p.id} className="td-q td-q-mood">
            <button type="button" className="td-qm press" aria-label={lockMood ? `${p.aria}, view only` : p.aria} disabled={lockMood} onClick={() => setOpen(p.id)}>{storm ? 'Is everyone safe?' : p.label}</button>
            <button type="button" className="td-ok press" disabled={busy || lockMood} onClick={() => void imOk()}><Icon name={lockMood ? 'lock' : 'check'} size={16} />{lockMood ? 'View only' : "I'm OK"}</button>
          </div>
        ) : (
          <button key={p.id} type="button" className="td-q press" aria-label={lockLog ? `${p.aria}, view only` : p.aria} disabled={lockLog} onClick={() => setOpen(p.id)}>
            <Icon name={p.icon} tone={p.tone} boxed size={20} /><span>{p.label}</span>
          </button>
        ))}
      </div>
      {(lockLog || lockMood) && can?.reason && <p className="sub td-lock-why"><Icon name="lock" size={16} />View only. {can.reason}</p>}
      <SaltLine />
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
            {open === 'bp' && self && <BpCheckButton personId={self} forName="You" onSaved={(m) => { close(); notify(m) }} className="td-pill light" />}
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
              <button key={m.serverId ?? m.clientId ?? m.id} type="button" className="td-opt" disabled={busy} onClick={() => void run(takeMedication(m, takes, m.personId ?? personId), `Marked ${m.name} taken`)}>{m.name}{m.dose ? ` ${m.dose}` : ''}</button>
            )) : (
              <>
                <label>Medicine name<input value={a} onChange={(e) => setA(e.target.value)} placeholder="Losartan" /></label>
                <button type="button" className="td-pill light solid" disabled={busy || !a.trim()} onClick={() => void run(takeDose(a.trim(), personId), `Marked ${a.trim()} taken`)}>Mark taken</button>
              </>
            )}
            {err && <p className="td-err" role="alert">{err}</p>}
          </div>
        </Sheet>
      )}
      {open === 'mood' && (
        <Sheet title="How are you feeling?" onClose={close} focusFirst={false}>
          <div className="td-form">
            {FEELINGS.map(([f, label]) => (
              <button key={f} type="button" className={`td-face ${FACE_CLASS[f]}`} disabled={busy} onClick={() => void face(f)}>{label}</button>
            ))}
            {err && <p className="td-err" role="alert">{err}</p>}
            <p className="td-sub">{moodLine(writer)}</p>
          </div>
        </Sheet>
      )}
      {(open === 'temp' || open === 'sleep') && (
        <Sheet title={open === 'temp' ? 'Temperature' : 'Sleep'} onClose={close}>
          <form className="td-form" onSubmit={submit} noValidate>
            <label>{open === 'temp' ? 'Temperature (°C)' : 'Hours slept last night'}<input inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} placeholder={open === 'temp' ? '36.8' : '7'} /></label>
            {err && <p className="td-err" role="alert">{err}</p>}
            <button type="submit" className="td-pill light solid" disabled={busy}>Save</button>
          </form>
        </Sheet>
      )}
      {open === 'pain' && (
        <Sheet title="How strong is the pain?" onClose={close} focusFirst={false}>
          <div className="td-form">
            {PAIN.map(([n, word]) => <button key={n} type="button" className="td-opt" disabled={busy} onClick={() => void run(logFor(self, (id) => logActivity({ personId: id, kind: `pain-${n}`, minutes: null, steps: null, startedAt: now(), source: 'manual' })), `Saved pain: ${word.toLowerCase()}`)}>{word}</button>)}
            {err && <p className="td-err" role="alert">{err}</p>}
          </div>
        </Sheet>
      )}
      {open === 'more' && (
        <Sheet title="More" onClose={close} focusFirst={false}>
          <div className="td-more-grid" role="group" aria-label="More things to log">
            {MORE.map((m) => <button key={m.id} type="button" className="td-opt td-more-t" disabled={lockLog && m.id !== 'mood'} aria-label={lockLog && m.id !== 'mood' ? `${m.label}, view only` : undefined} onClick={() => setOpen(m.id)}><Icon name={m.icon} size={24} /><span>{m.label}</span></button>)}
          </div>
        </Sheet>
      )}
    </>
  )
}
