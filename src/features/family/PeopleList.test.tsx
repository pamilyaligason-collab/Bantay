import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const person = (id: string, name: string, isMe = false, extra: { phone?: string; messenger?: string } = {}) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe, ...extra })
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
  it('four or fewer people: all shown as cards, no Show more, an Add card, no place-sharing sentence', () => {
    render(<PeopleList people={people} />)
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull()
    expect(screen.getAllByTestId('people-row')).toHaveLength(3)
    expect(screen.getByTestId('people-add').getAttribute('href')).toBe('#me/family')
    expect(document.body.textContent).not.toMatch(/place sharing/i)
  })
  it('People is a 2-column grid, and the Add card is a cell in it, also after Show more', () => {
    render(<PeopleList people={people} />)
    const grid = within(screen.getByTestId('people-list')).getByRole('group', { name: 'People' })
    expect(grid.className).toBe('more-grid')
    expect(grid.lastElementChild).toBe(screen.getByTestId('people-add')) // inside the grid, last cell
  })
  it('five people: four cards, anyone flagged or not checked in first, Show 1 more adds the rest', () => {
    render(<PeopleList people={[...people, person('x1', 'Ana Cruz'), person('x2', 'Ben Cruz')]} />)
    const names = () => screen.getAllByTestId('people-row').map((r) => r.querySelector('.rw-title')!.textContent)
    expect(names()).toEqual(['You', 'Ma', 'Ana', 'Ben']) // Papa has a check-in and no flag for a read-only link, so he waits behind the unchecked two
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }))
    expect(names()).toEqual(['You', 'Ma', 'Ana', 'Ben', 'Papa'])
    expect(screen.getByRole('button', { name: 'Show less' })).toBeTruthy()
  })
  it('a healthy "All up to date" person is not a flag: the flagged person, last in the input, is in the first three', () => {
    h.writable = ['ana', 'ben', 'zed']
    h.checked = ['me', 'ana', 'ben', 'cy', 'zed']
    h.flags = { me: 'All up to date', ana: 'All up to date', ben: 'All up to date', zed: '2 to check' }
    render(<PeopleList people={[person('me', 'Rey Villar', true), person('ana', 'Ana Cruz'), person('ben', 'Ben Cruz'), person('cy', 'Cy Cruz'), person('zed', 'Zed Cruz')]} />)
    const names = () => screen.getAllByTestId('people-row').map((r) => r.querySelector('.rw-title')!.textContent)
    expect(names()).toEqual(['Zed', 'You', 'Ana', 'Ben']) // flagged first, then the checked-in rest in input order
    expect(row(/Zed/).textContent).toContain('2 to check')
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }))
    expect(names()).toEqual(['Zed', 'You', 'Ana', 'Ben', 'Cy'])
  })
  it('with more than four people the Add card stays the last cell of the grid, before and after Show more', () => {
    render(<PeopleList people={[...people, person('x1', 'Ana Cruz'), person('x2', 'Ben Cruz')]} />)
    const grid = () => within(screen.getByTestId('people-list')).getByRole('group', { name: 'People' })
    expect(grid().children).toHaveLength(5) // four people and Add
    expect(grid().lastElementChild).toBe(screen.getByTestId('people-add'))
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }))
    expect(grid().children).toHaveLength(6)
    expect(grid().lastElementChild).toBe(screen.getByTestId('people-add'))
  })
})

describe('PeopleList reach buttons and today status (D-168)', () => {
  it('Message on everyone but you; Messenger only with a saved handle, WhatsApp only with a +country number', () => {
    const list = [person('me', 'Rey Villar', true, { phone: '+63 917 000 0000', messenger: 'rey.villar' }), person('ma', 'Ma Villar', false, { phone: '+63 917 123 4567', messenger: 'ma.villar' }), person('pa', 'Papa Villar', false, { phone: '0917 123 4567' }), person('ti', 'Tita Cruz')]
    render(<PeopleList people={list} />)
    expect(within(row(/You/)).queryByRole('button', { name: 'Message' })).toBeNull() // not for yourself
    const ma = within(row(/Ma/))
    expect(ma.getByRole('button', { name: 'Message' })).toBeTruthy()
    expect(ma.getByRole('link', { name: 'Messenger' }).getAttribute('href')).toBe('https://m.me/ma.villar')
    expect(ma.getByRole('link', { name: 'WhatsApp' }).getAttribute('href')).toBe('https://wa.me/639171234567')
    const pa = within(row(/Papa/)) // local number, no handle: neither app button
    expect(pa.getByRole('button', { name: 'Message' })).toBeTruthy()
    expect(pa.queryByRole('link', { name: 'Messenger' })).toBeNull()
    expect(pa.queryByRole('link', { name: 'WhatsApp' })).toBeNull()
    const ti = within(row(/Tita/)) // nothing saved: never a messenger.com link
    expect(ti.queryByRole('link', { name: /Messenger|WhatsApp/ })).toBeNull()
    expect(document.querySelector('a[href*="messenger.com"]')).toBeNull()
  })

  it('shows what needs a look from the focus on the card, for the people passed in only', () => {
    const f = (id: string, kind: string, line: string) => ({ person: people.find((p) => p.id === id)!, focus: { kind, line, tint: 'red', body: '', action: { label: 'Open', kind: 'open' } }, missedDoses: [], alertIds: [], asks: [] }) as never
    render(<PeopleList people={people} focus={[f('ma', 'missed', 'Missed a medicine'), f('me', 'ok', 'OK 7:40 AM')]} />)
    expect(within(row(/Ma/)).getByTestId('pp-today').textContent).toBe('Missed a medicine')
    expect(within(row(/You/)).queryByTestId('pp-today')).toBeNull() // an ok focus adds no second line
    expect(within(row(/Papa/)).queryByTestId('pp-today')).toBeNull() // read-only link: not passed, nothing said
  })
})

