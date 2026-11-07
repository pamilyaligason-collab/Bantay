import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Icon } from '../shell/Icon'
import { Section } from '../look'
import { celebrate } from '../look/celebrate'
import { Ring } from '../look/Ring'
import { useReducedMotion } from '../look/useReducedMotion'
import { useKv } from '../shell/useKv'
import { useFamilyPeople } from '../family/roster'
import { bpDue, checkInDue, pickMover, useNudgeMover, waterDue } from '../nudge/nudgeDue'
import { shortName } from '../inbox/build'
import type { AlertRow } from '../notify/store'
import { useAlertRows } from '../notify/useAlerts'
import { useSelfPerson } from '../setup/useProfile'
import { useActing, useActingCan, useActingPersonId } from '../viewas/viewAs'
import { NO_ACTIVITY, useActivity } from '../health/useActivity'
import { logWater } from '../nutrition/actions'
import { ML_PER_TAP, onDay } from '../nutrition/logic'
import { NO_WATER, useGoal, useWater } from '../nutrition/hooks'
import { checkIn, FAIL_TEXT } from './actions'
import { batteryRow, bpRow, checkInRow, countLeft, doneCardSeen, extraLine, markDoneCardSeen, markPrioPending, PRIORITY, prioPendingSeen, ringValue, waterRow, type PriKey } from './dayRows'
import { clock } from '../health/model'
import { rowLeaveMs, TICK_MS } from './doneMorph'
import { useMissedToday } from './missed'
import { useWeekData } from './MyWeek'
import NextUp, { MedsCheck } from './NextUp'
import PlanToday from './PlanToday'
import { MoodSheet, MoreSheet } from './QuickLog'
import SelfCare from './SelfCare'
import { Todo } from './Todo'
import type { SelfCareEntry } from './breathLogic'
import type { NextItem } from './nextPick'
import { useNext } from './useNext'
import { useStorm } from './useStorm'
import { useBattery } from './useBattery'
import { useWarnings } from './WarningCard'

/** "<Name> needs you" while someone else has a missed dose; else "All yours today", or "<Viewed>'s day" while an admin views as that person. */
export const needsLine = (names: string[], viewed = ''): string => (names.length === 0 ? (viewed ? `${viewed}'s day` : 'All yours today') : names.length === 1 ? `${names[0]} needs you` : `${names[0]} and ${names.length - 1} more need you`)

type Phase = 'tick' | 'out'
const NO_ALERTS: AlertRow[] = []
const NAMES: Record<PriKey, string> = { bp: 'Blood pressure', water: 'Water', checkin: 'Check-in' }
const BURSTS = [['-22px', '-18px'], ['24px', '-16px'], ['-18px', '20px'], ['22px', '18px']]
/** The icon of a row that was just finished: the tick draws and a small burst plays (the burst is left out under reduced motion). */
function TickIcon({ burst }: { burst: boolean }) {
  return (
    <span className="td-todo-ic td-tick" aria-hidden="true">
      <Icon name="check" size={18} />
      {burst && BURSTS.map(([x, y], i) => <i key={i} className="td-burst" style={{ '--x': x, '--y': y } as CSSProperties} />)}
    </span>
  )
}

/** Board "My day": a ring with the count, then the to-do rows. Doses, breath and the plan reuse the existing cards, flattened inside this one. */
export default function MyDay({ notify }: { notify: (msg: string) => void }) {
  const next = useNext()
  const storm = useStorm() // a nearby cyclone: the How are you? row asks "Is everyone safe?" as the old tile did (the sheet is unchanged)
  const [held, setHeld] = useState<NextItem | null>(null) // the dose card stays up while its take is saved and the done-morph plays
  const item = held ?? next.item
  const self = useActingPersonId()
  const personId = self ?? ''
  const { ready } = useSelfPerson()
  const can = useActingCan()
  const viewing = useActing()
  const lockLog = !!can && !can.log
  const lockMood = !!can && !can.mood
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<'mood' | 'more' | null>(null)
  const now = new Date()
  const today = now.toDateString() // the memo below must refresh when the day changes (phone left on Today overnight)
  const { readings, loaded: readingsIn } = useWeekData(personId)
  const water = useWater(personId, 2)
  const goal = useGoal(personId)
  const activity = useActivity(personId, 2)
  const [breaths, , breathsIn] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const { people } = useFamilyPeople()
  const alertRows = useAlertRows()
  const battery = useBattery()
  const missedAll = useMissedToday(viewing.acting ? NO_ALERTS : alertRows).map((m) => ({ ...m, name: shortName(people.find((p) => p.id === m.personId)?.name) ?? 'Someone' }))
  const missed = missedAll.filter((m) => !m.quiet) // D-145: after 3 alerts a missed dose is silent and folds out of the open rows
  const missedQuiet = missedAll.filter((m) => m.quiet)
  const rows = useMemo(() => {
    const bat = viewing.acting ? null : batteryRow(battery, now) // the phone's own battery is not the viewed person's
    const ci = checkInRow(activity, now, !!self || !ready), bp = bpRow(readings, now), wa = goal.waterMl == null ? null : waterRow(water, goal.waterMl, now, goal.waterSource) // no water goal under 1 year: no row
    // selfcare.log is not by person: while viewing, the admin's own breaths are not the viewed person's
    const breathed = !viewing.acting && breaths.some((b) => new Date(b.at).toDateString() === now.toDateString())
    return { ci, bp, wa, bat, breathed, list: [ci, bp, ...(wa ? [wa] : []), { done: breathed }, ...(bat ? [bat] : []), ...(item.kind === 'dose' ? [{ done: false }] : []), ...missed.map(() => ({ done: false }))] }
  }, [activity, readings, water, goal.waterMl, goal.waterSource, breaths, battery, viewing.acting, item.kind, self, ready, today, missed.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const c = countLeft(rows.list)
  // the breath row folds when it was already done on arrival; a breath finished on screen waits for the next visit, so the open sheet and the Start button it returns to never vanish under the person
  const breathSeed = useRef<{ sig: string; v: boolean } | null>(null)
  if (breathsIn && breathSeed.current?.sig !== `${personId}|${today}`) breathSeed.current = { sig: `${personId}|${today}`, v: rows.breathed }
  const breathFold = !!breathSeed.current?.v
  const reduced = useReducedMotion()
  const pdone: Record<PriKey, boolean> = { bp: rows.bp.done, water: !!rows.wa?.done, checkin: rows.ci.done }
  const PRI = rows.wa ? PRIORITY : PRIORITY.filter((k) => k !== 'water') // a person with no water goal has two priorities
  const priDone = PRI.every((k) => pdone[k])
  // S22-B: a priority that turns done while the screen is open ticks, bursts, then leaves for the fold. Rows already done on arrival (or after switching person or day) never animate.
  const [phase, setPhase] = useState<Partial<Record<PriKey, Phase>>>({})
  const [card, setCard] = useState(false)
  const [foldOpen, setFoldOpen] = useState(false)
  const was = useRef<{ sig: string; done: Record<PriKey, boolean> } | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const acted = useRef<PriKey | null>(null) // the row whose control the person just used: if it finishes, focus must not be lost with the swapped control
  const foldFocus = useRef(false)
  const [said, setSaid] = useState('')
  const dayEl = useRef<HTMLDivElement>(null)
  const loaded = readingsIn && activity !== NO_ACTIVITY && water !== NO_WATER // unknown is not done (ML-05)
  const sig = `${personId}|${today}`
  useEffect(() => { setCard(false) }, [sig]) // a new day or person starts without the card (declared first: the effect below may then show it)
  useEffect(() => {
    if (!loaded) { was.current = null; return }
    const prev = was.current
    was.current = { sig, done: pdone }
    const showCard = () => {
      if (priDone && !doneCardSeen(new Date(), personId)) {
        markDoneCardSeen(new Date(), personId)
        setCard(true)
        celebrate('allDone')
      }
    }
    if (!priDone) markPrioPending(new Date(), personId)
    if (!prev || prev.sig !== sig) { if (priDone && prioPendingSeen(new Date(), personId)) showCard(); return } // finished on another screen (blood pressure) and came back: the remount still owes the card once
    const fresh = PRI.filter((k) => !prev.done[k] && pdone[k])
    if (!fresh.length) return
    const set = (k: PriKey, v: Phase | undefined) => setPhase((p) => { const n = { ...p }; if (v) n[k] = v; else delete n[k]; return n })
    for (const k of fresh) {
      set(k, reduced ? 'out' : 'tick')
      if (!reduced) timers.current.push(setTimeout(() => set(k, 'out'), TICK_MS))
      timers.current.push(setTimeout(() => set(k, undefined), (reduced ? 0 : TICK_MS) + rowLeaveMs(reduced)))
    }
    setSaid(fresh.map((k) => `${NAMES[k]} done`).join('. '))
    timers.current.push(setTimeout(() => setSaid(''), 4000))
    if (acted.current === 'water' && fresh.includes('water')) { // the row folds away after the tick: the + water button on the fold bar takes focus, so more glasses stay one tap away
      // no focus gap while the tick plays (ML-47): the fold button holds it until + water exists; with no fold yet, the next open row does
      const nextOpen = PRI.find((x) => x !== 'water' && !pdone[x])
      ;(foldBtn.current ?? (nextOpen ? dayEl.current?.querySelector<HTMLElement>(`[data-testid="myday-${nextOpen}"] :is(button:not(:disabled), a[href])`) : null))?.focus()
      timers.current.push(setTimeout(() => dayEl.current?.querySelector<HTMLElement>('[data-testid="myday-water-add"]')?.focus(), (reduced ? 0 : TICK_MS) + rowLeaveMs(reduced) + 50))
      acted.current = null
    } else if (acted.current && fresh.includes(acted.current)) { // keyboard and screen-reader users: the control they used is gone, so focus goes to the next open row, else the fold button
      const nextK = PRI.slice(PRI.indexOf(acted.current) + 1).concat(PRI).find((x) => !pdone[x])
      const el = nextK && dayEl.current?.querySelector<HTMLElement>(`[data-testid="myday-${nextK}"] :is(button:not(:disabled), a[href])`)
      if (el) el.focus(); else foldFocus.current = true
      acted.current = null
    }
    showCard()
  }, [loaded, sig, pdone.bp, pdone.water, pdone.checkin]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const foldN = PRI.filter((k) => pdone[k] && !phase[k]).length
  useEffect(() => { if (foldFocus.current && foldBtn.current) { foldBtn.current.focus(); foldFocus.current = false } }, [foldN])
  const foldId = useId()
  const foldBtn = useRef<HTMLButtonElement>(null)
  // D-145 / ML-47: a missed dose that goes quiet while you watch folds away: say so politely, and if focus was on its Open link (now gone) put it on the fold button, not on the page top
  const loudIds = useRef<string[]>([])
  const inMissed = useRef(false)
  const quietIds = missedQuiet.flatMap((m) => m.alertIds)
  const quietKey = quietIds.join(',')
  useEffect(() => {
    const went = missedQuiet.filter((m) => m.alertIds.some((id) => loudIds.current.includes(id)))
    if (!went.length) return
    setSaid(`${went.map((m) => m.name).join(' and ')}: missed a medicine, no more reminders. Moved to Done today.`)
    timers.current.push(setTimeout(() => setSaid(''), 4000))
    if (inMissed.current && (!document.activeElement || document.activeElement === document.body)) { foldBtn.current?.focus(); inMissed.current = false }
  }, [quietKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loudIds.current = missed.flatMap((m) => m.alertIds) })
  const folded = PRI.filter((k) => pdone[k] && !phase[k])
  const batFold = !!rows.bat?.done
  const foldCount = folded.length + (batFold ? 1 : 0) + (breathFold ? 1 : 0) + missedQuiet.length
  const shown = PRI.filter((k) => !folded.includes(k))
  // D-125: Due pills and the one mover stay off while a warning or storm shows, on a view-only row, and before the person is known
  const warn = useWarnings()
  const calmDay = !warn.onScreen && !storm && !!self
  // unknown is not due (ML-05): a row waits for its own rows to arrive, or the empty first paint would read as "nothing logged"
  const due = {
    bp: calmDay && readingsIn && !lockLog && bpDue(readings, now),
    checkin: calmDay && activity !== NO_ACTIVITY && !lockMood && checkInDue(activity, now),
    water: calmDay && water !== NO_WATER && !lockLog && waterDue(water, goal.waterMl, now), // false with no goal
  }
  const mover = useNudgeMover('today', pickMover([{ key: 'bp', due: due.bp }, { key: 'checkin', due: due.checkin }, { key: 'water', due: due.water }], false))
  const run = async (p: Promise<'ok' | keyof typeof FAIL_TEXT>, done: string, key: PriKey) => {
    if (busy) return
    acted.current = key
    timers.current.push(setTimeout(() => { acted.current = null }, 5000)) // a glass that does not finish the goal must not claim focus later
    setBusy(true)
    const r = await p
    setBusy(false)
    notify(r === 'ok' ? done : FAIL_TEXT[r])
  }
  const calm = item.kind === 'calm'
  const glasses = Math.round(onDay(water, now).reduce((s, r) => s + r.ml, 0) / ML_PER_TAP) // the right side of the Water row: the count only
  const tick = (k: PriKey) => (phase[k] ? <TickIcon burst={phase[k] === 'tick' && !reduced} /> : undefined)
  const priRow: Record<PriKey, ReactNode> = {
    bp: (
      <Todo icon="gauge" tint="blue" title={rows.bp.title} sub={rows.bp.sub} testId="myday-bp" due={due.bp} move={mover === 'bp'} badge={1} lead={tick('bp')}>
        {lockLog ? <button type="button" className="btn2 td-todo-go" disabled aria-label="Log blood pressure, view only">Log</button> : <a className="btn2 td-todo-go" href={rows.bp.href}>Log</a>}
      </Todo>
    ),
    water: (
      <Todo icon="glass" tint="teal" title={rows.wa?.title ?? ''} sub={rows.wa?.sub ?? ''} testId="myday-water" due={due.water} move={mover === 'water'} badge={2}
        lead={tick('water') ?? (
          <button type="button" className="td-todo-ic td-todo-plus" data-tint="teal" disabled={busy || lockLog} aria-label={lockLog ? 'Add a glass of water, view only' : 'Add a glass of water'}
            onClick={() => void run(logWater(ML_PER_TAP, new Date(), self ?? undefined), 'Saved a glass of water', 'water')}><Icon name="plus" size={22} /></button>
        )}>
        <b className="td-todo-count">{glasses}<span className="td-vh"> glasses today</span></b>
      </Todo>
    ),
    checkin: (
      <Todo icon="smile" tint="green" title={storm ? 'Is everyone safe?' : rows.ci.title} sub={rows.ci.sub} testId="myday-checkin" onMain={lockMood ? undefined : () => setSheet('mood')} mainLabel="How are you? Pick a face" due={due.checkin} move={mover === 'checkin'} badge={PRI.indexOf('checkin') + 1} lead={tick('checkin')}>
        {rows.ci.done ? (
          <b className="td-todo-done"><Icon name="check" size={20} />Checked in</b>
        ) : (
          <button type="button" className="btn td-todo-go" disabled={busy || lockMood} aria-label={lockMood ? "I'm OK, view only" : undefined}
            onClick={() => void run(checkIn(self ?? undefined), can ? 'Saved for them. Their family can see they are OK.' : 'Saved. Your family can see you are OK.', 'checkin')}>I'm OK</button>
        )}
      </Todo>
    )
  }
  const batteryTodo = rows.bat && (
    <Todo icon="bolt" tint="amber" title={rows.bat.title} sub={rows.bat.sub} testId="myday-battery">
      {rows.bat.done && <b className="td-todo-done"><Icon name="check" size={20} />Charging</b>}
    </Todo>
  )
  const row = (k: PriKey) => <div key={k} className="td-row" data-phase={phase[k]}><div className="td-row-in">{priRow[k]}</div></div>
  const extras = c.left // priorities done: what is left is the other rows
  // like the board: name the first extra that has its own time ("evening medicine at 8 PM"); generic text when there is none
  const named = (item.kind === 'dose' && item.who ? [{ title: item.title, time: clock(item.who.at) }] : []).concat(missed.map((m) => ({ title: `${m.name} missed a medicine`, time: m.time ?? '' })).filter((x) => x.time)).concat(rows.bat && !rows.bat.done ? [{ title: rows.bat.title, time: '' }] : [])[0]
  const extrasLine = extraLine(extras, named)
  const doneRowLine = priDone && !card ? { title: extras === 0 ? 'All done' : 'Priorities done', sub: extras === 0 ? '' : extrasLine } : null
  return (
    <Section title="My day" meta={`${c.total - c.left} of ${c.total} done`} testId="myday">
      {card && (
        <div className="card td-done-card" data-testid="myday-done-card">
          <div className="td-done-ring" aria-hidden="true"><Icon name="check" size={48} /></div>
          <div className="td-done-t">{extras ? 'Priorities done' : 'All done for today'}</div>
          <div className="td-done-s">{`${rows.wa ? 'Blood pressure, water and check-in.' : 'Blood pressure and check-in.'}${extras ? ` ${extrasLine}.` : ''}`}</div>
          <button type="button" className="btn td-done-go" onClick={() => { setFoldOpen(true); foldBtn.current?.focus() }}>See what you logged</button>
        </div>
      )}
      <div className="card td-day" ref={dayEl} onFocusCapture={(e) => { inMissed.current = !!(e.target as HTMLElement).closest('[data-testid^="myday-missed-"]') }}>
        <div className="td-vh" role="status" aria-live="polite" data-testid="myday-said">{said}</div>
        {doneRowLine ? (
          <div className="td-prio-done" data-testid="myday-prio-done">
            <span className="td-todo-ic td-tick" aria-hidden="true"><Icon name="check" size={20} /></span>
            <div className="td-day-tx"><div className="td-day-t">{doneRowLine.title}</div>{doneRowLine.sub && <div className="td-day-s">{doneRowLine.sub}</div>}</div>
          </div>
        ) : !priDone && (
          <div className="td-day-h">
            <span data-testid="myday-ring"><Ring value={ringValue(c.total - c.left, c.total, rows.wa?.done ?? true, rows.wa?.frac ?? 0)} size={64} stroke={9} label={`${c.total - c.left} of ${c.total} done`} /></span>
            <div className="td-day-tx">
              <div className="td-day-t">{c.title}</div>
              <div className="td-day-s">{needsLine(missed.map((m) => m.name), viewing.acting ? viewing.name : '')}</div>
            </div>
          </div>
        )}
        {shown.map(row)}
        {!calm && <NextUp key={`${item.key}|${(item.who?.slots ?? []).map((x) => x.key).sort().join(',')}`} item={item} review={0} notify={notify} hold={setHeld} />}
        {next.review > 0 && <MedsCheck review={next.review} />}
        {missed.map((m) => (
          <Todo key={m.personId} icon="pill" tint="red" title={`${m.name} missed a medicine`} sub={m.time ?? 'Dose not marked yet'} testId={`myday-missed-${m.personId}`}>
            <a className="btn2 td-todo-go" href={`#family/people/${m.personId}`} aria-label={`Open ${m.name}`}>Open</a>
          </Todo>
        ))}
        {rows.bat && !batFold && batteryTodo}
        {!breathFold && <SelfCare />}
        <PlanToday />
        {foldCount > 0 && (
          <>
            <div className="td-foldbar">
              <button ref={foldBtn} type="button" className="td-fold" aria-expanded={foldOpen} aria-controls={foldId} data-testid="myday-fold" onClick={() => setFoldOpen((o) => !o)}>
                Done today ({foldCount})<Icon name="chev" size={16} />
              </button>
              {pdone.water && !phase.water && (
                <button type="button" className="td-fold-add" data-testid="myday-water-add" aria-label={lockLog ? 'Add another glass of water, view only' : 'Add another glass of water'} disabled={busy || lockLog}
                  onClick={() => void run(logWater(ML_PER_TAP, new Date(), self ?? undefined), 'Saved a glass of water', 'water')}><span aria-hidden="true">+ </span>water</button>
              )}
            </div>
            <div id={foldId} hidden={!foldOpen}>{folded.map(row)}{missedQuiet.map((m) => (
              <Todo key={m.personId} icon="pill" tint="red" title={`${m.name} missed a medicine`} sub="Missed, no more reminders" testId={`myday-missed-quiet-${m.personId}`}>
                <a className="btn2 td-todo-go" href={`#family/people/${m.personId}`} aria-label={`Open ${m.name}`}>Open</a>
              </Todo>
            ))}{batFold && batteryTodo}{breathFold && <SelfCare />}</div>
          </>
        )}
        <div className="td-more-wrap">
          <button type="button" className="td-todo td-todo-more" data-testid="myday-more" onClick={() => setSheet('more')}>
            <span className="td-todo-ic" data-tint="none"><Icon name="plus" size={18} /></span>
            <span className="td-grow"><span className="rw-title">Log something else</span></span>
            <Icon name="chev" size={20} />
          </button>
        </div>
        {(lockLog || lockMood) && can?.reason && <p className="sub td-lock-why"><Icon name="lock" size={16} />Look only. {can.reason}</p>}
      </div>
      {sheet === 'mood' && <MoodSheet onClose={() => setSheet(null)} notify={notify} />}
      {sheet === 'more' && <MoreSheet onClose={() => setSheet(null)} notify={notify} />}
    </Section>
  )
}
