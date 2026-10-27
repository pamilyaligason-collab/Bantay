import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AlertRow } from '../notify/store'
import { buildInbox, countUnread, familyItems, shortName, type InboxSources } from './build'
import { Inbox } from './Inbox'

// The rows with actions mount hooks that read Dexie and the family list; nothing here needs them.
vi.mock('./MissedDoseActions', () => ({ MissedDoseActions: ({ personId }: { personId: string | null }) => <div data-testid="actions">{personId}</div> }))
afterEach(cleanup)

const base: InboxSources = { now: new Date(), alerts: [], profile: [], taken: [], skipped: [], updateVersion: null, pins: [], toCheck: 0 }
const NOW = new Date('2026-10-26T02:10:00Z') // 10:10 in Manila
const row = (id: string, o: Partial<AlertRow> = {}): AlertRow => ({ id, personId: 'p1', kind: 'dose_missed', template: 'dose_missed', ref: 'x', createdAt: '2026-10-26T01:30:00Z', pushedAt: null, seenAt: null, expiresAt: '2026-11-02T01:30:00Z', ...o })
const names = (id: string | null) => (id === 'p1' ? 'Mama Rosa Cruz' : null)

describe('family alert rows in the alert list (D-78)', () => {
  it('one item per unexpired row, newest first, with the fixed copy and the person filled in from this phone', () => {
    const items = familyItems([
      row('a', { createdAt: '2026-10-26T00:00:00Z' }),
      row('b', { kind: 'mood_unwell', template: 'mood_unwell', createdAt: '2026-10-26T01:00:00Z' }),
      row('old', { expiresAt: '2026-10-25T00:00:00Z' }),
      row('cancel', { kind: 'sos_cancel', template: 'sos_cancel', personId: null, createdAt: '2026-10-26T01:45:00Z' })
    ], names, NOW)
    expect(items.map((i) => i.id)).toEqual(['ca:cancel', 'ca:b', 'ca:a'])
    expect(items[1]).toMatchObject({ title: 'Mama Rosa is not feeling well', sub: 'Mood · 9:00 AM', href: '#family', tone: 'urgent', kind: 'family' })
    expect(items[2]).toMatchObject({ title: 'A medicine was missed', sub: 'Missed dose · Mama Rosa · 8:00 AM', href: '#health' })
    expect(items[0]!.title).toBe('The SOS was cancelled')
  })
  it('a row with an unknown template still shows, as the neutral line', () => {
    const [i] = familyItems([row('z', { template: 'from_the_future' as never })], names, NOW)
    expect(i!.title).toBe('Bantay')
    expect(i!.href).toBe('#today')
  })
  it('the bell counts unseen unexpired rows only, and the kv list never hides a family row', () => {
    const items = buildInbox({ ...base, now: NOW, familyAlerts: [row('a'), row('b', { seenAt: '2026-10-26T01:50:00Z' }), row('old', { expiresAt: '2026-10-20T00:00:00Z' })], nameOf: names })
    expect(items.map((i) => i.id)).toEqual(['ca:a', 'ca:b'])
    expect(countUnread(items, [])).toBe(1)
    expect(countUnread(items, items.map((i) => i.id))).toBe(1) // only the server row's seen_at clears it
  })
  it('family rows come first, then the older sources', () => {
    const items = buildInbox({ ...base, now: NOW, familyAlerts: [row('a')], nameOf: names, toCheck: 2 })
    expect(items.map((i) => i.kind)).toEqual(['family', 'records'])
  })
  it('shortName keeps a title and a name, otherwise the first word', () => {
    expect(shortName('Ate Joy Santos')).toBe('Ate Joy')
    expect(shortName('Rosa Cruz')).toBe('Rosa')
    expect(shortName('  ')).toBeNull()
    expect(shortName(null)).toBeNull()
  })
  it('the screen shows the top card, an unread dot for an unseen row, and opening a row marks it seen', () => {
    const items = buildInbox({ ...base, now: NOW, familyAlerts: [row('a', { kind: 'sos', template: 'family_sos', personId: null })], nameOf: names })
    const openRow = vi.fn()
    render(<Inbox inbox={{ items, unread: 1, seen: [], markAllRead: vi.fn(), openRow }} now={NOW} />)
    expect(screen.getByText('Family alerts show here when you open Bantay')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Alerts' })).toBeTruthy()
    expect(screen.getAllByRole('img', { name: 'New' })).toHaveLength(1)
    fireEvent.click(screen.getByRole('link', { name: /Someone in your family needs help/ }))
    expect(openRow).toHaveBeenCalledWith('a')
  })
  it('only a missed-dose row gets the Call / Mark taken / Message actions; a seen row has no dot', () => {
    const items = buildInbox({ ...base, now: NOW, familyAlerts: [row('a'), row('b', { kind: 'digest', template: 'digest', seenAt: '2026-10-26T01:50:00Z' })], nameOf: names })
    render(<Inbox inbox={{ items, unread: 1, seen: [], markAllRead: vi.fn() }} now={NOW} />)
    expect(screen.getAllByTestId('actions')).toHaveLength(1)
    expect(screen.getAllByRole('img', { name: 'New' })).toHaveLength(1)
  })
})
