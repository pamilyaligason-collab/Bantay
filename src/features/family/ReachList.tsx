import { useState } from 'react'
import { GroupedList, Row } from '../look'
import FmAvatar from './FmAvatar'
import { faceName } from './FacesRow'
import { messengerHref, whatsappHref } from './messagesLogic'
import { saveMessenger } from './messengerApi'
import { useCarerIds } from './CarerCards'
import type { FamilyPerson } from './roster'
import Sheet from './Sheet'
import { useFamilyScope } from './useFamilyScope'
import './s28-family.css'

/** Add or change one person's Messenger name (people.messenger, 0061). The database decides who may; a refusal says so in words. */
export function MessengerEditor({ person, onClose }: { person: FamilyPerson; onClose: () => void }) {
  const [text, setText] = useState(person.messenger ?? '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const name = person.isMe ? 'you' : faceName(person.name)
  const save = async () => {
    if (busy) return
    setBusy(true)
    const r = await saveMessenger(person.id, text)
    if (r === 'ok') return onClose()
    setBusy(false)
    setErr(r === 'invalid' ? 'Use letters, numbers and dots only, 5 to 50 characters. You can paste the m.me link.' : r === 'denied' ? 'Only that person, their carer or the family owner can change this.' : 'Could not save. Check the connection and try again.')
  }
  return (
    <Sheet title="Messenger name" onClose={onClose}>
      <div className="fm-form">
        <label htmlFor="fm-mess">Messenger name for {name}</label>
        <input id="fm-mess" value={text} maxLength={80} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => { setText(e.target.value); setErr('') }} placeholder="the name after m.me/" />
        {err && <p className="sub" role="alert">{err}</p>}
        <button type="button" className="btn" disabled={busy} onClick={() => void save()}>Save</button>
        {person.messenger && <button type="button" className="btn2" disabled={busy} onClick={() => { setText(''); void saveMessenger(person.id, '').then((r) => { if (r === 'ok') onClose(); else setErr('Could not remove it. Try again.') }) }}>Remove</button>}
      </div>
    </Sheet>
  )
}

/** Family > Messages (S28, D-168): one row per person with a Messenger and a WhatsApp button when that person has a saved name or a +country-code number, else "Add Messenger name" for the people you may edit (yourself, the people you care for, and the owner for everyone). */
export function ReachList({ people }: { people: FamilyPerson[] }) {
  const writable = useCarerIds()
  const { isOwner } = useFamilyScope()
  const [edit, setEdit] = useState<FamilyPerson | null>(null)
  const mayEdit = (p: FamilyPerson) => p.isMe || isOwner || writable.includes(p.id)
  if (!people.length) return null
  return (
    <section aria-labelledby="reach-h" data-testid="reach">
      <h2 className="hd cd-title" id="reach-h">Message each person</h2>
      <GroupedList label="Message each person" testId="reach-list">
        {people.map((p) => {
          const mess = messengerHref(p.messenger)
          const wa = p.isMe ? null : whatsappHref(p.phone)
          const name = p.isMe ? 'You' : faceName(p.name)
          return (
            <Row key={p.id} testId="reach-row" avatar={<FmAvatar name={p.name} photoPath={p.photoPath} thumb={p.thumb} size={36} />} title={name}
              sub={p.isMe ? (mess ? 'Your Messenger name is saved' : undefined) : (!mess && !wa ? 'No Messenger or WhatsApp saved yet' : undefined)}
              control={
                <span className="rc-btns" role="group" aria-label={`Message ${name}`}>
                  {!p.isMe && mess && <a className="pc-btn" href={mess.href} target="_blank" rel="noreferrer">{mess.label}</a>}
                  {wa && <a className="pc-btn" href={wa.href} target="_blank" rel="noreferrer">{wa.label}</a>}
                  {mayEdit(p) && <button type="button" className="pc-btn" onClick={() => setEdit(p)}>{p.messenger ? 'Change Messenger name' : 'Add Messenger name'}</button>}
                </span>
              } />
          )
        })}
      </GroupedList>
      {edit && <MessengerEditor person={edit} onClose={() => setEdit(null)} />}
    </section>
  )
}
