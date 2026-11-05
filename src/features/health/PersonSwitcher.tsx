import { useState } from 'react'
import { Icon } from '../shell/Icon'
import FmAvatar from '../family/FmAvatar'
import { useFamilyPeople } from '../family/roster'
import { GroupedList, Row, Sheet, leaveSheet } from '../look'
import { firstName } from '../records/ConfirmSheet'
import type { Person } from '../records/store'
import { properName } from './medName'
import { useViewAs } from '../viewas/viewAs'
import '../viewas/viewas.css'
import './health.css'

/** Fields a person row may carry. `kind` ('shared' = the shared family account) is filled by the people pull from migration 0046 and stays null before it is applied; archived people are already left out of the pull (D-109), so `archivedAt` is a second guard. */
export type SwitcherPerson = Person & { archivedAt?: string | null }

/** Who the switcher lists: not the shared family account, not an archived person. The person you are on always stays. */
export const switcherPeople = (people: SwitcherPerson[], keepId = ''): SwitcherPerson[] => people.filter((p) => p.id === keepId || (p.kind !== 'shared' && !p.archivedAt))

/** A labelled block of the picker sheet: Family's "Who to show" lists Me, "You care for" and the rest; `sub` is the line under a name (the open one always says "Showing now"). */
export interface SwitcherGroup { label?: string; rows: { id: string; sub?: string }[] }

/** "Whose health": a 44 px pill (avatar, first name, down chevron) that opens a sheet of the people you can see. Me stays here; anyone else opens their view-only page. Hidden for one person.
 *  With `onPick` (Family's "Who to show") a pick calls it and the hash never changes; `title` names the pill and the sheet; `groups` and `foot` lay the sheet out in blocks with a closing line. */
export function PersonSwitcher({ people: all, meId, personId, setPersonId, onPick, title = 'Whose health', groups, foot }: { people: SwitcherPerson[]; meId: string; personId: string; setPersonId: (id: string) => void; onPick?: (id: string) => void; title?: string; groups?: SwitcherGroup[]; foot?: string }) {
  const [open, setOpen] = useState(false)
  const { people: known } = useFamilyPeople()
  const va = useViewAs()
  const people = switcherPeople(all, personId)
  if (people.length < 2) return null
  const nameOf = (p: Person) => (p.id === meId ? 'Me' : firstName(properName(p.name)))
  const face = (p: Person, size: number) => { const f = known.find((k) => k.id === p.id); return <FmAvatar name={p.name} photoPath={f?.photoPath} thumb={f?.thumb} size={size} /> }
  const cur = people.find((p) => p.id === personId)
  const pick = (id: string) => leaveSheet(() => {
    if (onPick) { onPick(id); setOpen(false); return }
    if (id === meId) { setPersonId(meId); setOpen(false); if (location.hash !== '#health') location.hash = '#health' } else location.hash = `#health/member/${id}`
  })
  const blocks: SwitcherGroup[] = groups ?? [{ rows: people.map((p) => ({ id: p.id })) }]
  return (
    <>
      <button type="button" className="ps-pill press" data-other={onPick && cur && cur.id !== meId ? '' : undefined} aria-haspopup="dialog" aria-expanded={open} aria-label={onPick ? `${title}: ${cur ? nameOf(cur) : 'Me'}` : undefined} onClick={() => setOpen(true)}>
        {cur ? face(cur, 28) : null}<span>{cur ? nameOf(cur) : 'Me'}</span><Icon name="down" size={16} />
      </button>
      {open && (
        <Sheet title={title} onClose={() => setOpen(false)}>
          {blocks.map((g, i) => (
            <div key={g.label ?? i}>
              {g.label && <p className="ps-lab">{g.label}</p>}
              <GroupedList label={g.label ?? title}>
                {g.rows.map((r) => { const p = people.find((x) => x.id === r.id); return p ? <Row key={p.id} avatar={face(p, 32)} title={nameOf(p) === 'Me' ? 'Me' : properName(p.name)} sub={p.id === personId ? 'Showing now' : r.sub} onClick={() => pick(p.id)} control={va.can && p.id !== meId ? <button type="button" className="va-open press" data-testid={`viewas-open-${p.id}`} aria-label={`View the whole app as ${nameOf(p)}`} disabled={!!va.busy} onClick={() => void va.go(p.id, () => setOpen(false))}><Icon name="eye" size={14} />View as</button> : undefined} /> : null })}
              </GroupedList>
            </div>
          ))}
          {foot && <p className="sub ps-foot">{foot}</p>}
          {va.can && <p className="sub ps-foot">View as opens every tab the way they see it, needs internet, and is recorded in the family history.</p>}
          {va.err && <p role="alert" className="sub ps-foot">{va.err}</p>}
        </Sheet>
      )}
    </>
  )
}
