import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Alert } from '../safety/alerts'
import { buildInbox, countUnread, type InboxSources } from './build'
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
    expect(screen.getByText('No notifications yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull()
  })
  it('shows unread dots and Mark all read calls through once', () => {
    const items = buildInbox({ ...base, alerts: [alert({})], toCheck: 2 })
    const i = inbox(items, [items[0]!.id])
    render(<Inbox inbox={i} />)
    expect(screen.getAllByRole('img', { name: 'New' })).toHaveLength(1)
    expect(screen.getByRole('link', { name: /2 records to check/ }).getAttribute('href')).toBe('#records')
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }))
    expect(i.markAllRead).toHaveBeenCalledTimes(1)
  })
  it('hides Mark all read once everything is read', () => {
    const items = buildInbox({ ...base, toCheck: 1 })
    render(<Inbox inbox={inbox(items, items.map((x) => x.id))} />)
    expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull()
    expect(screen.queryByRole('img', { name: 'New' })).toBeNull()
  })
})

describe('buildInbox from medications', () => {
  const med = { personId: 'me', name: 'Drug A', serverId: 'srv-a', medStatus: 'active' as const, schedule: { v: 1, times: ['07:00', '20:00'] } }
  const src = (o: Partial<InboxSources>): InboxSources => ({ ...base, medications: [med], personId: 'me', ...o })
  it('lists a past-due slot, missed once the window passed, and not slots later today', () => {
    const items = buildInbox(src({ now: at(10) }))
    expect(items.map((i) => i.title)).toEqual(['Drug A was not marked today'])
  })
  it('a take by medication id and slot clears it, a synced skip clears it, a take for another medication does not', () => {
    const t = at(7, 20).toISOString()
    expect(buildInbox(src({ now: at(10), taken: [{ name: 'x', takenAt: t, medicationId: 'srv-a', slot: '07:00' }] }))).toEqual([])
    expect(buildInbox(src({ now: at(10), taken: [{ name: 'Drug A', takenAt: t, medicationId: 'srv-a', slot: '07:00', skipped: true }] }))).toEqual([])
    expect(buildInbox(src({ now: at(10), taken: [{ name: 'Drug A', takenAt: t, medicationId: 'other', slot: '07:00' }] }))).toHaveLength(1)
  })
  it('paused and as-needed medicines never show, and the old profile text is ignored once medications are given', () => {
    const items = buildInbox(src({ now: at(21), profile: ['Old 7:00'], medications: [{ ...med, medStatus: 'paused' }, { ...med, name: 'Prn', asNeeded: true }] }))
    expect(items).toEqual([])
  })
})
