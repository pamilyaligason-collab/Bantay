import { useState } from 'react'
import { Icon } from '../shell/Icon'
import { GroupedList, Row, Sheet, leaveSheet } from '../look'
import { firstName } from '../records/ConfirmSheet'
import type { Person } from '../records/store'
import './health.css'

/** "Whose health": a 44 px pill (Me or a first name) that opens a sheet of the people you can see. Me stays here; anyone else opens their view-only page. Hidden for one person. */
export function PersonSwitcher({ people, meId, personId, setPersonId }: { people: Person[]; meId: string; personId: string; setPersonId: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  if (people.length < 2) return null
  const nameOf = (p: Person) => (p.id === meId ? 'Me' : firstName(p.name))
  const cur = people.find((p) => p.id === personId)
  const pick = (id: string) => leaveSheet(() => {
    if (id === meId) { setPersonId(meId); setOpen(false) } else location.hash = `#health/member/${id}`
  })
  return (
    <>
      <button type="button" className="ps-pill press" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span>{cur ? nameOf(cur) : 'Me'}</span><Icon name="chev" size={16} />
      </button>
      {open && (
        <Sheet title="Whose health" onClose={() => setOpen(false)}>
          <GroupedList label="Whose health">
            {people.map((p) => <Row key={p.id} avatar={<span aria-hidden="true">{nameOf(p).charAt(0).toUpperCase()}</span>} title={nameOf(p)} sub={p.id === personId ? 'Showing now' : undefined} onClick={() => pick(p.id)} />)}
          </GroupedList>
        </Sheet>
      )}
    </>
  )
}
