import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { db } from '../../db'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from '../safety/alerts'
import { buildInbox, countUnread, groupInbox, iconOf, type InboxSources } from './build'
import { Inbox } from './Inbox'

afterEach(cleanup)

const alert = (o: Partial<Alert>): Alert => ({ id: 'a1', kind: 'tcws', level: 'Signal No. 2', title: 'Typhoon signal no. 2', what: '', where: 'Bohol', when: '', doNow: '', source: 'PAGASA', sourceUrl: null, issuedAt: '2026-10-19T03:00:00Z', lat: null, lon: null, bulletin: '', ...o })
const at = (h: number, m = 0) => new Date(2026, 9, 19, h, m)
const base: InboxSources = { now: at(10), alerts: [], profile: [], taken: [], skipped: [], updateVersion: null, pins: [], toCheck: 0 }

describe('buildInbox', () => {
  it('is empty when nothing needs a look', () => {
    expect(buildInbox(base)).toEqual([])
  })
  it('lists warnings first, then medicines, admin work and the update, in that order', () => {
    const items = buildInbox({ ...base, alerts: [alert({})], profile: ['Losartan 9:00'], pins: [{ id: 7, handle: 'lola' }], toCheck: 3, updateVersion: '1.2.0' })
    expect(items.map((i) => i.kind)).toEqual(['alert', 'dose', 'pin', 'records', 'update'])
    expect(items[0]).toMatchObject({ title: 'Typhoon signal no. 2', sub: 'Alert · Bohol', href: '#safety' })
    expect(items[1]).toMatchObject({ title: 'Time for Losartan', href: '#today' })
    expect(items[2]).toMatchObject({ title: 'lola asked for a new PIN', href: '#admin' })
    expect(items[3]!.title).toBe('3 records to check')
  })
  it('a dose past its window and not marked shows as missed; a taken or skipped one does not show', () => {
    const profile = ['Losartan 7:00', 'Metformin 7:30', 'Aspirin 8:00', 'Statin 11:00']
    const taken = [{ name: 'metformin', takenAt: at(7, 40).toISOString() }]
    const items = buildInbox({ ...base, profile, taken, skipped: ['Aspirin'] })
    expect(items.map((i) => i.title)).toEqual(['Losartan was not marked today']) // Statin is not due yet
  })
  it('a two-time medicine gives two distinct ids, each showing its time', () => {
    const items = buildInbox({ ...base, now: at(21), profile: ['Metformin 8:00,20:00'] })
    expect(new Set(items.map((i) => i.id)).size).toBe(2)
    expect(items.map((i) => i.sub)).toEqual(['Medicine · was due 8:00', 'Medicine · 20:00'])
  })
  it('skipping the morning dose does not hide the evening one', () => {
    const items = buildInbox({ ...base, now: at(20, 30), profile: ['Metformin 8:00,20:00'], skipped: ['Metformin@480'] })
    expect(items).toHaveLength(1)
    expect(items[0]!.sub).toContain('20:00')
  })
  it('profile entries with no time are skipped, never guessed', () => {
    expect(buildInbox({ ...base, profile: ['Losartan'] })).toEqual([])
  })
  it('ids change when the thing changes, so a read mark never hides something new', () => {
    const one = buildInbox({ ...base, toCheck: 1 })
    const two = buildInbox({ ...base, toCheck: 2 })
    expect(countUnread(two, one.map((i) => i.id))).toBe(1)
    expect(countUnread(one, one.map((i) => i.id))).toBe(0)
    expect(countUnread(one, undefined)).toBe(1)
  })
})

describe('Inbox screen', () => {
  const inbox = (items: ReturnType<typeof buildInbox>, seen: string[] = []) => ({ items, unread: countUnread(items, seen), seen, markAllRead: vi.fn() })
  it('shows an empty state with no Mark all read button', () => {
    render(<Inbox inbox={inbox([])} />)
    expect(screen.getByText('No alerts yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull()
  })
  it('shows unread dots and Mark all read calls through once', () => {
    const items = buildInbox({ ...base, alerts: [alert({})], toCheck: 2 })
    const i = inbox(items, [items[0]!.id])
    render(<Inbox inbox={i} />)
    expect(screen.getByRole('heading', { name: 'New (1)' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /2 records to check/ }))
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('#family/papers')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(i.markAllRead).toHaveBeenCalledTimes(1)
  })
  it('hides Mark all read once everything is read', () => {
    const items = buildInbox({ ...base, toCheck: 1 })
    render(<Inbox inbox={inbox(items, items.map((x) => x.id))} />)
    expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^New/ })).toBeNull()
  })
})

describe('Inbox screen with 53 unread (A1)', () => {
  it('groups them under New (53) as 53 rows with no inline action; a tap opens a dialog with 3 actions', () => {
    const items = Array.from({ length: 53 }, (_, n) => ({ id: `n${n}`, kind: 'alert' as const, title: `Storm ${n}`, sub: 'Alert · Bohol', href: '#safety', at: at(9).getTime() })) // buildInbox keeps 5 weather alerts, so build the rows directly
    const { container } = render(<Inbox inbox={{ items, unread: 53, seen: [], markAllRead: vi.fn(), markOne: vi.fn() }} now={at(10)} />)
    expect(screen.getByRole('heading', { name: 'New (53)' })).toBeTruthy()
    expect(container.querySelectorAll('[data-testid="inbox-row"]')).toHaveLength(53)
    expect(container.querySelectorAll('.in-act')).toHaveLength(0)
    fireEvent.click(screen.getAllByRole('button', { name: /Storm 3/ })[0]!)
    const dlg = screen.getByRole('dialog')
    expect(dlg.querySelectorAll('.in-act')).toHaveLength(3)
  })
})

describe('Inbox intro card and times (A1)', () => {
  const props = () => ({ items: buildInbox({ ...base, toCheck: 1 }), unread: 1, seen: [], markAllRead: vi.fn() })
  it('shows the full card on the first visit and the one line after the screen has been left with a list on it', async () => {
    await db.kv.delete('notif.intro')
    const first = render(<Inbox inbox={props()} now={at(10)} />)
    await waitFor(() => expect(screen.getByText(/appear in this list/)).toBeTruthy())
    first.unmount()
    await waitFor(async () => expect((await db.kv.get('notif.intro'))?.value).toBe(true))
    render(<Inbox inbox={props()} now={at(10)} />)
    await waitFor(() => expect(document.querySelector('.in-info1')).not.toBeNull())
    expect(screen.queryByText(/appear in this list/)).toBeNull()
  })
  it('an unread alert from an earlier Manila day shows a date, one from today shows a time', () => {
    const now = new Date('2026-10-19T02:00:00Z') // 10:00 in Manila
    const items = [{ id: 'a', kind: 'alert' as const, title: 'Today one', sub: 's', href: '#safety', at: Date.parse('2026-10-19T01:00:00Z') }, { id: 'b', kind: 'alert' as const, title: 'Old one', sub: 's', href: '#safety', at: Date.parse('2026-10-17T01:00:00Z') }]
    const { container } = render(<Inbox inbox={{ items, unread: 2, seen: [], markAllRead: vi.fn() }} now={now} />)
    const vals = Array.from(container.querySelectorAll('.rw-value')).map((e) => e.textContent)
    expect(vals).toEqual(['9:00 AM', 'Oct 17'])
  })
})

describe('buildInbox from medications', () => {
  const mt = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 19, h - 8, m)) // Manila clock, whatever zone the runner is in (ML-38)
  const med = { personId: 'me', name: 'Drug A', serverId: 'srv-a', medStatus: 'active' as const, schedule: { v: 1, times: ['07:00', '20:00'] } }
  const src = (o: Partial<InboxSources>): InboxSources => ({ ...base, medications: [med], personId: 'me', ...o })
  it('lists a past-due slot, missed once the window passed, and not slots later today', () => {
    const items = buildInbox(src({ now: mt(10) }))
    expect(items.map((i) => i.title)).toEqual(['Drug A was not marked today'])
  })
  it('a take by medication id and slot clears it, a synced skip clears it, a take for another medication does not', () => {
    const t = mt(7, 20).toISOString()
    expect(buildInbox(src({ now: mt(10), taken: [{ name: 'x', takenAt: t, medicationId: 'srv-a', slot: '07:00' }] }))).toEqual([])
    expect(buildInbox(src({ now: mt(10), taken: [{ name: 'Drug A', takenAt: t, medicationId: 'srv-a', slot: '07:00', skipped: true }] }))).toEqual([])
    expect(buildInbox(src({ now: mt(10), taken: [{ name: 'Drug A', takenAt: t, medicationId: 'other', slot: '07:00' }] }))).toHaveLength(1)
  })
  it('paused and as-needed medicines never show, and the old profile text is ignored once medications are given', () => {
    const items = buildInbox(src({ now: mt(21), profile: ['Old 7:00'], medications: [{ ...med, medStatus: 'paused' }, { ...med, name: 'Prn', asNeeded: true }] }))
    expect(items).toEqual([])
  })
  describe('the dose day is the Manila day, on a phone in another timezone (ML-38)', () => {
    // Instants are fixed Manila times; run the file with TZ=America/Los_Angeles and TZ=UTC to prove it on a phone elsewhere (the gate does).
    const late = { ...med, schedule: { v: 1, times: ['23:00'] } }
    const early = { ...med, schedule: { v: 1, times: ['00:15'] } }
    it('23:30 Manila: the 23:00 dose is due and a take at 22:55 Manila clears it, on any phone timezone', () => {
      expect(buildInbox(src({ now: mt(23, 30), medications: [late] })).map((i) => i.title)).toEqual(['Time for Drug A'])
      expect(buildInbox(src({ now: mt(23, 30), medications: [late], taken: [{ name: 'Drug A', takenAt: mt(22, 55).toISOString(), medicationId: 'srv-a', slot: '23:00' }] }))).toEqual([])
    })
    it('00:30 Manila: it is the new Manila day, so yesterday 23:xx takes do not count and the 00:15 dose is missed-pending', () => {
      {
        const yesterday = { name: 'Drug A', takenAt: mt(23, 0).toISOString(), medicationId: 'srv-a', slot: '00:15' } // 23:00 Manila the day before
        expect(buildInbox(src({ now: mt(24, 30), medications: [early], taken: [yesterday] })).map((i) => i.title)).toEqual(['Time for Drug A'])
        expect(buildInbox(src({ now: mt(24, 30), medications: [early], taken: [{ ...yesterday, takenAt: mt(24, 20).toISOString() }] }))).toEqual([])
      }
    })
    it('the item id carries the Manila day, so the same missed dose keeps one id across the phone midnight', () => {
      const id = (n: Date) => buildInbox(src({ now: n, medications: [late] }))[0]?.id
      expect(id(mt(23, 30))).toBe('dose:2026-10-19:Drug A:1380:due')
    })
  })
})

describe('grouping and icons (M7b)', () => {
  const inbox = (items: ReturnType<typeof buildInbox>, seen: string[] = []) => ({ items, unread: countUnread(items, seen), seen, markAllRead: vi.fn() })
  it('splits Today and Earlier by the alert issue time; things with no time are Today', () => {
    const items = buildInbox({ ...base, alerts: [alert({ id: 'old', issuedAt: new Date(2026, 9, 17, 9).toISOString() }), alert({ id: 'new', title: 'Heat today', kind: 'heat', issuedAt: new Date(2026, 9, 19, 6).toISOString() })], toCheck: 1 })
    const g = groupInbox(items, at(10))
    expect(g.today.map((i) => i.kind + ':' + i.title)).toEqual(['alert:Heat today', 'records:1 record to check'])
    expect(g.earlier.map((i) => i.title)).toEqual(['Typhoon signal no. 2'])
  })
  it('picks an icon per type: dose, weather, family, record', () => {
    const items = buildInbox({ ...base, alerts: [alert({ kind: 'quake' }), alert({ id: 'w', kind: 'heat', issuedAt: '2026-10-19T04:00:00Z' })], profile: ['Losartan 9:00'], pins: [{ id: 1, handle: 'lola' }], toCheck: 1, updateVersion: '1.2.0' })
    expect(items.map(iconOf)).toEqual(['weather', 'alert', 'dose', 'family', 'record', 'update'])
  })
  it('renders the Today and Earlier headings with an icon type per row and unread dots', () => {
    const items = buildInbox({ ...base, alerts: [alert({ issuedAt: new Date(2026, 9, 17, 9).toISOString() })], toCheck: 2 })
    const { container } = render(<Inbox inbox={inbox(items, [items[0]!.id])} now={at(10)} />)
    expect(screen.getByRole('heading', { name: 'New (1)' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Earlier' })).toBeTruthy()
    expect(screen.getByTestId('inbox-new').textContent).toContain('2 records to check')
    expect(screen.getByTestId('inbox-earlier').textContent).toContain('Typhoon signal no. 2')
    expect(container.querySelectorAll('[data-testid="inbox-row"]')).toHaveLength(2)
  })
  it('shows no Earlier heading when nothing is older', () => {
    render(<Inbox inbox={inbox(buildInbox({ ...base, toCheck: 1 }))} now={at(10)} />)
    expect(screen.queryByRole('heading', { name: 'Earlier' })).toBeNull()
  })
})
