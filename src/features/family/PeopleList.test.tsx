import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
const h = vi.hoisted(() => ({ writable: ['ma'] as string[], acting: false }))
vi.mock('../auth/client', () => ({ supabase: {} })) // signed in
vi.mock('./CarerCards', () => ({ useCarerIds: () => h.writable }))
vi.mock('./reportData', () => ({ useFlagLines: () => ({ me: '1 to check', ma: '2 to check', pa: '3 to check' }) })) // all three would be flagged
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: h.acting, personId: null, name: '' }), useViewedVisibleIds: () => null }))
vi.mock('./roster', async (orig) => ({ ...(await orig<object>()), useCheckInsLoaded: () => ({ me: new Date().toISOString(), ma: new Date().toISOString(), pa: new Date().toISOString() }) }))
import { PeopleList } from './PeopleList'

afterEach(cleanup)
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
    h.acting = false
  })
})
