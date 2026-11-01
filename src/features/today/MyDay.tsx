import { useMemo, useState } from 'react'
import { Icon, type IconName } from '../shell/Icon'
import { Section } from '../look'
import { Ring } from '../look/Ring'
import { useKv } from '../shell/useKv'
import { useSelfPerson } from '../setup/useProfile'
import { useActingCan, useActingPersonId } from '../viewas/viewAs'
import { useActivity } from '../health/useActivity'
import { logWater } from '../nutrition/actions'
import { ML_PER_TAP } from '../nutrition/logic'
import { useGoal, useWater } from '../nutrition/hooks'
import { checkIn, FAIL_TEXT } from './actions'
import { bpRow, checkInRow, countLeft, waterRow } from './dayRows'
import { useWeekData } from './MyWeek'
import NextUp, { MedsCheck } from './NextUp'
import PlanToday from './PlanToday'
import SelfCare from './SelfCare'
import type { SelfCareEntry } from './breathLogic'
import type { NextItem } from './nextPick'
import { useNext } from './useNext'

function Todo({ icon, tint, title, sub, children }: { icon: IconName; tint: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="td-todo">
      <span className="td-todo-ic" data-tint={tint}><Icon name={icon} size={18} /></span>
      <div className="td-grow"><div className="rw-title">{title}</div><div className="rw-sub">{sub}</div></div>
      {children}
    </div>
  )
}

/** Board "My day": a ring with the count, then the to-do rows. Doses, breath and the plan reuse the existing cards, flattened inside this one. */
export default function MyDay({ notify }: { notify: (msg: string) => void }) {
  const next = useNext()
  const [held, setHeld] = useState<NextItem | null>(null) // the dose card stays up while its take is saved and the done-morph plays
  const item = held ?? next.item
  const self = useActingPersonId()
  const personId = self ?? ''
  const { ready } = useSelfPerson()
  const can = useActingCan()
  const lockLog = !!can && !can.log
  const lockMood = !!can && !can.mood
  const [busy, setBusy] = useState(false)
  const now = new Date()
  const today = now.toDateString() // the memo below must refresh when the day changes (phone left on Today overnight)
  const { readings } = useWeekData(personId)
  const water = useWater(personId, 2)
  const goal = useGoal(personId)
  const activity = useActivity(personId, 2)
  const [breaths] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const rows = useMemo(() => {
    const ci = checkInRow(activity, now, !!self || !ready), bp = bpRow(readings, now), wa = waterRow(water, goal.waterMl, now)
    const breathed = breaths.some((b) => new Date(b.at).toDateString() === now.toDateString())
    return { ci, bp, wa, list: [ci, bp, wa, { done: breathed }, ...(item.kind === 'dose' ? [{ done: false }] : [])] }
  }, [activity, readings, water, goal.waterMl, breaths, item.kind, self, ready, today]) // eslint-disable-line react-hooks/exhaustive-deps
  const c = countLeft(rows.list)
  const run = async (p: Promise<'ok' | keyof typeof FAIL_TEXT>, done: string) => {
    if (busy) return
    setBusy(true)
    const r = await p
    setBusy(false)
    notify(r === 'ok' ? done : FAIL_TEXT[r])
  }
  const calm = item.kind === 'calm'
  return (
    <Section title="My day" meta={`${c.total - c.left} of ${c.total} done`} testId="myday">
      <div className="card td-day">
        <div className="td-day-h">
          <Ring value={c.total ? (c.total - c.left) / c.total : 0} size={40} label={`${c.total - c.left} of ${c.total} done`} />
          <div className="td-day-t">{c.title}</div>
        </div>
        {!calm && <NextUp key={`${item.key}|${(item.who?.slots ?? []).map((x) => x.key).sort().join(',')}`} item={item} review={0} notify={notify} hold={setHeld} />}
        {next.review > 0 && <MedsCheck review={next.review} />}
        <Todo icon="smile" tint="green" title={rows.ci.title} sub={rows.ci.sub}>
          {rows.ci.done ? (
            <b className="td-todo-done"><Icon name="check" size={20} />Checked in</b>
          ) : (
            <button type="button" className="btn td-todo-go" disabled={busy || lockMood} aria-label={lockMood ? "I'm OK, view only" : undefined}
              onClick={() => void run(checkIn(self ?? undefined), can ? 'Saved for them. Their family can see they are OK.' : 'Saved. Your family can see you are OK.')}>I'm OK</button>
          )}
        </Todo>
        <Todo icon="gauge" tint="blue" title={rows.bp.title} sub={rows.bp.sub}><a className="btn2 td-todo-go" href={rows.bp.href}>Log</a></Todo>
        <Todo icon="glass" tint="teal" title={rows.wa.title} sub={rows.wa.sub}>
          <button type="button" className="btn2 td-todo-go td-todo-plus" disabled={busy || lockLog} aria-label={lockLog ? 'Add a glass of water, view only' : 'Add a glass of water'}
            onClick={() => void run(logWater(ML_PER_TAP, new Date(), self ?? undefined), 'Saved a glass of water')}>+</button>
        </Todo>
        <SelfCare />
        <PlanToday />
        {(lockLog || lockMood) && can?.reason && <p className="sub td-lock-why"><Icon name="lock" size={16} />View only. {can.reason}</p>}
      </div>
    </Section>
  )
}
