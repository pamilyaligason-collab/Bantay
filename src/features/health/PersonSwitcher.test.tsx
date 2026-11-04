import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../family/roster', () => ({ useFamilyPeople: () => ({ people: [], selfId: null }) }))
vi.mock('../family/FmAvatar', () => ({ default: ({ name }: { name: string }) => <span data-testid="av">{name.charAt(0)}</span> }))

import { PersonSwitcher, switcherPeople, type SwitcherPerson } from './PersonSwitcher'

afterEach(cleanup)
const people: SwitcherPerson[] = [
  { id: 'me', name: 'ana reyes' }, { id: 'b', name: 'BEN CRUZ' }, { id: 'c', name: 'Cora Lim' }, { id: 'd', name: 'Dan Uy' }, { id: 'e', name: 'Eva Ong' },
  { id: 'f', name: 'Fe Sy' }, { id: 'g', name: 'Gil Tan' }, { id: 'h', name: 'Hana Co' }, { id: 'old', name: 'Old Person', archivedAt: '2026-01-01' }, { id: 'fam', name: 'The Family', kind: 'shared' }
]

describe('PersonSwitcher (H5, S8)', () => {
  it('10 people with 1 archived and 1 shared: 8 rows, Me first, proper-cased names', () => {
    expect(switcherPeople(people).map((p) => p.id)).toEqual(['me', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])
    render(<PersonSwitcher people={people} meId="me" personId="me" setPersonId={() => undefined} />)
    const pill = screen.getByRole('button', { name: /Me/ })
    expect(pill.querySelector('svg')).toBeTruthy() // the down chevron
    fireEvent.click(pill)
    const rows = within(screen.getByRole('dialog')).getAllByRole('listitem')
    expect(rows).toHaveLength(8)
    expect(rows[0]!.textContent).toContain('Me')
    expect(rows[0]!.textContent).toContain('Showing now')
    expect(rows[1]!.textContent).toContain('Ben Cruz')
  })
  it('the person you are on stays even if marked archived', () => {
    expect(switcherPeople(people, 'old').some((p) => p.id === 'old')).toBe(true)
  })
})
