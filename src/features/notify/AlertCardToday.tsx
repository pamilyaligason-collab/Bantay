import { useFamilyPeople } from '../family/roster'
import { shortName } from '../inbox/build'
import { Icon, type IconName } from '../shell/Icon'
import { markSeen, type AlertRow } from './store'
import { renderTemplate, TEMPLATES, type NotifyKind, type TemplateId } from './templates'
import { useAlertRows } from './useAlerts'
import './notify.css'

/** SOS first, then a dangerous reading, a missed dose, a hazard; the other urgent kinds after those. */
const PRIORITY: NotifyKind[] = ['sos', 'reading_high', 'dose_missed', 'hazard', 'mood_unwell', 'pin_approve', 'pin_changed', 'system']
const ICON: Partial<Record<NotifyKind, IconName>> = { sos: 'warn', reading_high: 'heart', dose_missed: 'pill', hazard: 'cloud', mood_unwell: 'users' }

const toneOf = (r: AlertRow) => (Object.hasOwn(TEMPLATES, r.template) ? TEMPLATES[r.template as TemplateId].tone : 'normal')

/** The one alert to show first: newest unseen urgent row, by kind priority. null when there is none. */
export function pickAlert(rows: AlertRow[]): AlertRow | null {
  const urgent = rows.filter((r) => r.seenAt == null && toneOf(r) === 'urgent' && PRIORITY.includes(r.kind))
  return urgent.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
}

/** Today's top family alert card (today-full, alert variant): the newest unseen urgent row. "Open" marks it seen and goes to what it is about. */
export function AlertCardToday() {
  const rows = useAlertRows()
  const { people } = useFamilyPeople()
  const row = pickAlert(rows)
  if (!row) return null
  const name = shortName(row.personId ? people.find((p) => p.id === row.personId)?.name : null)
  const t = renderTemplate(row.template, { name })
  const tab = Object.hasOwn(TEMPLATES, row.template) ? TEMPLATES[row.template as TemplateId].tab : 'today'
  return (
    <section className="sh-card al-card" aria-label="Family alert" data-kind={row.kind}>
      <Icon name={ICON[row.kind] ?? 'warn'} tone="alert" boxed size={22} />
      <div className="sh-grow"><b>{t.title}</b><div className="sh-sub">{t.body}</div></div>
      <a className="btn al-open" href={`#${tab}`} onClick={() => void markSeen(row.id).catch(() => undefined)}>Open</a>
    </section>
  )
}
