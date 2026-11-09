import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./CarerCards', () => ({ useCarerIds: () => ['ma'] }))
vi.mock('./useFamilyScope', () => ({ useFamilyScope: () => ({ isOwner: false }), useLinkedPeople: () => [] }))
const save = vi.fn(async () => 'ok')
vi.mock('./messengerApi', () => ({ saveMessenger: (...a: unknown[]) => save(...(a as [])), useMessengers: () => ({}), loadMessengers: async () => ({}) }))
import { ReachList } from './ReachList'
import type { FamilyPerson } from './roster'

// Invented people. Rey is the viewer; Ma is someone Rey cares for (writer); Tita and Lola are only readable.
const P = (id: string, name: string, o: Partial<FamilyPerson> = {}): FamilyPerson => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe: false, ...o })
const people = [P('me', 'Rey Villar', { isMe: true }), P('ma', 'Ma Villar', { phone: '+639170000000', messenger: 'ma.villar' }), P('ti', 'Tita Villar', { phone: '09170000000' }), P('lo', 'Lola Villar', { messenger: 'lola.v' })]

beforeEach(() => { save.mockClear() })
afterEach(cleanup)

describe('Messages: a row per person (S28)', () => {
  it('Messenger and WhatsApp buttons only where a name or a +number exists; Add Messenger name only where the viewer may edit', () => {
    render(<ReachList people={people} />)
    const row = (n: string) => screen.getAllByTestId('reach-row').find((r) => r.textContent?.includes(n))!
    const ma = row('Ma')
    expect(within(ma).getByRole('link', { name: 'Messenger' }).getAttribute('href')).toBe('https://m.me/ma.villar')
    expect(within(ma).getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/639170000000')
    expect(within(ma).getByRole('button', { name: 'Change Messenger name' })).toBeTruthy() // a writer carer may edit
    const ti = row('Tita')
    expect(within(ti).queryByRole('link')).toBeNull() // a 09... number has no country code: no WhatsApp; no name: no Messenger
    expect(within(ti).queryByRole('button')).toBeNull() // not editable by this viewer
    expect(ti.textContent).toContain('No Messenger or WhatsApp saved yet')
    const lo = row('Lola')
    expect(within(lo).getByRole('link', { name: 'Messenger' })).toBeTruthy()
    expect(within(lo).queryByRole('button')).toBeNull()
    expect(within(row('You')).getByRole('button', { name: 'Add Messenger name' })).toBeTruthy() // yourself: add your own
    expect(within(row('You')).queryByRole('link')).toBeNull()
  })

  it('Add Messenger name saves the pasted name for that person', async () => {
    render(<ReachList people={people} />)
    fireEvent.click(within(screen.getAllByTestId('reach-row').find((r) => r.textContent?.includes('You'))!).getByRole('button', { name: 'Add Messenger name' }))
    fireEvent.change(await screen.findByLabelText('Messenger name for you'), { target: { value: 'm.me/rey.v1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(save).toHaveBeenCalledWith('me', 'm.me/rey.v1'))
  })
})
