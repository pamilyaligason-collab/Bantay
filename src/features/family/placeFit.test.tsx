import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import PlaceMap from './PlaceMap'
import { fitPlan } from './placeFit'
import type { Place } from './placeApi'

// Hand values: Tagbilaran 9.65, 123.85 and General Santos 6.11, 125.17 are about 420 km apart (one cluster); Houston 29.76, -95.37 is about 13,000 km from both.
const at = (personId: string, lat: number, lon: number): Place => ({ personId, lat, lon, accuracyM: null, fixedAt: Date.now(), batteryPct: null, charging: null })
const TAG = at('a', 9.65, 123.85), GEN = at('b', 6.11, 125.17), HOU = at('c', 29.76, -95.37), AUS = at('d', 30.27, -97.74)
afterEach(cleanup)

describe('fitPlan: the cluster the map fits', () => {
  it('everyone in the Philippines: all fitted, nobody far (same as before)', () => {
    expect(fitPlan([TAG, GEN])).toEqual({ main: [TAG, GEN], far: [] })
    expect(fitPlan([TAG])).toEqual({ main: [TAG], far: [] })
    expect(fitPlan([])).toEqual({ main: [], far: [] })
  })
  it('one member in Texas: the Philippine pair is fitted, the Texas member is far, about 13,000 km', () => {
    const p = fitPlan([HOU, TAG, GEN])
    expect(p.main).toEqual([TAG, GEN])
    expect(p.far).toHaveLength(1)
    expect(p.far[0]!.place).toBe(HOU)
    expect(p.far[0]!.km).toBeGreaterThan(12_500)
    expect(p.far[0]!.km).toBeLessThan(14_500)
  })
  it('the biggest group wins whichever is listed first; a tie keeps the first place\'s group; two Texans stay one group', () => {
    expect(fitPlan([HOU, AUS, TAG]).main).toEqual([HOU, AUS]) // two in Texas, one in the Philippines
    expect(fitPlan([TAG, HOU]).main).toEqual([TAG]) // 1 and 1: the first place's group
    expect(fitPlan([HOU, TAG]).main).toEqual([HOU])
  })
  it('the 3,000 km line is the only rule: a chain of near neighbours is one group', () => {
    const a = at('a', 0, 0), b = at('b', 0, 20), c = at('c', 0, 40) // 2,224 km steps along the equator
    expect(fitPlan([a, b, c]).far).toEqual([])
    expect(fitPlan([a, c]).far).toHaveLength(1) // 4,448 km apart
  })
})

describe('PlaceMap chips', () => {
  const name = (id: string) => ({ a: 'Joy', b: 'Ben', c: 'Rey', d: 'Amy' })[id] ?? 'Family member'
  it('a far member gets a labelled chip; tapping it offers the way back; no chip when everyone is near', () => {
    const { rerender } = render(<PlaceMap places={[TAG, GEN]} nameOf={name} />)
    expect(screen.queryByTestId('place-far')).toBeNull()
    rerender(<PlaceMap places={[HOU, TAG, GEN]} nameOf={name} />)
    const far = screen.getByRole('group', { name: 'Family members far away' })
    const chip = within(far).getByRole('button', { name: /^Rey · about 1[34],\d00 km away$/ })
    expect(within(far).queryByRole('button', { name: 'Back to everyone nearby' })).toBeNull()
    fireEvent.click(chip)
    fireEvent.click(within(far).getByRole('button', { name: 'Back to everyone nearby' }))
    expect(within(far).queryByRole('button', { name: 'Back to everyone nearby' })).toBeNull()
  })
})
