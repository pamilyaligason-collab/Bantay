import { useState } from 'react'
import type { Medication } from '../log/store'
import { GroupedList, Row, Section } from '../look'
import { markSeen } from '../notify/store'
import { useAlertRows } from '../notify/useAlerts'
import { useActing } from '../viewas/viewAs'
import FamilyAnswer from './FamilyAnswer'
import FmAvatar from './FmAvatar'
import { shortName } from '../inbox/build'
import { needsRows, type NeedRow } from './needsRows'
import type { FamilyPerson } from './roster'
import type { useFocuses } from './useFocuses'
import './v13-family.css'

/** Needs you now (board): a grouped list of what the Today cards do not already say. Hidden while acting (the old rule) and when empty. */
export function NeedsList({ fx, people, selfName }: { fx: ReturnType<typeof useFocuses>; people: FamilyPerson[]; selfName: string }) {
  const { acting } = useActing()
  const phones = useAlertRows().filter((r) => r.kind === 'phone_health' && r.seenAt == null && r.personId)
  const [answering, setAnswering] = useState<{ name: string; med: Medication } | null>(null)
  const [note, setNote] = useState('')
  const control = (a: NeedRow['action']) =>
    a.kind === 'answer' ? <button type="button" className="pc-btn rw-ctl" onClick={() => setAnswering({ name: shortName(a.ask.person.name) ?? 'them', med: a.ask.med })}>Answer</button>
    : a.kind === 'phone' ? <a className="pc-btn rw-ctl" href="#me/phone/phones" onClick={() => { void markSeen(a.alertId).catch(() => undefined) }}>Fix phone</a>
    : <a className="pc-btn rw-ctl" href={a.href}>Open</a>
  if (acting || !fx.loaded) return null
  const rows = needsRows(fx.items, phones, people)
  if (!rows.length) return null
  return (
    <Section title="Needs you now" meta={rows.length === 1 ? '1 thing' : `${rows.length} things`} testId="needs">
      <GroupedList label="Needs you now" testId="needs-list">
        {rows.map((r) => (
          <Row key={r.id} testId="need-row" avatar={r.person && <FmAvatar name={r.person.name} photoPath={r.person.photoPath} thumb={r.person.thumb} size={36} />} title={r.title} sub={r.sub}
            control={control(r.action)} />
        ))}
      </GroupedList>
      {answering && <FamilyAnswer name={answering.name} med={answering.med} by={selfName} onClose={() => setAnswering(null)} onDone={setNote} />}
      {note && <div className="toast" role="status">{note}</div>}
    </Section>
  )
}
