import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
const h = vi.hoisted(() => ({ writable: ['ma'] as string[], acting: false, flags: { me: '1 to check', ma: '2 to check', pa: '3 to check' } as Record<string, string>, checked: ['me', 'ma', 'pa'] as string[] }))
vi.mock('../auth/client', () => ({ supabase: {} })) // signed in
vi.mock('./CarerCards', () => ({ useCarerIds: () => h.writable }))
vi.mock('./reportData', () => ({ useFlagLines: () => h.flags })) // all three would be flagged
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: h.acting, personId: null, name: '' }), useViewedVisibleIds: () => null }))
vi.mock('./roster', async (orig) => ({ ...(await orig<object>()), useCheckInsLoaded: () => Object.fromEntries(h.checked.map((id) => [id, new Date().toISOString()])) }))
import { PeopleList } from './PeopleList'

const start = { writable: ['ma'], acting: false, flags: { me: '1 to check', ma: '2 to check', pa: '3 to check' } as Record<string, string>, checked: ['me', 'ma', 'pa'] }
afterEach(() => { cleanup(); Object.assign(h, structuredClone(start)) }) // every test starts from the same shared state
const people = [person('me', 'Rey Villar', true), person('ma', 'Ma Villar'), person('pa', 'Papa Villar')]
const row = (name: RegExp) => within(screen.getByTestId('people-list')).getAllByTestId('people-row').find((r) => name.test(r.textContent ?? ''))!

describe('PeopleList flag word (D-109)', () => {
  it('shows it for you and a writer link; a read-only link (Papa) shows the check-in alone', () => {
    render(<PeopleList people={people} />)
    expect(row(/You/).textContent).toContain('1 to check')
    expect(row(/Ma/).textContent).toContain('2 to check')
    expect(row(/Papa/).textContent).not.toMatch(/to check/)
    expect(row(/Papa/).textContent).toContain('OK today')
  })
  it('viewing as someone shows what they would see: every line', () => {
    h.acting = true
    render(<PeopleList people={people} />)
    expect(row(/Papa/).textContent).toContain('3 to check')
  })
  it('three or fewer people: no See all, no place-sharing sentence (F3)', () => {
    render(<PeopleList people={people} />)
    expect(screen.queryByRole('button', { name: /See all/ })).toBeNull()
    expect(screen.getAllByTestId('people-row')).toHaveLength(3)
    expect(document.body.textContent).not.toMatch(/place sharing/i)
  })
  it('five people: three rows, anyone flagged or not checked in first, See all (5) shows the rest', () => {
    render(<PeopleList people={[...people, person('x1', 'Ana Cruz'), person('x2', 'Ben Cruz')]} />)
    const names = () => screen.getAllByTestId('people-row').map((r) => r.querySelector('.rw-title')!.textContent)
    expect(names()).toEqual(['You', 'Ma', 'Ana']) // Papa has a check-in and no flag for a read-only link, so he waits behind the unchecked two
    fireEvent.click(screen.getByRole('button', { name: 'See all (5)' }))
    expect(names()).toEqual(['You', 'Ma', 'Ana', 'Ben', 'Papa'])
    expect(screen.getByRole('button', { name: 'Fewer' })).toBeTruthy()
  })
  it('a healthy "All up to date" person is not a flag: the flagged person, last in the input, is in the first three', () => {
    h.writable = ['ana', 'ben', 'zed']
    h.checked = ['me', 'ana', 'ben', 'cy', 'zed']
    h.flags = { me: 'All up to date', ana: 'All up to date', ben: 'All up to date', zed: '2 to check' }
    render(<PeopleList people={[person('me', 'Rey Villar', true), person('ana', 'Ana Cruz'), person('ben', 'Ben Cruz'), person('cy', 'Cy Cruz'), person('zed', 'Zed Cruz')]} />)
    const names = () => screen.getAllByTestId('people-row').map((r) => r.querySelector('.rw-title')!.textContent)
    expect(names()).toEqual(['Zed', 'You', 'Ana']) // flagged first, then the checked-in rest in input order
    expect(row(/Zed/).textContent).toContain('2 to check')
    fireEvent.click(screen.getByRole('button', { name: 'See all (5)' }))
    expect(names()).toEqual(['Zed', 'You', 'Ana', 'Ben', 'Cy'])
  })
})
