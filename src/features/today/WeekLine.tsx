import { useFamilyPeople } from '../family/roster'
import { localDay } from '../health/model'
import { useActivity } from '../health/useActivity'
import { Icon } from '../shell/Icon'

/** Days with a walk or steps in the last 7 (today included). Check-ins, mood and sleep rows are not movement. */
export const activeDays = (rows: { kind: string; minutes: number | null; steps: number | null; startedAt: string }[], now: Date): number => {
  const days = new Set<string>()
  for (let i = 0; i < 7; i++) days.add(localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12).toISOString()))
  const hit = new Set(rows.filter((r) => (r.kind === 'walk' && (r.minutes ?? 0) > 0) || (r.kind === 'steps' && (r.steps ?? 0) > 0)).map((r) => localDay(r.startedAt)).filter((d) => days.has(d)))
  return hit.size
}

/** One line under the page: how the week is going, linking to Health. Nothing logged reads as "nothing logged", never as a bad week. */
export default function WeekLine() {
  const { selfId } = useFamilyPeople()
  const rows = useActivity(selfId ?? '', 7)
  const n = activeDays(rows, new Date())
  return (
    <a className="card td-week" href="#health">
      <span className="td-grow">
        <b>Your week</b>
        <span className="td-sub">{n > 0 ? `You were active on ${n} of the last 7 days` : 'No walks logged this week yet'}</span>
      </span>
      <span className="td-link" aria-hidden="true">Health<Icon name="chev" size={20} /></span>
    </a>
  )
}
