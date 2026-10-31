import { useMemo, useState } from 'react'
import { putKv } from '../safety/store'
import { LiteVideo } from '../media/LiteVideo'
import { Icon, type IconName } from '../shell/Icon'
import { FAIL_TEXT } from '../today/actions'
import { logMove } from './actions'
import { useMoveData } from './data'
import { DOCTOR_OK_KEY, GATE_KEY, GATE_TEXT, recommend, type Group, type Move, type Posture } from './recommend'
import { minutesOf, weekProgress } from './weekly'
import './exercise.css'

// Icon tiles only, no GIFs. Where a move has an official video, the detail page shows it (tap to play).
const GROUP_ICON: Record<Group, IconName> = { mobility: 'move', balance: 'pin', strength: 'bolt', stretch: 'wind', walk: 'walk', breathe: 'lungs' }
const GROUP_WORD: Record<Group, string> = { mobility: 'Mobility', balance: 'Balance', strength: 'Strength', stretch: 'Stretch', walk: 'Walk', breathe: 'Breathing' }
const POSTURE_WORD: Record<Posture, string> = { seated: 'Sitting', 'standing-with-support': 'Standing', floor: 'Lying down' }
const amount = (m: Move) => m.durationSec ? (m.durationSec >= 60 ? `${Math.round(m.durationSec / 60)} min` : `${m.durationSec} sec`) : `${m.reps} times`

/** Category chips. Walking and breathing share one chip ("Walk and breathe"). */
const CATS: { id: string; label: string; groups: Group[] | null }[] = [
  { id: 'all', label: 'All', groups: null },
  { id: 'mobility', label: 'Mobility', groups: ['mobility'] },
  { id: 'balance', label: 'Balance', groups: ['balance'] },
  { id: 'strength', label: 'Strength', groups: ['strength'] },
  { id: 'stretch', label: 'Stretch', groups: ['stretch'] },
  { id: 'walk', label: 'Walk and breathe', groups: ['walk', 'breathe'] }
]
const POSTURES: { id: Posture | 'any'; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: 'seated', label: 'Sitting' },
  { id: 'standing-with-support', label: 'Standing' },
  { id: 'floor', label: 'Lying down' }
]

/** The weekly ring: minutes toward 150 and strength or balance days toward 2, always as words as well as the ring. */
export function WeekRing({ minutes, goalMinutes, pct, strengthDays, goalDays }: ReturnType<typeof weekProgress>) {
  return (
    <div className="mv-week" role="group" aria-label="This week">
      <div className="mv-ring" style={{ '--mv-pct': `${pct}%` } as React.CSSProperties} aria-hidden="true">{pct > 0 && <span>{pct}%</span>}</div>
      <div className="mv-week-t">
        <b>{minutes} of {goalMinutes} minutes</b>
        {pct === 0 && <span>Start with one move today</span>}
        <span>{strengthDays} of {goalDays} days of strength or balance</span>
      </div>
    </div>
  )
}

function Card({ m, onOpen }: { m: Move; onOpen: (m: Move) => void }) {
  return (
    <li>
      <button type="button" className="mv-card" onClick={() => onOpen(m)}>
        <Icon name={GROUP_ICON[m.group]} tone="vitals" boxed size={20} />
        <span className="mv-card-t"><b>{m.name}</b><small>{GROUP_WORD[m.group]} · {POSTURE_WORD[m.posture]} · {amount(m)}{m.video ? ' · Video' : ''}</small></span>
        <Icon name="chev" size={20} />
      </button>
    </li>
  )
}

/** Move: today's plan of 3, all moves by category and sitting or standing, one move at a time with big steps, a video where there is one,
 *  a Stop if box and a Done button that logs it with the minutes the person chooses. */
export default function MovePanel({ notify, lockLog }: { notify?: (msg: string) => void; lockLog?: string }) {
  const d = useMoveData()
  const [open, setOpen] = useState<Move | null>(null)
  const [mins, setMins] = useState(2)
  const [cat, setCat] = useState('all')
  const [posture, setPosture] = useState<Posture | 'any'>('any')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const week = useMemo(() => weekProgress(d.acts), [d.acts])
  const rec = useMemo(() => recommend({ age: d.age, conditions: d.conditions, latestBp: d.latestBp, latestSugar: d.latestSugar, family: d.family, doneThisWeek: week.doneIds, gateOk: d.gateOk, doctorOk: d.doctorOk }), [d.age, d.conditions, d.latestBp, d.latestSugar, d.family, week.doneIds, d.gateOk, d.doctorOk])
  const ack = (key: string) => { setBusy(true); void putKv(key, true).catch(() => setErr('Could not save on this phone. Try again.')).finally(() => setBusy(false)) }
  const groups = CATS.find((c) => c.id === cat)?.groups ?? null
  const shown = useMemo(() => rec.available.filter((m) => (!groups || groups.includes(m.group)) && (posture === 'any' || m.posture === posture)), [rec.available, groups, posture])
  const pick = (m: Move) => { setMins(minutesOf(m)); setErr(''); setOpen(m) }

  if (rec.gate) {
    return (
      <div className="mv" data-testid="move-gate">
        <div className="mv-note"><Icon name="info" tone="vitals" boxed /><p>{GATE_TEXT}</p></div>
        <p className="sub">These are gentle moves for mobility, balance, strength and stretching. Stop any time something does not feel right.</p>
        {err && <p className="td-err" role="alert">{err}</p>}
        <button type="button" className="mv-big" disabled={busy} onClick={() => ack(GATE_KEY)}>I understand</button>
      </div>
    )
  }

  const done = async (m: Move) => {
    if (busy) return
    setBusy(true)
    const r = await logMove(m, new Date(), mins)
    setBusy(false)
    if (r === 'ok') { setOpen(null); setErr(''); notify?.(`Saved: ${m.name}`) } else setErr(FAIL_TEXT[r])
  }

  if (open) {
    return (
      <div className="mv" data-testid="move-detail">
        <button type="button" className="mv-back" onClick={() => { setOpen(null); setErr('') }}><Icon name="back" size={20} />All moves</button>
        <div className="mv-head"><Icon name={GROUP_ICON[open.group]} tone="vitals" boxed size={20} /><div><h3>{open.name}</h3><p className="sub">{open.tl} · {POSTURE_WORD[open.posture]} · {amount(open)}</p></div></div>
        {open.video && <LiteVideo id={open.video.id} title={`${open.video.title} (${open.video.channel})`} />}
        <ol className="mv-steps">{open.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        <div className="mv-stop" role="group" aria-label="Stop if">
          <b><Icon name="warn" size={20} />Stop if</b>
          <ul>{open.stopIf.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
        <div className="mv-mins" role="group" aria-label="Minutes done">
          <button type="button" aria-label="One minute less" disabled={mins <= 1} onClick={() => setMins((n) => Math.max(1, n - 1))}>-</button>
          <output aria-live="polite"><b>{mins}</b> {mins === 1 ? 'minute' : 'minutes'}</output>
          <button type="button" aria-label="One minute more" disabled={mins >= 60} onClick={() => setMins((n) => Math.min(60, n + 1))}>+</button>
        </div>
        {err && <p className="td-err" role="alert">{err}</p>}
        {lockLog && <p className="sub" role="status">{lockLog}</p>}
        <button type="button" className="mv-big" disabled={busy || !!lockLog} onClick={() => void done(open)}>Done</button>
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
          <h3 className="mv-h">Today's plan</h3>
          <ul className="mv-list" aria-label="Today's moves">
            {rec.picks.map((m) => <Card key={m.id} m={m} onOpen={pick} />)}
          </ul>
          <h3 className="mv-h">All moves</h3>
          <div className="mv-chips" role="group" aria-label="Kind of move">
            {CATS.map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>)}
          </div>
          <div className="mv-chips" role="group" aria-label="Sitting or standing">
            {POSTURES.map((p) => <button key={p.id} type="button" aria-pressed={posture === p.id} onClick={() => setPosture(p.id)}>{p.label}</button>)}
          </div>
          {shown.length ? (
            <ul className="mv-list" aria-label="Browse moves">
              {shown.map((m) => <Card key={m.id} m={m} onOpen={pick} />)}
            </ul>
          ) : <p className="sub" role="status">No moves match. Try another kind or position.</p>}
        </>
      )}
    </div>
  )
}
