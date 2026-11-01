import { useEffect, useMemo, useState } from 'react'
import { db } from '../../db'
import { PreviewTile, Section } from '../look'
import { useDoseLine } from './GlanceGrid'
import { localDay } from './model'
import type { Reading } from './ranges'
import { useActivity } from './useActivity'
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
export function useQuestionCount(personId: string): number {
  const [n, setN] = useState(0)
  useEffect(() => {
    let live = true
    void db.kv.get(`visits.questions.${personId}`).then((r) => { if (live) setN(Array.isArray(r?.value) ? r!.value.length : 0) }).catch(() => undefined)
    return () => { live = false }
  }, [personId])
  return n
}

/** Pinned: four live tiles (BP, Medicines, Steps, Next visit). Real data only; an empty tile says so and offers its first step. */
export function PinnedTiles({ personId, readings }: { personId: string; readings: Reading[] }) {
  const doses = useDoseLine(personId)
  const acts = useActivity(personId)
  const visit = nextVisitLine(useVisits(personId))
  const asks = useQuestionCount(personId)
  const bp = useMemo(() => bpThisWeek(readings), [readings])
  const steps = useMemo(() => {
    const rows = acts.filter((a) => a.kind === 'steps' && typeof a.steps === 'number')
    const today = rows.filter((a) => localDay(a.startedAt) === localDay(new Date().toISOString())).reduce((s, a) => s + (a.steps as number), 0)
    return { any: rows.length > 0, today }
  }, [acts])
  const none = doses === 'No medicines yet'
  return (
    <Section title="Pinned" testId="glance">
      <div className="pt-grid">
        <PreviewTile testId="glance-progress" tint="blue" kicker="Blood pressure" value={bp ?? '--/--'} valueSize="md" sub={bp ? 'This week' : 'None this week'} action={bp ? 'Open' : 'Log now'} href="#health/metric/bp_systolic" />
        <PreviewTile testId="glance-meds" tint="green" kicker="Medicines" value={none ? 'None added' : doses ?? ' '} valueSize="md" action={none ? 'Add or scan' : 'Open'} href="#health/meds" />
        {steps.any
          ? <PreviewTile testId="glance-steps" tint="teal" kicker="Steps" value={steps.today ? steps.today.toLocaleString('en-US') : '--'} sub={steps.today ? 'Today' : 'None today'} action="Open" href="#health/metric/steps" />
          : <PreviewTile testId="glance-steps" tint="teal" kicker="Steps" value="Not connected" valueSize="md" action="Connect" href="#me/phone" />}
        <PreviewTile testId="glance-visit" tint="purple" kicker="Next visit" value={visit ? visit.text.replace(/^Next visit: /, '') : 'Not booked'} valueSize="md" sub={visit?.sub ?? (asks ? `${asks} question${asks === 1 ? '' : 's'} ready` : undefined)} action="Open" href="#health/visits" />
      </div>
    </Section>
  )
}
