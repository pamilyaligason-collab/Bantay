import { useState } from 'react'
import { createPortal } from 'react-dom'
import { loadFamily } from '../auth/family'
import { normalizeContacts, type SosContact } from '../sos/contacts'
import SosContactsPicker from '../sos/SosContactsPicker'
import { useKv } from '../shell/useKv'
import { useActing } from '../viewas/viewAs'
import Group, { NavRow } from './Group'
import { useAccount } from './useAccount'

function SosSheet({ onClose, selfId, onSaved }: { onClose: () => void; selfId: string | null; onSaved: (c: SosContact[]) => void }) {
  return createPortal(
    <div className="sh sh-sheet-wrap" onClick={onClose}>
      <div className="sh-sheet" role="dialog" aria-modal="true" aria-label="Who gets your SOS text" onClick={(e) => e.stopPropagation()}>
        <span className="sh-grab" />
        <h2 className="sh-h2">Who gets your SOS text</h2>
        <SosContactsPicker excludePersonId={selfId} onSaved={onSaved} />
        <button type="button" className="sh-pill sh-primary sh-block" onClick={onClose}>Done</button>
      </div>
    </div>,
    document.querySelector('.bt') ?? document.body
  )
}

/** The SOS contacts' names for a row value ("Mama and Papa"), "Nobody picked yet" when empty. */
export const sosNames = (raw: unknown) => normalizeContacts(raw, loadFamily()).map((c) => c.name).filter(Boolean).join(' and ')

/** Settings > Family and sharing (#me/family): who I care for, who can see my records, who gets my SOS text, Medical ID. The Medical ID "Show on lock screen" switch stays on Medical ID (R20).
 *  Rows that write for a person are off with "View only" while an admin is acting. */
export default function FamilyGroup() {
  const { acting } = useActing()
  const { member, carerOf, roster } = useAccount()
  const [sosRaw, setSosRaw] = useKv<unknown>('sos.contacts', [])
  const [sosOpen, setSosOpen] = useState(false)
  const names = sosNames(sosRaw)
  return (
    <Group title="Family and sharing" testId="settings-family">
      <div className="sh-card sh-list st-list">
        {carerOf.filter((id) => id !== member?.personId).map((id) => (
          <NavRow key={id} icon="users" title={roster.find((x) => x.id === id)?.name ?? 'Family member'} sub="You are their carer. Open their page." href={`#family/people/${id}`} />
        ))}
        <NavRow icon="lock" title="Who can see my records" sub="Pick who sees your records" href="#sharing" locked={acting} />
        <NavRow icon="phone" title="Who gets your SOS text" sub={names || 'Nobody picked yet'} onClick={() => setSosOpen(true)} popup locked={acting} />
        <NavRow icon="cross" title="Medical ID" sub="Blood type, allergies, medicines, who to call" href="#medid" />
      </div>
      {sosOpen && <SosSheet onSaved={setSosRaw} onClose={() => setSosOpen(false)} selfId={member?.personId ?? null} />}
    </Group>
  )
}
