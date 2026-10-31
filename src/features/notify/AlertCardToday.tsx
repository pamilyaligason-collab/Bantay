import FmAvatar from '../family/FmAvatar'
import { useFamilyPeople } from '../family/roster'
import { shortName } from '../inbox/build'
import { Icon } from '../shell/Icon'
import { markSeen, type AlertRow } from './store'
import { renderTemplate, TEMPLATES, type NotifyKind, type TemplateId } from './templates'
import { useAlertRows } from './useAlerts'
import './notify.css'

/** SOS first, then a storm call for help, then a dangerous reading, a missed dose, a hazard; the other urgent kinds after those. */
const PRIORITY: NotifyKind[] = ['sos', 'rollcall', 'reading_high', 'dose_missed', 'hazard', 'mood_unwell', 'pin_approve', 'pin_changed', 'system']

const toneOf = (r: AlertRow) => (Object.hasOwn(TEMPLATES, r.template) ? TEMPLATES[r.template as TemplateId].tone : 'normal')

/** The one alert to show first: newest unseen urgent row, by kind priority. null when there is none. */
export function pickAlert(rows: AlertRow[]): AlertRow | null {
  const urgent = rows.filter((r) => r.seenAt == null && toneOf(r) === 'urgent' && PRIORITY.includes(r.kind))
  return urgent.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
}

/** Today's FamilyNotice (S16 L1, F-5 / W-9): a 72 px row with the person's avatar, the fixed title and one sub line. The whole row opens what it is about and marks it seen;
 *  the close button marks it seen too (kv is not used: `carer_alerts.seen_at` is the one record). No Jack on it (D-91). */
export function AlertCardToday() {
  const rows = useAlertRows()
  const { people } = useFamilyPeople()
  const row = pickAlert(rows)
  if (!row) return null
  const who = people.find((p) => p.id === row.personId)
  const name = shortName(who?.name)
  const t = renderTemplate(row.template, { name })
  const tab = Object.hasOwn(TEMPLATES, row.template) ? TEMPLATES[row.template as TemplateId].tab : 'today'
  const seen = () => void markSeen(row.id).catch(() => undefined)
  return (
    <section className="card al-row" aria-label="Family alert" data-kind={row.kind} data-testid="family-notice">
      <a className="al-main press" href={`#${tab}`} onClick={seen}>
        <span className="al-av">{who ? <FmAvatar name={who.name} photoPath={who.photoPath} thumb={who.thumb} size={40} /> : <Icon name="users" size={20} />}</span>
        <span className="al-txt"><b>{t.title}</b><span className="al-sub">{t.body}</span></span>
        <Icon name="chev" size={20} />
      </a>
      <button type="button" className="al-x" aria-label="Dismiss this family alert" onClick={seen}><Icon name="close" size={20} /></button>
    </section>
  )
}
