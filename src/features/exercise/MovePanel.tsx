import { useMemo, useState } from 'react'
import { putKv } from '../safety/store'
import { Icon, type IconName } from '../shell/Icon'
import { FAIL_TEXT } from '../today/actions'
import { logMove } from './actions'
import { useMoveData } from './data'
import { DOCTOR_OK_KEY, GATE_KEY, GATE_TEXT, recommend, type Group, type Move } from './recommend'
import { weekProgress } from './weekly'
import './exercise.css'

// Icon tiles only, no GIFs. `Move.demo` is left for a later AnimatedDemo.
const GROUP_ICON: Record<Group, IconName> = { balance: 'pin', strength: 'bolt', stretch: 'wind', walk: 'walk', breathe: 'lungs' }
const GROUP_WORD: Record<Group, string> = { balance: 'Balance', strength: 'Strength', stretch: 'Stretch', walk: 'Walk', breathe: 'Breathing' }
const amount = (m: Move) => m.durationSec ? (m.durationSec >= 60 ? `${Math.round(m.durationSec / 60)} min` : `${m.durationSec} sec`) : `${m.reps} times`

/** The weekly ring: minutes toward 150 and strength or balance days toward 2, always as words as well as the ring. */
export function WeekRing({ minutes, goalMinutes, pct, strengthDays, goalDays }: ReturnType<typeof weekProgress>) {
  return (
    <div className="mv-week" role="group" aria-label="This week">
      <div className="mv-ring" style={{ '--mv-pct': `${pct}%` } as React.CSSProperties} aria-hidden="true"><span>{pct}%</span></div>
      <div className="mv-week-t">
        <b>{minutes} of {goalMinutes} minutes</b>
        <span>{strengthDays} of {goalDays} days of strength or balance</span>
      </div>
    </div>
  )
}

/** Move: today's 3 picks, one move at a time with big steps, a Stop if box and a Done button that logs it. */
export default function MovePanel({ notify }: { notify?: (msg: string) => void }) {
  const d = useMoveData()
  const [open, setOpen] = useState<Move | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const week = useMemo(() => weekProgress(d.acts), [d.acts])
  const rec = useMemo(() => recommend({ age: d.age, conditions: d.conditions, latestBp: d.latestBp, latestSugar: d.latestSugar, family: d.family, doneThisWeek: week.doneIds, gateOk: d.gateOk, doctorOk: d.doctorOk }), [d.age, d.conditions, d.latestBp, d.latestSugar, d.family, week.doneIds, d.gateOk, d.doctorOk])
  const ack = (key: string) => { setBusy(true); void putKv(key, true).catch(() => setErr('Could not save on this phone. Try again.')).finally(() => setBusy(false)) }

  if (rec.gate) {
    return (
      <div className="mv" data-testid="move-gate">
        <div className="mv-note"><Icon name="info" tone="vitals" boxed /><p>{GATE_TEXT}</p></div>
        <p className="sub">These are gentle moves for balance, strength and stretching. Stop any time something does not feel right.</p>
        {err && <p className="td-err" role="alert">{err}</p>}
        <button type="button" className="mv-big" disabled={busy} onClick={() => ack(GATE_KEY)}>I understand</button>
      </div>
    )
  }

  const done = async (m: Move) => {
    if (busy) return
    setBusy(true)
    const r = await logMove(m)
    setBusy(false)
    if (r === 'ok') { setOpen(null); setErr(''); notify?.(`Saved: ${m.name}`) } else setErr(FAIL_TEXT[r])
  }

  if (open) {
    return (
      <div className="mv" data-testid="move-detail">
        <button type="button" className="mv-back" onClick={() => { setOpen(null); setErr('') }}><Icon name="back" size={20} />All moves</button>
        <div className="mv-head"><Icon name={GROUP_ICON[open.group]} tone="vitals" boxed size={24} /><div><h3>{open.name}</h3><p className="sub">{open.tl} - {amount(open)}</p></div></div>
        <ol className="mv-steps">{open.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <div className="mv-stop" role="group" aria-label="Stop if">
          <b><Icon name="warn" size={20} />Stop if</b>
          <ul>{open.stopIf.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
        {err && <p className="td-err" role="alert">{err}</p>}
        <button type="button" className="mv-big" disabled={busy} onClick={() => void done(open)}>Done</button>
      </div>
    )
  }

  return (
    <div className="mv">
      <WeekRing {...week} />
      {rec.rest ? (
        <div className="mv-rest" role="status"><Icon name="move" tone="alert" boxed /><p>{rec.rest.text}</p></div>
      ) : (
        <>
          {rec.notes.map((n) => <p key={n} className="mv-n">{n}</p>)}
          {rec.restricted && !d.doctorOk && <button type="button" className="mv-sec" disabled={busy} onClick={() => ack(DOCTOR_OK_KEY)}>My doctor said OK</button>}
          <ul className="mv-list" aria-label="Today's moves">
            {rec.picks.map((m) => (
              <li key={m.id}>
                <button type="button" className="mv-card" onClick={() => setOpen(m)}>
                  <Icon name={GROUP_ICON[m.group]} tone="vitals" boxed size={22} />
                  <span className="mv-card-t"><b>{m.name}</b><small>{GROUP_WORD[m.group]} - {amount(m)}</small></span>
                  <Icon name="chev" size={20} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
