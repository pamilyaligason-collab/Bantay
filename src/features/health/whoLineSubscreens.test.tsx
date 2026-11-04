import 'fake-indexeddb/auto'
import type React from 'react'
import { useEffect } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))

import MetricScreen from './MetricScreen'
import NutritionScreen from '../nutrition/NutritionScreen'
import Refill from './Refill'
import VisitSummary from './VisitSummary'
import NudgeHub from '../nudge/NudgeHub'
import Library from './library/Library'
import { hdb } from '../records/store'
import { resetPersonChoice, useHealthData } from '../records/useHealthData'

// H6 / D-105: two people on the device, yet no chip row on these sub-screens; the page says whose it is (WhoLine) and the person is changed on the Health root.
const SCREENS: [string, () => React.ReactElement][] = [
  ['MetricScreen', () => <MetricScreen code="bp_systolic" />],
  ['NutritionScreen', () => <NutritionScreen />],
  ['Refill', () => <Refill />],
  ['VisitSummary', () => <VisitSummary />],
  ['NudgeHub', () => <NudgeHub />],
  ['Library', () => <Library />]
]

beforeEach(async () => {
  resetPersonChoice()
  await Promise.all([db.kv.clear(), hdb.readings.clear(), hdb.people.clear()])
  await hdb.people.bulkPut([{ id: 'p1', name: 'Maria Sample' }, { id: 'p2', name: 'Lola Sample' }])
})
afterEach(cleanup)

describe('H6: sub-screens tell whose page it is, with no chip row', () => {
  for (const [name, ui] of SCREENS) {
    it(name, async () => {
      render(ui())
      expect((await screen.findByTestId('who-line')).textContent).toBe('Me')
      expect(screen.queryByTestId('person-chips')).toBeNull()
    })
  }
})

// Round 2 / 2.7: "My progress" reads as someone else's page when a carer views them, so the title drops "My".
function As({ id }: { id: string }) {
  const { setPersonId } = useHealthData()
  useEffect(() => setPersonId(id), [id, setPersonId])
  return <NudgeHub />
}
describe('Progress title', () => {
  it('is "My progress" on my own page', async () => {
    render(<NudgeHub />)
    await screen.findByTestId('who-line')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('My progress')
  })
  it('is "Progress" when another person is chosen', async () => {
    render(<As id="p2" />)
    expect((await screen.findByTestId('who-line')).textContent).toBe('Lola Sample')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Progress')
  })
})
