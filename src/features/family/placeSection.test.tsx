import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Place } from './placeApi'

const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
const NOW = Date.now()
const h = vi.hoisted(() => ({ places: null as Place[] | null }))
vi.mock('../auth/client', () => ({ supabase: {} }))
vi.mock('./CarerCards', () => ({ useCarerIds: () => [] }))
vi.mock('./reportData', () => ({ useFlagLines: () => ({}) }))
vi.mock('../viewas/viewAs', () => ({ useActing: () => ({ acting: false, personId: null, name: '' }), useViewedVisibleIds: () => null }))
vi.mock('./placeApi', async (orig) => ({ ...(await orig<typeof import('./placeApi')>()), usePlaces: () => h.places }))
vi.mock('./roster', async (orig) => ({
  ...(await orig<object>()),
  useCheckInsLoaded: () => ({}),
  useFamilyPeople: () => ({ selfId: 'me', people: [person('me', 'Rey Villar', true), person('ma', 'Ma Villar'), person('jo', 'Jo Cruz')] })
}))
import { PeopleList } from './PeopleList'
import { PlaceScreen, WhereCard } from './PlaceSection'

const at = (minAgo: number) => NOW - minAgo * 60_000
const places: Place[] = [
  { personId: 'ma', lat: 14.6, lon: 121, accuracyM: 20, fixedAt: at(12), batteryPct: 18, charging: false },
  { personId: 'jo', lat: 14.7, lon: 121.1, accuracyM: 2000, fixedAt: at(7 * 60), batteryPct: null, charging: null }
]
afterEach(() => { cleanup(); h.places = null })

describe('place lines (D-136)', () => {
  it('the full map lists each sharing person with age and battery in words, newest first', () => {
    h.places = places
    render(<PlaceScreen />)
    const rows = within(screen.getByTestId('place-list')).getAllByTestId('place-row')
    expect(rows.map((r) => r.querySelector('.rw-title')!.textContent)).toEqual(['Ma', 'Jo'])
    expect(rows[0]!.textContent).toContain('12 min ago · Battery 18% · low')
    expect(rows[1]!.textContent).toContain('7 h ago · about ±2 km · may be out of date')
    expect(rows[1]!.textContent).not.toContain('Battery') // unknown battery is left out, not shown as 0
  })
  it('says so when nobody shares, and when it could not load (unknown is not nobody)', () => {
    h.places = []
    const a = render(<PlaceScreen />)
    expect(screen.getByRole('status').textContent).toBe('Nobody is sharing a place yet.')
    a.unmount()
    h.places = null
    render(<PlaceScreen />)
    expect(screen.getByRole('status').textContent).toContain('Could not load the map')
  })
  it('the Family card shows nothing without places and a Full map link with them', () => {
    const a = render(<WhereCard places={null} />)
    expect(screen.queryByTestId('where')).toBeNull()
    a.unmount()
    render(<WhereCard places={places} />)
    expect(screen.getByRole('link', { name: 'Full map' }).getAttribute('href')).toBe('#family/map')
    expect(screen.getByTestId('where').textContent).toContain('Pins older than 6 hours turn grey.')
  })
  it('People adds a place line only for people who share', () => {
    render(<PeopleList people={[person('me', 'Rey Villar', true), person('ma', 'Ma Villar'), person('jo', 'Jo Cruz')]} places={places} />)
    const row = (n: string) => screen.getAllByTestId('people-row').find((r) => r.querySelector('.rw-title')!.textContent === n)!
    expect(row('Ma').textContent).toContain('Place 12 min ago · Battery 18% · low')
    expect(row('You').textContent).not.toContain('Place')
  })
  it('People without places props is exactly as before', () => {
    render(<PeopleList people={[person('me', 'Rey Villar', true)]} />)
    expect(document.body.textContent).not.toContain('Place')
  })
})
