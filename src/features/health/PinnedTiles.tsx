import { useMemo, useState } from 'react'
import { formatNumber } from '../../lib/labFormat'
import { PreviewTile, Section, Sheet, type Tint } from '../look'
import { bpDue, metricDue, pickMover, useNudgeMover } from '../nudge/nudgeDue'
import type { IconName } from '../shell/Icon'
import { useKv } from '../shell/useKv'
import { useStorm } from '../today/useStorm'
import { useWarnings } from '../today/WarningCard'
import { useTodayDoses } from './GlanceGrid'
import type { DoseState } from './meds'
import { toCanonicalReading, type Reading } from './ranges'
import { latestSteps } from './stepsDay'
import { useActivity } from './useActivity'
import { useQuestions } from './useQuestions'
import { useVisitsState } from './useVisits'
import { nextVisitLine } from './visitsLogic'
import './health.css'

/** The newest top BP number from the last 7 days with its bottom number (within 60 s); null when none. */
export function bpThisWeek(readings: Reading[], now = new Date()): string | null {
  const top = readings.filter((r) => r.test === 'bp_systolic' && now.getTime() - Date.parse(r.takenAt) <= 7 * 86_400_000).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
  if (!top) return null
  const dia = readings.find((r) => r.test === 'bp_diastolic' && Math.abs(Date.parse(r.takenAt) - Date.parse(top.takenAt)) <= 60_000)
  return dia ? `${top.value}/${dia.value}` : String(top.value)
}

export const clock = (at: number) => `${Math.floor(at / 60) % 12 || 12}${at % 60 ? `:${String(at % 60).padStart(2, '0')}` : ''} ${at < 720 ? 'AM' : 'PM'}`
/** The Medicines tile's words: the first dose not yet taken or skipped (an overdue one counts) and how many of today's are done. Nothing due today reads "Nothing due" with the sub-line "Today". */
export function doseSummary(doses: DoseState[]): { value: string; sub: string } {
  if (!doses.length) return { value: 'Nothing due', sub: 'Today' }
  const next = doses.find((d) => d.state === 'pending')
  const taken = doses.filter((d) => d.state === 'taken').length
  return { value: next ? clock(next.at) : 'All done', sub: `${next ? 'Next dose · ' : ''}${taken} of ${doses.length} taken` }
}

/** Saved questions for the next visit (the Visits screen's own list). */
export const useQuestionCount = (personId: string): number => useQuestions(personId).length

export type PinCode = 'bp_systolic' | 'meds' | 'steps' | 'visits' | 'fasting_glucose' | 'heart_rate' | 'weight'
export const PIN_KEY = 'health.pins'
/** The board's four. (The contract text names sugar instead of Medicines; the board and the old screen show Medicines, so that stays the default.) */
export const DEFAULT_PINS: PinCode[] = ['bp_systolic', 'meds', 'steps', 'visits']
const PINS: { code: PinCode; label: string }[] = [
  { code: 'bp_systolic', label: 'Blood pressure' }, { code: 'fasting_glucose', label: 'Fasting sugar' }, { code: 'heart_rate', label: 'Pulse' }, { code: 'weight', label: 'Weight' },
  { code: 'steps', label: 'Steps' }, { code: 'meds', label: 'Medicines' }, { code: 'visits', label: 'Next visit' }
]
const METRIC: Partial<Record<PinCode, { kicker: string; unit: string; tint: Tint; icon: IconName }>> = {
  fasting_glucose: { kicker: 'Fasting sugar', unit: 'mg/dL', tint: 'amber', icon: 'drop' }, heart_rate: { kicker: 'Pulse', unit: 'bpm', tint: 'red', icon: 'heart' }, weight: { kicker: 'Weight', unit: 'kg', tint: 'teal', icon: 'scale' }
}
export const MAX_PINS = 4
/** The stored list in its stored order, known codes only, no repeats; more than MAX_PINS in kv (an older save) shows the first four and is left as it is until the next change. */
/** Which pinned metric moves first when several are due. */
const NUDGE_ORDER: PinCode[] = ['bp_systolic', 'fasting_glucose', 'heart_rate', 'weight']
const cleanPins = (v: unknown): PinCode[] => (Array.isArray(v) ? [...new Set(v.filter((c): c is PinCode => PINS.some((p) => p.code === c)))].slice(0, MAX_PINS) : DEFAULT_PINS)

/** Pinned: live tiles chosen with Edit (kv health.pins, default BP, Medicines, Steps, Next visit). Real data only; an empty tile says so and offers its first step. */
export function PinnedTiles({ personId, readings, canLog = true, inline = false }: { personId: string; readings: Reading[]; canLog?: boolean; inline?: boolean }) {
  const today = useTodayDoses(personId)
  const acts = useActivity(personId)
  const vs = useVisitsState(personId)
  const visit = nextVisitLine(vs.list)
  const asks = useQuestionCount(personId)
  const [raw, setRaw, loaded] = useKv<unknown>(PIN_KEY, DEFAULT_PINS)
  const [editing, setEditing] = useState(false)
  const [sensors] = useKv<{ enabled?: string[]; owner?: string } | null>('sensors.state', null) // sensors/health STATE_KEY, not imported: that file pulls in the native bridge
  const stepsOn = !!sensors?.enabled?.includes('steps') && (!sensors.owner || sensors.owner === personId) // steps already switched on for this person on this phone
  const pins = cleanPins(raw)
  const bp = useMemo(() => bpThisWeek(readings), [readings])
  const steps = useMemo(() => latestSteps(acts), [acts])
  const none = !!today && !today.doses.length && !today.hasMeds
  const dose = today ? doseSummary(today.doses) : null
  // D-125: a Due pill (and the one mover) only where this person can log and no warning or storm shows (as My day); steps, medicines and visits never nudge
  const now = new Date()
  const warn = useWarnings()
  const storm = useStorm()
  const calm = canLog && !warn.onScreen && !storm
  const dueOf = (code: PinCode) => calm && (code === 'bp_systolic' ? bpDue(readings, now) : code === 'fasting_glucose' || code === 'heart_rate' || code === 'weight' ? metricDue(readings, code, now) : false)
  const mover = useNudgeMover('health', loaded ? pickMover(NUDGE_ORDER.filter((c) => (inline ? c === 'bp_systolic' : pins.includes(c))).map((c) => ({ key: c, due: dueOf(c) })), false) : null) // fixed priority, not the order the pins were saved in
  const tile = (code: PinCode) => {
    if (code === 'bp_systolic') return <PreviewTile key={code} testId="glance-progress" tint="blue" kicker="Blood pressure" value={bp ?? '--/--'} valueSize="md" sub={bp ? 'This week' : 'None this week'} action={bp ? 'Open' : 'Log now'} href="#health/metric/bp_systolic" due={dueOf(code)} move={mover === code} icon="gauge" />
    if (code === 'meds') return <PreviewTile key={code} testId="glance-meds" tint="green" kicker="Medicines" value={none ? 'None added' : dose?.value ?? ' '} valueSize="md" sub={none ? 'Add yours to get reminders' : dose?.sub} action={none ? 'Add or scan' : 'Open'} href="#health/meds" />
    if (code === 'steps') {
      return steps
        ? <PreviewTile key={code} testId="glance-steps" tint="teal" kicker="Steps" value={steps.total.toLocaleString('en-US')} sub={steps.today ? 'Today' : `on ${steps.day}`} action="Open" href="#health/metric/steps" />
        : stepsOn
          ? <PreviewTile key={code} testId="glance-steps" tint="teal" kicker="Steps" value="No steps yet" valueSize="md" sub="Waiting for your phone" action="Open" href="#health/metric/steps" />
          : <PreviewTile key={code} testId="glance-steps" tint="teal" kicker="Steps" value="Not connected" valueSize="md" sub="Reads your phone's step count" action="Connect" href="#me/phone" />
    }
    if (code === 'visits') return <PreviewTile key={code} testId="glance-visit" tint="purple" kicker="Next visit" value={visit ? visit.text.replace(/^Next visit: /, '') : 'Not booked'} valueSize="md" sub={visit?.sub ?? (asks ? `${asks} question${asks === 1 ? '' : 's'} ready to ask` : undefined)} action="Open" href="#health/visits" />
    const m = METRIC[code]!
    const r = readings.filter((x) => x.test === code).map(toCanonicalReading).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0] // glucose in mmol/L becomes mg/dL; a unit that cannot be compared is left out
    return <PreviewTile key={code} testId={`glance-${code}`} tint={m.tint} kicker={m.kicker} value={r ? `${formatNumber(r.value)} ${r.unit || m.unit}` : '--'} valueSize="md" sub={r ? 'Latest' : 'None yet'} action={r ? 'Open' : 'Log now'} href={`#health/metric/${code}`} due={dueOf(code)} move={mover === code} icon={m.icon} />
  }
  const [full, setFull] = useState(false)
  const toggle = (c: PinCode) => {
    if (pins.includes(c)) { setFull(false); setRaw(pins.filter((x) => x !== c)); return }
    if (pins.length >= MAX_PINS) { setFull(true); return }
    setRaw(cleanPins([...pins, c]))
  }
  // S24 (inline, in the Readings card): always two tiles, never a gap. Next visit + Medicines; BP (Due pill and nudge) takes the Medicines place when due; no booked visit gives Medicines + Move (steps). The pins list only drives the full Pinned section.
  const inlinePair = (): PinCode[] => { const bpDueNow = dueOf('bp_systolic'); return visit ? ['visits', bpDueNow ? 'bp_systolic' : 'meds'] : [bpDueNow ? 'bp_systolic' : 'meds', 'steps'] }
  const shown = inline ? inlinePair() : pins
  const grid = <div className="pt-grid pn-grid" role="list" aria-label="Pinned" data-testid="pinned">{loaded && (!inline || vs.ready) ? shown.map((c) => <div key={c} role="listitem" className="pn-cell">{tile(c)}</div>) : null}</div>
  const empty = pins.length === 0 && <p className="sub">Nothing pinned. Tap Edit to choose.</p>
  const sheet = (
    <>
      {editing && (
        <Sheet title="Pinned" onClose={() => { setEditing(false); setFull(false) }}>
          <p className="sub" data-testid="pin-limit" role={full ? 'alert' : undefined}>{full ? `Four is the most. Untick one to make room for another.` : `Pick up to four. ${pins.length} of ${MAX_PINS} picked.`}</p>
          <ul className="grp pn-list">
            {PINS.map((p) => (
              <li key={p.code} className="row">
                <button type="button" className="fm-chk" role="checkbox" aria-checked={pins.includes(p.code)} aria-label={p.label} onClick={() => toggle(p.code)} />
                <span className="grow" aria-hidden="true">{p.label}</span>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </>
  )
  if (inline) return (
    <div className="rc-pins" data-testid="glance">
      <div className="rc-pins-h"><span className="sub">Coming up</span></div>
      {grid}
    </div>
  )
  return (
    <Section title="Pinned" testId="glance" link={{ onClick: () => setEditing(true), label: 'Edit' }}>
      {grid}
      {empty}
      {sheet}
    </Section>
  )
}
