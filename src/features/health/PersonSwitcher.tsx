import { useState } from 'react'
import { Icon } from '../shell/Icon'
import FmAvatar from '../family/FmAvatar'
import { useFamilyPeople } from '../family/roster'
import { GroupedList, Row, Sheet, leaveSheet } from '../look'
import { firstName } from '../records/ConfirmSheet'
import type { Person } from '../records/store'
import { properName } from './medName'
import './health.css'

/** Fields a person row may carry. The server already hides archived people from the pull (RLS on people.archived_at, and sync forgets them), and there is no column that marks the shared family account (no `kind` on public.people), so on real data this filter does nothing yet (H5; needs a marker column to act on the shared account). */
export type SwitcherPerson = Person & { kind?: string; archivedAt?: string | null }

/** Who the switcher lists: not the shared family account, not an archived person. The person you are on always stays. */
export const switcherPeople = (people: SwitcherPerson[], keepId = ''): SwitcherPerson[] => people.filter((p) => p.id === keepId || (p.kind !== 'shared' && !p.archivedAt))

/** "Whose health": a 44 px pill (avatar, first name, down chevron) that opens a sheet of the people you can see. Me stays here; anyone else opens their view-only page. Hidden for one person. */
export function PersonSwitcher({ people: all, meId, personId, setPersonId }: { people: SwitcherPerson[]; meId: string; personId: string; setPersonId: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const { people: known } = useFamilyPeople()
  const people = switcherPeople(all, personId)
  if (people.length < 2) return null
  const nameOf = (p: Person) => (p.id === meId ? 'Me' : firstName(properName(p.name)))
  const face = (p: Person, size: number) => { const f = known.find((k) => k.id === p.id); return <FmAvatar name={p.name} photoPath={f?.photoPath} thumb={f?.thumb} size={size} /> }
  const cur = people.find((p) => p.id === personId)
  const pick = (id: string) => leaveSheet(() => {
    if (id === meId) { setPersonId(meId); setOpen(false); if (location.hash !== '#health') location.hash = '#health' } else location.hash = `#health/member/${id}`
  })
  return (
    <>
      <button type="button" className="ps-pill press" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        {cur ? face(cur, 28) : null}<span>{cur ? nameOf(cur) : 'Me'}</span><Icon name="down" size={16} />
      </button>
      {open && (
        <Sheet title="Whose health" onClose={() => setOpen(false)}>
          <GroupedList label="Whose health">
            {people.map((p) => <Row key={p.id} avatar={face(p, 32)} title={nameOf(p) === 'Me' ? 'Me' : properName(p.name)} sub={p.id === personId ? 'Showing now' : undefined} onClick={() => pick(p.id)} />)}
          </GroupedList>
        </Sheet>
      )}
    </>
  )
}
