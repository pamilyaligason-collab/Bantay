import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedRow } from '../../db'

const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
const people = [person('p1', 'Maria Sample', true), person('p2', 'Ma Sample'), person('p3', 'Pa Sample')]
const state = { feed: [] as FeedRow[], flag: true }
vi.mock('../auth/client', () => ({ supabase: {} }))
vi.mock('../family/CarerCards', () => ({ useCarerIds: () => ['p2', 'p3'] }))
vi.mock('../family/roster', async (orig) => ({ ...(await orig<object>()), useFamilyPeople: () => ({ people, selfId: 'p1' }), useCheckInsLoaded: () => ({ p1: new Date().toISOString() }) }))
vi.mock('../family/useFamilyScope', async (orig) => ({ ...(await orig<object>()), useLinkedPeople: () => people }))
vi.mock('../family/reportData', () => ({ useFlagLines: () => ({ p2: '2 to check' }) }))
vi.mock('../viewas/viewAs', async (orig) => ({ ...(await orig<object>()), useActing: () => ({ acting: false, personId: null, name: '' }) }))
vi.mock('../family/memoriesApi', () => ({ listPhotos: async () => ({ ok: false, error: 'offline' }) }))
vi.mock('../family/messagesApi', () => ({ listMessages: async () => ({ ok: false, error: 'offline' }) }))
vi.mock('../family/feedApi', () => ({ useFeed: () => state.feed }))
vi.mock('../family/flags', () => ({ familyFeedOn: () => state.flag }))

import { FamilyHealthCard } from './FamilyHealthCard'

const post = (kind: FeedRow['kind'], rowId: string, personId: string, at: string, valueText: string | null, chip: string | null = null): FeedRow =>
  ({ id: `${kind}|${rowId}`, kind, personId, at, titleKey: '', valueText, chip, photoPath: null, rowId })
const recent = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toISOString()

beforeEach(() => { state.feed = []; state.flag = true })
afterEach(cleanup)

describe('FamilyHealthCard with the feed (D-134)', () => {
  it('shows the two newest posts, not the flag lines, and All updates opens the feed', () => {
    state.feed = [
      post('bp', '1', 'p2', recent(1), '148/90 mmHg'),
      post('lab', '2', 'p3', recent(2), 'Cholesterol 210 mg/dL', 'H'),
      post('status', '3', 'p1', recent(3), null)
    ]
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    const c = screen.getByTestId('family-health')
    expect(within(c).getByRole('link', { name: 'All updates' }).getAttribute('href')).toBe('#family/feed')
    expect(c.textContent).toContain('Ma Sample')
    expect(c.textContent).toContain('Shared a blood pressure reading, 148/90 mmHg, High') // the real 0050 value_text parses to a level
    expect(c.textContent).toContain('Cholesterol 210 mg/dL')
    expect(c.textContent).not.toContain("I'm OK") // the third is not shown
    expect(c.textContent).not.toContain('2 to check') // flag lines give way to posts
    expect(c.textContent).toContain('1 of 3 checked in today') // the count line stays
  })
  it('applies the 30-day cut like the feed: an older post is not shown and does not take a slot', () => {
    state.feed = [
      post('bp', '1', 'p2', recent(24 * 31), '120/80 mmHg'), // newer than the others in the list order but 31 days old
      post('status', '2', 'p3', recent(5), null),
      post('lab', '3', 'p2', recent(6), 'Iron 80 ug/dL', 'A'),
      post('status', '4', 'p1', recent(7), null)
    ]
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    const c = screen.getByTestId('family-health')
    expect(c.textContent).not.toContain('120/80')
    expect(c.textContent).toContain('Iron 80 ug/dL, Abnormal')
    expect(c.textContent).toContain("I'm OK")
  })
  it('only posts older than 30 days: they are not shown and today\'s rows stay', () => {
    state.feed = [post('bp', '1', 'p2', recent(24 * 40), '148/90 mmHg')]
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    const c = screen.getByTestId('family-health')
    expect(c.textContent).not.toContain('148/90')
    expect(c.textContent).toContain('2 to check')
    expect(within(c).getByRole('link', { name: 'All updates' }).getAttribute('href')).toBe('#family')
  })
  it('with no posts today\'s rows stay and All updates keeps its old door', () => {
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    const c = screen.getByTestId('family-health')
    expect(c.textContent).toContain('2 to check')
    expect(within(c).getByRole('link', { name: 'All updates' }).getAttribute('href')).toBe('#family')
  })
  it('flag off: posts held on the phone are not shown', () => {
    state.flag = false
    state.feed = [post('bp', '1', 'p2', recent(1), '148/90 mmHg')]
    render(<FamilyHealthCard ids={['p1', 'p2', 'p3']} />)
    const c = screen.getByTestId('family-health')
    expect(c.textContent).not.toContain('148/90')
    expect(c.textContent).toContain('2 to check')
    expect(within(c).getByRole('link', { name: 'All updates' }).getAttribute('href')).toBe('#family')
  })
})
