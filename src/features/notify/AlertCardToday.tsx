import FmAvatar from '../family/FmAvatar'
import { useFamilyPeople } from '../family/roster'
import { shortName } from '../inbox/build'
import { Icon } from '../shell/Icon'
import { useActing } from '../viewas/viewAs'
import { markSeen, type AlertRow } from './store'
import { inAppText } from './inApp'
import { PRIORITY, todayRed } from './todayRed'
import { useAlertRows } from './useAlerts'
import './notify.css'

/** The one alert to show first: newest unseen urgent row, by kind priority. null when there is none. */
export function pickAlert(rows: AlertRow[]): AlertRow | null {
  return todayRed(rows).sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind) || Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] ?? null
}

/** Today's FamilyNotice (S16 L1, F-5 / W-9): a 72 px row with the person's avatar, the fixed title and one sub line. The whole row opens what it is about and marks it seen;
 *  the close button marks it seen too (kv is not used: `carer_alerts.seen_at` is the one record). No Jack on it (D-91). */
export function AlertCardToday() {
  const rows = useAlertRows()
  const { people } = useFamilyPeople()
  const { acting } = useActing()
  const row = pickAlert(rows)
  // the admin's own family alert is not the viewed person's; sos and rollcall are safety and stay
  if (!row || (acting && row.kind !== 'sos' && row.kind !== 'rollcall')) return null
  const who = people.find((p) => p.id === row.personId)
  const name = shortName(who?.name)
  const t = inAppText(row, { name })
  const seen = () => void markSeen(row.id).catch(() => undefined)
  return (
    <section className="card al-row" aria-label="Family alert" data-kind={row.kind} data-testid="family-notice">
      <a className="al-main press" href={t.href} onClick={seen}>
        <span className="al-av">{who ? <FmAvatar name={who.name} photoPath={who.photoPath} thumb={who.thumb} size={40} /> : <Icon name="users" size={20} />}</span>
        <span className="al-txt"><b>{t.title}</b><span className="al-sub">{t.body}</span></span>
        <Icon name="chev" size={20} />
      </a>
      <button type="button" className="al-x" aria-label="Dismiss this family alert" onClick={seen}><Icon name="close" size={20} /></button>
    </section>
  )
}
