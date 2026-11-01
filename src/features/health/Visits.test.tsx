import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('../auth/client', () => ({ supabase: null }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'u1', personId: 'p1', role: 'member', handle: null }) }))

import Visits from './Visits'
import { hdb } from '../records/store'
import { resetPersonChoice } from '../records/useHealthData'
import { vdb } from './visitsStore'

beforeEach(async () => {
  location.hash = '#health/visits'
  resetPersonChoice()
  await Promise.all([db.kv.clear(), hdb.readings.clear(), hdb.people.clear(), vdb.appointments.clear(), vdb.followUps.clear()])
  await hdb.people.put({ id: 'p1', name: 'Maria Sample' })
})
afterEach(cleanup)

describe('Visits (v13)', () => {
  it('has a large title with a Health back link', async () => {
    render(<Visits />)
    expect((await screen.findByRole('heading', { level: 1, name: 'Visits' })).textContent).toBe('Visits')
    expect(screen.getByRole('link', { name: 'Back to Health' }).getAttribute('href')).toBe('#health')
  })

  it('no visit: a card with Plan a visit to Family plan, and a question chip only when one is saved', async () => {
    render(<Visits />)
    const card = await screen.findByTestId('no-visit')
    expect(card.textContent).toContain('No visit booked')
    expect(card.querySelector('a.btn')!.getAttribute('href')).toBe('#family/plan')
    expect(card.textContent).toContain('Plan a visit')
    expect(card.querySelector('.vs-chip')).toBeNull()
    await db.kv.put({ key: 'visits.questions.p1', value: ['Why is my sugar up?', 'Dose?'] })
    cleanup()
    render(<Visits />)
    await waitFor(() => expect(screen.getByTestId('no-visit').textContent).toContain('2 questions ready'))
  })

  it('empty lists say so; nothing is invented', async () => {
    render(<Visits />)
    await screen.findByTestId('no-visit')
    expect(screen.getByText('Nothing booked')).toBeTruthy()
    expect(screen.getByText('No past visits yet')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Prepare visit summary' }).getAttribute('href')).toBe('#health/summary')
    expect(screen.getByLabelText('A question for the doctor')).toBeTruthy()
  })
})
