import { smsNumber } from './sms'
import type { SosContact } from './contacts'

export type ContactState = 'sent' | 'ready' | 'no-number'
export interface StatusRow { name: string; phone: string; state: ContactState }

/** One row per contact the text was prepared for. "sent" means only that the text app was opened with the message in it:
 *  Android does not tell Bantay whether the person pressed send or whether it was delivered, so we never claim more. */
export function statusRows(contacts: SosContact[], opened: boolean): StatusRow[] {
  return contacts.map((c) => {
    const usable = smsNumber(c.phone).replace(/\D/g, '').length >= 10
    return { name: c.name.trim() || c.phone.trim(), phone: c.phone.trim(), state: !usable ? 'no-number' : opened ? 'sent' : 'ready' }
  })
}

const LABEL: Record<ContactState, string> = { sent: 'Sent', ready: 'Ready', 'no-number': 'No number' }

export function SosStatus({ contacts, opened }: { contacts: SosContact[]; opened: boolean }) {
  const rows = statusRows(contacts, opened)
  if (!rows.length) return null
  return (
    <div className="sos-status" data-testid="sos-status">
      <b>Text prepared for</b>
      <ul>
        {rows.map((r) => (
          <li key={r.phone + r.name}>
            <span className="sos-who">{r.name}<span className="sub">{r.phone}</span></span>
            <span className="sos-st-chip" data-state={r.state}>{LABEL[r.state]}</span>
          </li>
        ))}
      </ul>
      <p className="sub">Sent means your text app opened with the message. Bantay cannot see if it was delivered.</p>
    </div>
  )
}
