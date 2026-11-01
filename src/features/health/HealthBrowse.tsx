import { GroupedList, Row, Section, type Tint } from '../look'
import type { IconName } from '../shell/Icon'
import { weekProgress } from '../exercise/weekly'
import { labsLine, useDoseLine } from './GlanceGrid'
import type { Activity } from './model'
import { bpThisWeek, useQuestionCount } from './PinnedTiles'
import type { Range, Reading } from './ranges'
import { useActivity } from './useActivity'
import { useVisits } from './useVisits'
import { nextVisitLine } from './visitsLogic'
import './health.css'

/** "12 min this week" from the last 7 days of walks and moves, or "No walks yet". */
export function moveLine(acts: Activity[]): string {
  const m = weekProgress(acts).minutes
  return m > 0 ? `${m} min this week` : 'No walks yet'
}

const DOORS: { key: string; icon: IconName; tint: Tint; title: string; href: string }[] = [
  { key: 'readings', icon: 'gauge', tint: 'blue', title: 'Readings', href: '#health/readings' },
  { key: 'labs', icon: 'flask', tint: 'red', title: 'Labs', href: '#health/labs' },
  { key: 'meds', icon: 'pill', tint: 'green', title: 'Medicines', href: '#health/meds' },
  { key: 'visits', icon: 'calendar', tint: 'purple', title: 'Visits', href: '#health/visits' },
  { key: 'move', icon: 'move', tint: 'teal', title: 'Move & food', href: '#health/move' },
  { key: 'body', icon: 'heart', tint: 'amber', title: 'Body wiki', href: '#health/body' }
]

/** Browse: one grouped list, six doors, each with its live value (Body wiki has none). Papers live in Family (D-100). */
export function HealthBrowse({ personId, readings, thresholds }: { personId: string; readings: Reading[]; thresholds: (Range & { key: string })[] }) {
  const doses = useDoseLine(personId)
  const visit = nextVisitLine(useVisits(personId))
  const asks = useQuestionCount(personId)
  const acts = useActivity(personId)
  const value: Record<string, string | undefined> = {
    readings: bpThisWeek(readings) ?? 'None this week',
    labs: labsLine(readings, thresholds).split(' · ')[0],
    meds: doses ?? undefined,
    visits: visit ? visit.text.replace(/^Next visit: /, '') : asks ? `${asks} to ask` : 'Not booked',
    move: moveLine(acts)
  }
  return (
    <Section title="Browse" testId="browse">
      <GroupedList icons>
        {DOORS.map((d) => <Row key={d.key} testId={`browse-${d.key}`} icon={d.icon} tint={d.tint} title={d.title} value={value[d.key]} href={d.href} />)}
      </GroupedList>
    </Section>
  )
}
