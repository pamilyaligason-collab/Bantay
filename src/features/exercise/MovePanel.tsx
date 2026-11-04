import { useMemo, useState } from 'react'
import { putKv } from '../safety/store'
import { LiteVideo } from '../media/LiteVideo'
import { Carousel, Row } from '../look'
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
      <div className="mv-ring" style={{ '--mv-pct': `${pct}%` } as React.CSSProperties} aria-hidden="true"><span className="mv-ring-n"><b>{minutes}</b><small>of {goalMinutes} min</small></span></div>
      <div className="mv-week-t">
        <small className="mv-kick">This week</small>
        <b>{minutes === 0 ? 'No moving minutes yet' : `${minutes} of ${goalMinutes} minutes`}</b>
        {pct === 0 ? <span>Start with one move today</span> : <span>{pct}%</span>}
        <span>{strengthDays} of {goalDays} days of strength or balance</span>
      </div>
    </div>
  )
}

function Card({ m, onOpen, locked }: { m: Move; onOpen: (m: Move) => void; locked: boolean }) {
  return (
    <li>
      <button type="button" className="mv-card" aria-disabled={locked || undefined} title={locked ? GATE_TEXT : undefined} onClick={() => !locked && onOpen(m)}>
        <Icon name={GROUP_ICON[m.group]} tone="vitals" boxed size={20} />
        <span className="mv-card-t"><b>{m.name}</b><small>{GROUP_WORD[m.group]} · {POSTURE_WORD[m.posture]} · {amount(m)}{m.video ? ' · Video' : ''}</small></span>
        <Icon name="chev" size={20} />
      </button>
    </li>
  )
}

/** Move: today's plan of 3, all moves by category and sitting or standing, one move at a time with big steps, a video where there is one,
 *  a Stop if box and a Done button that logs it with the minutes the person chooses. */
export default function MovePanel({ notify, lockLog, hideRing }: { notify?: (msg: string) => void; lockLog?: string; hideRing?: boolean }) {
  const d = useMoveData()
  const [open, setOpen] = useState<Move | null>(null)
  const [mins, setMins] = useState(2)
  const [cat, setCat] = useState('all')
  const [posture, setPosture] = useState<Posture | 'any'>('any')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [all, setAll] = useState(false)
  const other = !!hideRing // another person's page: the doctor OK, rest advice, notes, today's plan and the gate are the viewer's own, so none shows or applies
  const week = useMemo(() => weekProgress(d.acts), [d.acts])
  const rec = useMemo(() => recommend(other ? { conditions: [], gateOk: true, doneThisWeek: [] } : { age: d.age, conditions: d.conditions, latestBp: d.latestBp, latestSugar: d.latestSugar, family: d.family, doneThisWeek: week.doneIds, gateOk: true, doctorOk: d.doctorOk }), [d.age, d.conditions, d.latestBp, d.latestSugar, d.family, week.doneIds, d.doctorOk, other])
  const locked = !other && !d.gateOk // H15: the page and the moves show either way; starting one needs the doctor OK row
  const ack = (key: string) => { setBusy(true); void putKv(key, true).catch(() => setErr('Could not save on this phone. Try again.')).finally(() => setBusy(false)) }
  const groups = CATS.find((c) => c.id === cat)?.groups ?? null
  const shown = useMemo(() => rec.available.filter((m) => (!groups || groups.includes(m.group)) && (posture === 'any' || m.posture === posture)), [rec.available, groups, posture])
  const pick = (m: Move) => { setMins(minutesOf(m)); setErr(''); setOpen(m) }

  const done = async (m: Move) => {
    if (busy) return
    setBusy(true)
    const r = await logMove(m, new Date(), mins)
    setBusy(false)
    if (r === 'ok') { setOpen(null); setErr(''); notify?.(`Saved: ${m.name}`) } else setErr(FAIL_TEXT[r])
  }

  const call911 = <p className="mv-911" data-testid="move-911">Chest pain that does not stop: call 911.</p> // everywhere a move can be read: a person told to rest needs it most
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
        {call911}
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

  const docRow = other ? null : (
    <div className="grp mv-doc" data-testid="doctor-ok">
      <Row icon="check" tint={locked ? 'amber' : 'green'} title="Doctor OK" sub={locked ? `${GATE_TEXT} Tap here once you have.` : 'You checked before starting.'} value={locked ? 'Not yet' : 'Yes'} onClick={locked && !busy ? () => ack(GATE_KEY) : undefined} />
    </div>
  )
  const carousel = [...rec.picks, ...rec.available.filter((m) => !rec.picks.some((p) => p.id === m.id))].slice(0, 6)
  return (
    <div className="mv">
      {!hideRing && <WeekRing {...week} />}
      {err && <p className="td-err" role="alert">{err}</p>}
      {rec.rest && !other ? (
        <><div className="mv-rest" role="status"><Icon name="move" tone="alert" boxed /><p>{rec.rest.text}</p></div>{call911}{docRow}</>
      ) : (
        <>
          {!other && rec.notes.map((n) => <p key={n} className="mv-n">{n}</p>)}
          {!other && rec.restricted && !d.doctorOk && <button type="button" className="mv-sec" disabled={busy} onClick={() => ack(DOCTOR_OK_KEY)}>My doctor said OK</button>}
          {!other && <>
          <h3 className="mv-h">Today's plan</h3>
          <Carousel label="Today's moves" testId="move-carousel">
            {carousel.map((m) => (
              <button key={m.id} type="button" className="mv-card mv-ccard" aria-disabled={locked || undefined} title={locked ? GATE_TEXT : undefined} onClick={() => !locked && pick(m)}>
                <span className="mv-pic" data-group={m.group} aria-hidden="true"><Icon name={GROUP_ICON[m.group]} size={44} /></span>
                <span className="mv-cbody">
                  <span className="mv-card-t"><b>{m.name}</b><small>{amount(m)}</small></span>
                  <span className="mv-chp"><span data-testid="posture-chip">{POSTURE_WORD[m.posture]}</span><span>{GROUP_WORD[m.group]}</span></span>
                  <span className="mv-stopif"><b>Stop if</b> {m.stopIf.slice(0, 2).join('; ')}.</span>
                  <span className="mv-start">{locked && <Icon name="lock" size={16} />}Start{locked && <small> after the doctor OK</small>}</span>
                </span>
              </button>
            ))}
          </Carousel>
          </>}
          {call911}
          {!other && locked && <p className="sub" data-testid="move-locked">Starting a move needs the doctor OK below.</p>}
          {docRow}
          {!all ? <button type="button" className="btn2" onClick={() => setAll(true)}>All moves<Icon name="chev" size={20} /></button> : (
            <>
              <h3 className="mv-h">All moves</h3>
              <div className="mv-chips" role="group" aria-label="Kind of move">
                {CATS.map((c) => <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>)}
              </div>
              <div className="mv-chips" role="group" aria-label="Sitting or standing">
                {POSTURES.map((p) => <button key={p.id} type="button" aria-pressed={posture === p.id} onClick={() => setPosture(p.id)}>{p.label}</button>)}
              </div>
              {shown.length ? (
                <ul className="mv-list" aria-label="Browse moves">
                  {shown.map((m) => <Card key={m.id} m={m} onOpen={pick} locked={locked} />)}
                </ul>
              ) : <p className="sub" role="status">No moves match. Try another kind or position.</p>}
            </>
          )}
        </>
      )}
    </div>
  )
}
