import { useMemo, useState } from 'react'
import { Icon } from '../shell/Icon'
import { Section } from '../look'
import { Ring } from '../look/Ring'
import { useKv } from '../shell/useKv'
import { useFamilyPeople } from '../family/roster'
import { shortName } from '../inbox/build'
import { markSeen } from '../notify/store'
import { useAlertRows } from '../notify/useAlerts'
import { useSelfPerson } from '../setup/useProfile'
import { useActingCan, useActingPersonId } from '../viewas/viewAs'
import { useActivity } from '../health/useActivity'
import { logWater } from '../nutrition/actions'
import { ML_PER_TAP, onDay } from '../nutrition/logic'
import { useGoal, useWater } from '../nutrition/hooks'
import { checkIn, FAIL_TEXT } from './actions'
import { bpRow, checkInRow, countLeft, waterRow } from './dayRows'
import { missedDoses } from './missed'
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

/** "<Name> needs you" while someone else has a missed dose; else "All yours today". */
export const needsLine = (names: string[]): string => (names.length === 0 ? 'All yours today' : names.length === 1 ? `${names[0]} needs you` : `${names[0]} and ${names.length - 1} more need you`)

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
  const lockLog = !!can && !can.log
  const lockMood = !!can && !can.mood
  const [busy, setBusy] = useState(false)
  const [sheet, setSheet] = useState<'mood' | 'more' | null>(null)
  const now = new Date()
  const today = now.toDateString() // the memo below must refresh when the day changes (phone left on Today overnight)
  const { readings } = useWeekData(personId)
  const water = useWater(personId, 2)
  const goal = useGoal(personId)
  const activity = useActivity(personId, 2)
  const [breaths] = useKv<SelfCareEntry[]>('selfcare.log', [])
  const { people } = useFamilyPeople()
  const missed = missedDoses(useAlertRows()).map((m) => ({ ...m, name: shortName(people.find((p) => p.id === m.personId)?.name) ?? 'Someone' }))
  const rows = useMemo(() => {
    const ci = checkInRow(activity, now, !!self || !ready), bp = bpRow(readings, now), wa = waterRow(water, goal.waterMl, now)
    const breathed = breaths.some((b) => new Date(b.at).toDateString() === now.toDateString())
    return { ci, bp, wa, list: [ci, bp, wa, { done: breathed }, ...(item.kind === 'dose' ? [{ done: false }] : []), ...missed.map(() => ({ done: false }))] }
  }, [activity, readings, water, goal.waterMl, breaths, item.kind, self, ready, today, missed.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const c = countLeft(rows.list)
  const run = async (p: Promise<'ok' | keyof typeof FAIL_TEXT>, done: string) => {
    if (busy) return
    setBusy(true)
    const r = await p
    setBusy(false)
    notify(r === 'ok' ? done : FAIL_TEXT[r])
  }
  const calm = item.kind === 'calm'
  const glasses = Math.round(onDay(water, now).reduce((s, r) => s + r.ml, 0) / ML_PER_TAP) // the right side of the Water row: the count only
  return (
    <Section title="My day" meta={`${c.total - c.left} of ${c.total} done`} testId="myday">
      <div className="card td-day">
        <div className="td-day-h">
          <span data-testid="myday-ring"><Ring value={c.total ? (c.total - c.left) / c.total : 0} size={64} stroke={9} label={`${c.total - c.left} of ${c.total} done`} /></span>
          <div className="td-day-tx">
            <div className="td-day-t">{c.title}</div>
            <div className="td-day-s">{needsLine(missed.map((m) => m.name))}</div>
          </div>
        </div>
        {!calm && <NextUp key={`${item.key}|${(item.who?.slots ?? []).map((x) => x.key).sort().join(',')}`} item={item} review={0} notify={notify} hold={setHeld} />}
        {next.review > 0 && <MedsCheck review={next.review} />}
        {missed.map((m) => (
          <Todo key={m.personId} icon="pill" tint="red" title={`${m.name} missed a medicine`} sub={m.time ?? 'Dose not marked yet'} testId={`myday-missed-${m.personId}`}>
            <a className="btn2 td-todo-go" href={`#family/people/${m.personId}`} aria-label={`Open ${m.name}`} onClick={() => void Promise.all(m.alertIds.map((id) => markSeen(id))).catch(() => undefined)}>Open</a>
          </Todo>
        ))}
        <Todo icon="smile" tint="green" title={storm ? 'Is everyone safe?' : rows.ci.title} sub={rows.ci.sub} testId="myday-checkin" onMain={lockMood ? undefined : () => setSheet('mood')} mainLabel="How are you? Pick a face">
          {rows.ci.done ? (
            <b className="td-todo-done"><Icon name="check" size={20} />Checked in</b>
          ) : (
            <button type="button" className="btn td-todo-go" disabled={busy || lockMood} aria-label={lockMood ? "I'm OK, view only" : undefined}
              onClick={() => void run(checkIn(self ?? undefined), can ? 'Saved for them. Their family can see they are OK.' : 'Saved. Your family can see you are OK.')}>I'm OK</button>
          )}
        </Todo>
        <Todo icon="gauge" tint="blue" title={rows.bp.title} sub={rows.bp.sub} testId="myday-bp"><a className="btn2 td-todo-go" href={rows.bp.href}>Log</a></Todo>
        <Todo icon="glass" tint="teal" title={rows.wa.title} sub={rows.wa.sub} testId="myday-water"
          lead={(
            <button type="button" className="td-todo-ic td-todo-plus" data-tint="teal" disabled={busy || lockLog} aria-label={lockLog ? 'Add a glass of water, view only' : 'Add a glass of water'}
              onClick={() => void run(logWater(ML_PER_TAP, new Date(), self ?? undefined), 'Saved a glass of water')}><Icon name="plus" size={22} /></button>
          )}>
          <b className="td-todo-count">{glasses}<span className="td-vh"> glasses today</span></b>
        </Todo>
        <SelfCare />
        <PlanToday />
        <div className="td-more-wrap">
          <button type="button" className="td-todo td-todo-more" data-testid="myday-more" onClick={() => setSheet('more')}>
            <span className="td-todo-ic" data-tint="none"><Icon name="plus" size={18} /></span>
            <span className="td-grow"><span className="rw-title">Log something else</span></span>
            <Icon name="chev" size={20} />
          </button>
        </div>
        {(lockLog || lockMood) && can?.reason && <p className="sub td-lock-why"><Icon name="lock" size={16} />View only. {can.reason}</p>}
      </div>
      {sheet === 'mood' && <MoodSheet onClose={() => setSheet(null)} notify={notify} />}
      {sheet === 'more' && <MoreSheet onClose={() => setSheet(null)} notify={notify} />}
    </Section>
  )
}
