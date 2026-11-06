import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, type FeedRow } from '../../db'
import { ldb } from '../log/store'
import { hdb } from '../records/store'

const person = (id: string, name: string, isMe = false) => ({ id, name, photoPath: null, thumb: null, phone: null, birthdate: null, isMe })
const people = [person('p1', 'Maria Sample', true), person('p2', 'Ana Reyes')]
const shares = { on: null as null | { bp: boolean; lab: boolean; photo: boolean; status: boolean } }
vi.mock('./roster', async (orig) => ({ ...(await orig<object>()), useFamilyPeople: () => ({ people, selfId: 'p1' }) }))
vi.mock('../viewas/viewAs', async (orig) => ({ ...(await orig<object>()), useActing: () => ({ acting: false, personId: null, name: '' }) }))
vi.mock('./feedApi', async (orig) => ({ ...(await orig<object>()), useFeedShares: () => ({ on: shares.on, refresh: () => undefined }), signFeedPhotos: async () => new Map([['p2/1.jpg', 'https://signed.test/1']]) }))

import FamilyFeed from './FamilyFeed'

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const row = (kind: FeedRow['kind'], rowId: string, personId: string, at: string, valueText: string | null, extra: Partial<FeedRow> = {}): FeedRow =>
  ({ id: `${kind}|${rowId}`, kind, personId, at, titleKey: '', valueText, chip: null, photoPath: null, rowId, ...extra })

beforeEach(async () => {
  shares.on = null
  await Promise.all([db.feed.clear(), hdb.readings.clear(), ldb.activity.clear()])
})
afterEach(cleanup)

describe('FamilyFeed reads the feed table (D-134)', () => {
  it('shows the posts people switched on, each with its person, and a photo with its signed link', async () => {
    await db.feed.bulkPut([
      row('bp', '1', 'p2', hoursAgo(1), '148/90 mmHg'),
      row('lab', '2', 'p2', hoursAgo(2), 'Cholesterol 210 mg/dL', { chip: 'H' }),
      row('photo', '3', 'p2', hoursAgo(3), 'Lunch', { photoPath: 'p2/1.jpg' })
    ])
    render(<FamilyFeed />)
    const list = await screen.findByRole('list', { name: 'Family feed' })
    await waitFor(() => expect(list.querySelectorAll('li')).toHaveLength(3))
    expect(list.textContent).toContain('Ana')
    expect(list.textContent).toContain('148/90 mmHg')
    expect(list.textContent).toContain('Cholesterol 210 mg/dL')
    await waitFor(() => expect(within(list).getByRole('img', { name: 'Lunch' }).getAttribute('src')).toBe('https://signed.test/1'))
  })
  it('the footer says only what is true: people with a login choose for themselves, the owner for people with none', async () => {
    render(<FamilyFeed />)
    await screen.findByText('Nothing shared yet')
    expect(screen.getByText('Only the person can turn on what they share, in Privacy. The owner does it for people with no login.')).toBeTruthy()
    expect(screen.queryByText(/Everyone chooses/)).toBeNull()
  })
  it('nothing held: the empty state, and no chat text or local-only rows from other people', async () => {
    await ldb.activity.add({ personId: 'p2', kind: 'check-in', startedAt: hoursAgo(1), source: 'manual', minutes: null, steps: null } as never)
    render(<FamilyFeed />)
    await screen.findByText('Nothing shared yet')
  })
  it('your own check-in shows at once when your switch is on, and not when it is off or unknown', async () => {
    await ldb.activity.add({ personId: 'p1', kind: 'check-in', startedAt: hoursAgo(1), source: 'manual', minutes: null, steps: null } as never)
    const { unmount } = render(<FamilyFeed />)
    await screen.findByText('Nothing shared yet') // unknown switch
    unmount()
    shares.on = { bp: false, lab: false, photo: false, status: false }
    const off = render(<FamilyFeed />)
    await screen.findByText('Nothing shared yet')
    off.unmount()
    shares.on = { bp: false, lab: false, photo: false, status: true }
    render(<FamilyFeed />)
    const list = await screen.findByRole('list', { name: 'Family feed' })
    expect(list.textContent).toContain('You')
    expect(list.textContent).toContain("I'm OK")
  })
  it('a post already on the server is not shown twice beside your own local copy', async () => {
    const at = hoursAgo(1)
    await ldb.activity.add({ personId: 'p1', kind: 'check-in', startedAt: at, source: 'manual', minutes: null, steps: null } as never)
    await db.feed.put(row('status', '9', 'p1', at, null))
    shares.on = { bp: false, lab: false, photo: false, status: true }
    render(<FamilyFeed />)
    const list = await screen.findByRole('list', { name: 'Family feed' })
    expect(list.querySelectorAll('li')).toHaveLength(1)
  })
})
