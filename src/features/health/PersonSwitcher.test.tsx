import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  it('with onPick (Family): the pill and sheet use the title, blocks carry their labels, a pick calls onPick and never moves the hash', async () => {
    location.hash = '#family'
    const picked: string[] = []
    render(<PersonSwitcher people={people.slice(0, 4)} meId="me" personId="b" setPersonId={() => undefined} onPick={(id) => picked.push(id)} title="Who to show" foot="Family opens on Me every time."
      groups={[{ rows: [{ id: 'me' }] }, { label: 'You care for', rows: [{ id: 'b', sub: 'You are their carer' }, { id: 'c', sub: 'You are their carer' }] }, { label: 'Everyone else', rows: [{ id: 'd', sub: 'View only' }] }]} />)
    const pill = screen.getByRole('button', { name: 'Who to show: Ben' })
    expect(pill.hasAttribute('data-other')).toBe(true) // someone other than Me is on show
    fireEvent.click(pill)
    const sheet = screen.getByRole('dialog', { name: 'Who to show' })
    expect(within(sheet).getByText('You care for')).toBeTruthy()
    expect(within(sheet).getByText('Everyone else')).toBeTruthy()
    expect(within(sheet).getByText('Family opens on Me every time.')).toBeTruthy()
    const rows = within(sheet).getAllByRole('listitem').map((r) => r.textContent)
    expect(rows).toHaveLength(4)
    expect(rows[1]).toContain('Showing now') // the open one says so, not its relation
    expect(rows[2]).toContain('You are their carer')
    fireEvent.click(within(sheet).getByText('Dan Uy'))
    await waitFor(() => expect(picked).toEqual(['d']))
    expect(location.hash).toBe('#family')
  })
  it('without onPick the pill has no data-other and Health keeps its title', () => {
    render(<PersonSwitcher people={people} meId="me" personId="b" setPersonId={() => undefined} />)
    expect(screen.getByRole('button', { name: /Ben/ }).hasAttribute('data-other')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Ben/ }))
    expect(screen.getByRole('dialog', { name: 'Whose health' })).toBeTruthy()
  })
  it('the person you are on stays even if marked archived', () => {
    expect(switcherPeople(people, 'old').some((p) => p.id === 'old')).toBe(true)
  })
})
