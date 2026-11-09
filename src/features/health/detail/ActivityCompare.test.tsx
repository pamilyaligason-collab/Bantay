import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ldb } from '../../log/store'
import type { Activity } from '../model'

const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
const S = vi.hoisted(() => ({ people: [] as ReturnType<typeof person>[], linked: [] as ReturnType<typeof person>[], selfId: 'me' as string | null }))
vi.mock('../../family/roster', () => ({ useFamilyPeople: () => ({ people: S.people, selfId: S.selfId }) }))
vi.mock('../../family/useFamilyScope', () => ({ useLinkedPeople: () => S.linked }))

import { ActivityCompare } from './ActivityCompare'

// A fixed clock a long way from the real one: if the query window used Date.now(), none of these rows would be read.
const NOW = new Date(2026, 2, 10, 10, 0)
const days = (n: number, steps: number): Activity[] => Array.from({ length: n }, (_, i) => ({ kind: 'steps', minutes: null, steps, startedAt: new Date(2026, 2, 10 - i, 9).toISOString(), source: 'manual' }))
const seed = (personId: string, n: number, steps: number) => ldb.activity.bulkAdd(days(n, steps).map((a) => ({ ...a, personId })) as never)

const ME = person('me', 'Ana Sample', true), BEN = person('ben', 'ben sample'), CY = person('cy', 'Cy Sample'), RO = person('ro', 'Read Only')

beforeEach(async () => {
  await ldb.activity.clear()
  S.selfId = 'me'
  S.people = [ME, BEN, CY, RO]
  S.linked = [ME, BEN, CY] // RO is a read-only link: not in the D-109 set
})
afterEach(cleanup)

const text = (id: string) => screen.getByTestId(id).textContent!

describe('ActivityCompare: whose steps are compared', () => {
  it('viewer = viewed: "Your" sentences, the picker lists the others, the average counts each person once', async () => {
    await Promise.all([seed('ben', 10, 8000), seed('cy', 10, 3000)])
    render(<ActivityCompare acts={days(10, 5000)} now={NOW} personId="me" />)
    await waitFor(() => expect(screen.getByTestId('compare-family')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'How you compare' })).toBeTruthy()
    expect(text('compare-goal')).toContain('Your average of 5,000 steps a day is lower than the Bantay goal')
    expect(text('compare-member')).toContain("Your average is lower than Ben Sample's (8,000 a day).")
    expect(text('compare-family')).toContain('Your average is lower than the family average (5,333 a day, from 3 people).') // (5000 + 8000 + 3000) / 3
    expect(within(screen.getByLabelText('Compare with')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Ben Sample', 'Cy Sample'])
  })

  it('a carer viewing a member: that member is the subject, the carer is a pick as "You" and in the average, the member is not counted twice', async () => {
    await Promise.all([seed('me', 10, 4000), seed('cy', 10, 6000)])
    render(<ActivityCompare acts={days(10, 8000)} now={NOW} personId="ben" />)
    await waitFor(() => expect(screen.getByTestId('compare-family')).toBeTruthy())
    expect(screen.getByRole('heading', { name: 'How Ben compares' })).toBeTruthy()
    expect(text('compare-goal')).toContain("Ben's average of 8,000 steps a day is higher than the Bantay goal")
    expect(text('compare-goal')).not.toContain('Your')
    expect(text('compare-member')).toContain("Ben's average is higher than yours (4,000 a day).")
    expect(screen.getByTestId('compare-member').textContent).toContain('You')
    expect(text('compare-family')).toContain("Ben's average is higher than the family average (6,000 a day, from 3 people).") // (8000 + 4000 + 6000) / 3
    const opts = within(screen.getByLabelText('Compare with')).getAllByRole('option').map((o) => o.textContent)
    expect(opts).toEqual(['You', 'Cy Sample']) // never the viewed person
  })

  it('a read-only link is neither a pick nor part of the family average, whatever rows this phone holds', async () => {
    await Promise.all([seed('me', 10, 4000), seed('ro', 20, 40000)])
    S.linked = [ME, BEN]
    render(<ActivityCompare acts={days(10, 8000)} now={NOW} personId="ben" />)
    await waitFor(() => expect(screen.getByTestId('compare-family')).toBeTruthy())
    expect(text('compare-family')).toContain('(6,000 a day, from 2 people)') // (8000 + 4000) / 2; the 40,000 of RO is never read
    expect(screen.queryByLabelText('Compare with')).toBeNull() // one other person: nothing to pick
    expect(document.body.textContent).not.toContain('Read Only')
  })

  it('fewer than 7 days of the viewed person: only the wait line, no sentence about anyone', async () => {
    await seed('me', 10, 4000)
    render(<ActivityCompare acts={days(6, 8000)} now={NOW} personId="ben" />)
    expect(await screen.findByTestId('compare-wait')).toBeTruthy()
    expect(screen.queryByTestId('activity-compare-card')).toBeNull()
  })

  it('a person with fewer than 7 days is left out of the pick row and the average (no noise), the goal row stays', async () => {
    await Promise.all([seed('me', 3, 4000), seed('cy', 10, 6000)])
    render(<ActivityCompare acts={days(10, 8000)} now={NOW} personId="ben" />)
    await waitFor(() => expect(screen.getByTestId('compare-family')).toBeTruthy())
    expect(text('compare-family')).toContain('(7,000 a day, from 2 people)') // me has 3 days: not counted
  })

  it('cards carry the contract classes', async () => {
    await seed('cy', 10, 6000)
    render(<ActivityCompare acts={days(10, 8000)} now={NOW} personId="me" />)
    const card = await screen.findByTestId('compare-goal')
    expect(card.className).toContain('card')
    expect(card.className).toContain('tint')
    expect(card.getAttribute('data-hue')).toBeTruthy()
    expect(card.querySelector('.cd-kicker')).toBeTruthy()
    expect(card.querySelector('.cd-value')).toBeTruthy()
  })
})
