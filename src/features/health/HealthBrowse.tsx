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

const DOORS: { key: string; icon: IconName; tint: Tint; title: string; sub: string; href: string }[] = [
  { key: 'readings', icon: 'gauge', tint: 'blue', title: 'Readings', sub: 'BP, sugar, weight', href: '#health/readings' },
  { key: 'labs', icon: 'flask', tint: 'red', title: 'Labs', sub: 'From your scans', href: '#health/labs' },
  { key: 'meds', icon: 'pill', tint: 'green', title: 'Medicines', sub: 'Doses, refills, reminders', href: '#health/meds' },
  { key: 'visits', icon: 'calendar', tint: 'purple', title: 'Visits', sub: 'What to bring, what to ask', href: '#health/visits' },
  { key: 'move', icon: 'move', tint: 'teal', title: 'Move & food', sub: 'Walks, meals, salt', href: '#health/move' },
  { key: 'body', icon: 'heart', tint: 'amber', title: 'Body wiki', sub: 'How each part works', href: '#health/body' }
]

/** Browse: one grouped list, six doors, each with its live value (Body wiki has none). Papers live in Family (D-100). */
export function HealthBrowse({ personId, readings, thresholds }: { personId: string; readings: Reading[]; thresholds: (Range & { key: string })[] }) {
  const doses = useDoseLine(personId)
  const visit = nextVisitLine(useVisits(personId))
  const asks = useQuestionCount(personId)
  const acts = useActivity(personId)
  const value: Record<string, string | undefined> = {
    readings: bpThisWeek(readings) ?? 'None this week',
    labs: labsLine(readings, thresholds),
    meds: doses ?? undefined,
    visits: visit ? visit.text.replace(/^Next visit: /, '') : 'Not booked',
    move: moveLine(acts)
  }
  const sub: Record<string, string | undefined> = { visits: asks ? `${asks} ${asks === 1 ? 'question' : 'questions'} ready to ask` : undefined }
  return (
    <Section title="Browse" testId="browse">
      <p className="sub hb-intro">Your numbers, papers and plans.</p>
      <GroupedList icons>
        {DOORS.map((d) => <Row key={d.key} testId={`browse-${d.key}`} icon={d.icon} tint={d.tint} title={d.title} sub={sub[d.key] ?? d.sub} value={value[d.key]} href={d.href} />)}
      </GroupedList>
    </Section>
  )
}
