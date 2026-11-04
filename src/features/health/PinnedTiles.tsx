import { useMemo, useState } from 'react'
import { formatNumber } from '../../lib/labFormat'
import { Carousel, PreviewTile, Section, Sheet, type Tint } from '../look'
import { useKv } from '../shell/useKv'
import { useDoseLine } from './GlanceGrid'
import { toCanonicalReading, type Reading } from './ranges'
import { latestSteps } from './stepsDay'
import { useActivity } from './useActivity'
import { useQuestions } from './useQuestions'
import { useVisits } from './useVisits'
import { nextVisitLine } from './visitsLogic'
import './health.css'

/** The newest top BP number from the last 7 days with its bottom number (within 60 s); null when none. */
export function bpThisWeek(readings: Reading[], now = new Date()): string | null {
  const top = readings.filter((r) => r.test === 'bp_systolic' && now.getTime() - Date.parse(r.takenAt) <= 7 * 86_400_000).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0]
  if (!top) return null
  const dia = readings.find((r) => r.test === 'bp_diastolic' && Math.abs(Date.parse(r.takenAt) - Date.parse(top.takenAt)) <= 60_000)
  return dia ? `${top.value}/${dia.value}` : String(top.value)
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
const METRIC: Partial<Record<PinCode, { kicker: string; unit: string; tint: Tint }>> = {
  fasting_glucose: { kicker: 'Fasting sugar', unit: 'mg/dL', tint: 'amber' }, heart_rate: { kicker: 'Pulse', unit: 'bpm', tint: 'red' }, weight: { kicker: 'Weight', unit: 'kg', tint: 'teal' }
}
const cleanPins = (v: unknown): PinCode[] => (Array.isArray(v) ? PINS.map((p) => p.code).filter((c) => v.includes(c)) : DEFAULT_PINS)

/** Pinned: live tiles chosen with Edit (kv health.pins, default BP, Medicines, Steps, Next visit). Real data only; an empty tile says so and offers its first step. */
export function PinnedTiles({ personId, readings }: { personId: string; readings: Reading[] }) {
  const doses = useDoseLine(personId)
  const acts = useActivity(personId)
  const visit = nextVisitLine(useVisits(personId))
  const asks = useQuestionCount(personId)
  const [raw, setRaw, loaded] = useKv<unknown>(PIN_KEY, DEFAULT_PINS)
  const [editing, setEditing] = useState(false)
  const pins = cleanPins(raw)
  const bp = useMemo(() => bpThisWeek(readings), [readings])
  const steps = useMemo(() => latestSteps(acts), [acts])
  const none = doses === 'No medicines yet'
  const tile = (code: PinCode) => {
    if (code === 'bp_systolic') return <PreviewTile key={code} testId="glance-progress" tint="blue" kicker="Blood pressure" value={bp ?? '--/--'} valueSize="md" sub={bp ? 'This week' : 'None this week'} action={bp ? 'Open' : 'Log now'} href="#health/metric/bp_systolic" />
    if (code === 'meds') return <PreviewTile key={code} testId="glance-meds" tint="green" kicker="Medicines" value={none ? 'None added' : doses ?? ' '} valueSize="md" sub={none ? 'Add yours to get reminders' : undefined} action={none ? 'Add or scan' : 'Open'} href="#health/meds" />
    if (code === 'steps') {
      return steps
        ? <PreviewTile key={code} testId="glance-steps" tint="teal" kicker="Steps" value={steps.total.toLocaleString('en-US')} sub={steps.today ? 'Today' : `on ${steps.day}`} action="Open" href="#health/metric/steps" />
        : <PreviewTile key={code} testId="glance-steps" tint="teal" kicker="Steps" value="Not connected" valueSize="md" sub="Reads your phone's step count" action="Connect" href="#me/phone" />
    }
    if (code === 'visits') return <PreviewTile key={code} testId="glance-visit" tint="purple" kicker="Next visit" value={visit ? visit.text.replace(/^Next visit: /, '') : 'Not booked'} valueSize="md" sub={visit?.sub ?? (asks ? `${asks} question${asks === 1 ? '' : 's'} ready to ask` : undefined)} action="Open" href="#health/visits" />
    const m = METRIC[code]!
    const r = readings.filter((x) => x.test === code).map(toCanonicalReading).filter((x): x is NonNullable<typeof x> => !!x).sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt))[0] // glucose in mmol/L becomes mg/dL; a unit that cannot be compared is left out
    return <PreviewTile key={code} testId={`glance-${code}`} tint={m.tint} kicker={m.kicker} value={r ? `${formatNumber(r.value)} ${r.unit || m.unit}` : '--'} valueSize="md" sub={r ? 'Latest' : 'None yet'} action={r ? 'Open' : 'Log now'} href={`#health/metric/${code}`} />
  }
  const toggle = (c: PinCode) => setRaw(pins.includes(c) ? pins.filter((x) => x !== c) : cleanPins([...pins, c]))
  return (
    <Section title="Pinned" testId="glance" link={{ onClick: () => setEditing(true), label: 'Edit' }}>
      <Carousel label="Pinned" testId="pinned">{loaded ? pins.map(tile) : []}</Carousel>
      {pins.length === 0 && <p className="sub">Nothing pinned. Tap Edit to choose.</p>}
      {editing && (
        <Sheet title="Pinned" onClose={() => setEditing(false)}>
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
    </Section>
  )
}
