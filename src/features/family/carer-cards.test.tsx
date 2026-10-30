import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { ldb, type Medication } from '../log/store'
import type { AlertRow } from '../notify/store'

// S4: the red SOS banner, the carer cards on Family, Answer for Papa, and Family > Phones. Synthetic names and ids only.
const h = vi.hoisted(() => ({
  rows: [] as unknown[],
  markSeen: vi.fn((_id: string) => Promise.resolve()),
  call911: vi.fn(),
  writable: ['p2'] as string[],
  event: null as null | Record<string, unknown>,
  eventReads: 0,
  tables: {} as Record<string, { data: unknown[]; error?: unknown }>
}))
vi.mock('../notify/useAlerts', () => ({ useAlertRows: () => h.rows }))
vi.mock('../notify/store', () => ({ markSeen: (id: string) => h.markSeen(id) }))
vi.mock('../sos/call', () => ({ callFirstContact: (...a: unknown[]) => h.call911(...a) }))
vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../health/useCanMark', () => ({ useWritableIds: () => h.writable }))
vi.mock('./roster', async (orig) => ({
  ...(await orig<typeof import('./roster')>()),
  useFamilyPeople: () => ({
    selfId: 'p1',
    people: [
      { id: 'p1', name: 'Lloyd Roc', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: true },
      { id: 'p2', name: 'Papa', photoPath: null, thumb: null, phone: '+639171234567', birthdate: null, isMe: false },
      { id: 'p3', name: 'Mama', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: false }
    ]
  })
}))
vi.mock('../auth/client', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from: (t: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => Promise.resolve(h.tables[t] ?? { data: [], error: null }),
        maybeSingle: () => { if (t === 'sos_events') h.eventReads++; return Promise.resolve({ data: h.event, error: null }) }
      }
      return q
    }
  }
}))

import { CarerCards, reviewAsks, slotAgo } from './CarerCards'
import FamilyPhones, { phoneStatus, type PhoneHealthRow } from './FamilyPhones'
import { IncomingSos, pickSos } from './IncomingSos'

const row = (id: string, o: Partial<AlertRow>): AlertRow => ({ id, personId: 'p3', kind: 'sos', template: 'family_sos', ref: 'e1', createdAt: '2026-10-26T00:47:00Z', pushedAt: null, seenAt: null, expiresAt: '2026-11-02T00:00:00Z', ...o })
const NOW = new Date('2026-10-26T10:10:00+08:00')

beforeEach(async () => {
  h.rows = []; h.event = null; h.eventReads = 0; h.tables = {}; h.writable = ['p2']
  h.markSeen.mockClear(); h.call911.mockClear()
  await Promise.all([db.outbox.clear(), db.kv.clear(), ldb.medications.clear(), ldb.meds.clear()])
})
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('pickSos', () => {
  it('only an unseen family_sos; a late row, a seen row and a cancelled event never make the banner', () => {
    expect(pickSos([row('a', {})])?.id).toBe('a')
    expect(pickSos([row('a', { template: 'sos_late' })])).toBeNull()
    expect(pickSos([row('a', { seenAt: '2026-10-26T00:50:00Z' })])).toBeNull()
    expect(pickSos([row('c', { kind: 'sos_cancel', template: 'sos_cancel', ref: 'e1:cancel' }), row('a', {})])).toBeNull()
    expect(pickSos([row('c', { kind: 'sos_cancel', template: 'sos_cancel', ref: 'e2:cancel' }), row('a', {})])?.id).toBe('a') // another event's cancel
    expect(pickSos([row('x', { kind: 'dose_missed', template: 'dose_missed' })])).toBeNull()
    expect(pickSos([])).toBeNull()
  })
  it('the newest of two open SOS is the banner', () => {
    expect(pickSos([row('new', { ref: 'e2' }), row('old', { ref: 'e1' })])?.id).toBe('new')
  })
})

describe('IncomingSos (lock-sos)', () => {
  it('shows nothing without a family SOS row', () => {
    const { container } = render(<IncomingSos placement="today" />)
    expect(container.firstChild).toBeNull()
  })
  it('red banner: who and when, Call, Open map with the saved place, Call 911; Mark handled marks the row seen', async () => {
    h.rows = [row('r1', {})]
    h.event = { id: 'e1', person_id: 'p3', at: '2026-10-26T00:47:00Z', lat: 6.1164, lon: 125.1716, gps: true, cancelled_at: null }
    render(<IncomingSos placement="family" />)
    const banner = await screen.findByRole('alert', { name: 'Mama needs help' })
    expect(banner.getAttribute('data-placement')).toBe('family')
    expect(within(banner).getByText('Mama needs help · 8:47 AM')).toBeTruthy()
    await waitFor(() => expect(within(banner).getByRole('link', { name: 'Open map' }).getAttribute('href')).toBe('https://maps.google.com/?q=6.1164,125.1716'))
    expect(within(banner).queryByRole('link', { name: /^Call Mama/ })).toBeNull() // Mama has no number saved: no blank tel: link
    fireEvent.click(within(banner).getByRole('button', { name: 'Call 911' }))
    expect(h.call911).toHaveBeenCalledWith([], { emergency: true })
    expect(within(banner).queryByRole('button', { name: /on my way/i })).toBeNull()
    fireEvent.click(within(banner).getByRole('button', { name: 'Mark handled' }))
    expect(h.markSeen).toHaveBeenCalledWith('r1')
  })
  it('calls the person with the saved number', async () => {
    h.rows = [row('r1', { personId: 'p2' })]
    render(<IncomingSos placement="today" />)
    expect((await screen.findByRole('link', { name: 'Call Papa' })).getAttribute('href')).toBe('tel:+639171234567')
  })
  it('no place came with it: no Open map button, no 0,0 (ML-05)', async () => {
    h.rows = [row('r1', {})]
    h.event = { id: 'e1', person_id: 'p3', at: '2026-10-26T00:47:00Z', lat: null, lon: null, gps: false, cancelled_at: null }
    render(<IncomingSos placement="today" />)
    await screen.findByRole('alert')
    await waitFor(() => expect(h.eventReads).toBe(1))
    expect(screen.queryByRole('link', { name: 'Open map' })).toBeNull()
    expect(screen.getByText(/No location came with it/)).toBeTruthy()
  })
  it('a cancelled event hides the banner', async () => {
    h.rows = [row('r1', {})]
    h.event = { id: 'e1', person_id: 'p3', at: '2026-10-26T00:47:00Z', lat: 6.1, lon: 125.1, gps: true, cancelled_at: '2026-10-26T00:50:00Z' }
    const { container } = render(<IncomingSos placement="today" />)
    await waitFor(() => expect(container.firstChild).toBeNull())
  })
  it('opening it writes one sos_acks row for the event, and a second open writes no more', async () => {
    h.rows = [row('r1', {})]
    const a = render(<IncomingSos placement="today" />)
    // settled = the outbox row AND the remembered id are both written (ack() does them in two steps); the 1 s default is too short when the whole suite runs at once
    await waitFor(async () => {
      expect((await db.outbox.toArray()).filter((o) => o.table === 'sos_acks')).toHaveLength(1)
      expect((await db.kv.get('sos.acked'))?.value).toEqual(['e1'])
    }, { timeout: 8000 })
    const sent = (await db.outbox.toArray()).find((o) => o.table === 'sos_acks')!
    expect(sent.op).toBe('insert')
    expect(sent.payload).toMatchObject({ eventId: 'e1' })
    a.unmount()
    render(<IncomingSos placement="family" />)
    await screen.findByRole('alert')
    expect((await db.outbox.toArray()).filter((o) => o.table === 'sos_acks')).toHaveLength(1)
  })
  it('D-78 copy: never promises a notification or a lock screen', async () => {
    h.rows = [row('r1', {})]
    render(<IncomingSos placement="today" />)
    const banner = await screen.findByRole('alert')
    expect(banner.textContent).not.toMatch(/will be (told|notified)|lock screen|notification/i)
  })
})

const REVIEW: Medication = { personId: 'p2', name: 'Metformin', strength: '500 mg', serverId: 'm9', clientId: 'c9', medStatus: 'active', asNeeded: false, schedule: { v: 1, times: ['13:00'], review: true, review_since: '2026-10-24' } }

describe('reviewAsks and slotAgo', () => {
  const people = [{ id: 'p2', name: 'Papa' }] as never
  it('a review open for a day or more is an ask, oldest first; asked today, answered, stopped and strangers are not', () => {
    const at = (name: string, since: string, extra: Partial<Medication> = {}): Medication => ({ ...REVIEW, name, serverId: name, schedule: { v: 1, times: ['08:00'], review: true, review_since: since }, ...extra })
    const got = reviewAsks([at('New', '2026-10-25'), at('Old', '2026-10-20'), at('Today', '2026-10-26'), at('Done', '2026-10-20', { schedule: { v: 1, times: ['08:00'] } }), at('Gone', '2026-10-20', { medStatus: 'stopped' }), at('Other', '2026-10-20', { personId: 'zz' })], people, NOW)
    expect(got.map((a) => [a.med.name, a.days])).toEqual([['Old', 6], ['New', 1]])
  })
  it('slotAgo reads like the mockup, and is blank for the future or missing parts', () => {
    expect(slotAgo('2026-10-26', '09:00', NOW)).toBe('1 h 10 min ago')
    expect(slotAgo('2026-10-26', '10:00', NOW)).toBe('10 min ago')
    expect(slotAgo('2026-10-26', '08:10', NOW)).toBe('2 h ago')
    expect(slotAgo('2026-10-26', '11:00', NOW)).toBe('')
    expect(slotAgo(null, '09:00', NOW)).toBe('')
    expect(slotAgo('2026-10-26', null, NOW)).toBe('')
  })
})

describe('CarerCards (family-home) and Answer for Papa (family-answer)', () => {
  it('nothing for someone who looks after nobody', async () => {
    h.writable = []
    const { container } = render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    await new Promise((r) => setTimeout(r, 30))
    expect(container.firstChild).toBeNull()
  })
  it('a writer carer sees the unanswered question; the sheet saves the answer as answered by the carer, the medicine stays and keeps its reminders', async () => {
    await ldb.medications.add({ ...REVIEW, schedule: { v: 1, times: ['13:00'], review: true, review_since: '2026-10-20' } })
    const onNote = vi.fn()
    render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={onNote} />)
    expect(await screen.findByText('Papa has not answered')).toBeTruthy()
    expect(screen.getByText(/"Still taking Metformin\?" asked \d+ days ago/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Answer for Papa' }))
    const sheet = await screen.findByRole('dialog', { name: 'Answer for Papa' })
    expect(within(sheet).getByText('Still taking Metformin 500 mg?')).toBeTruthy()
    fireEvent.click(within(sheet).getByRole('button', { name: 'Send answer' })) // Yes, still taking it is the default
    await waitFor(async () => expect(((await ldb.medications.toArray())[0]!.schedule as Record<string, unknown>).review).toBeUndefined())
    const saved = (await ldb.medications.toArray())[0]!
    expect(saved).toMatchObject({ name: 'Metformin' })
    expect(saved.medStatus ?? 'active').toBe('active')
    expect(saved.schedule).toMatchObject({ times: ['13:00'], answered_by: 'Lloyd' })
    expect(onNote).toHaveBeenCalledWith('Metformin checked. Saved as answered by Lloyd.')
    const sent = (await db.outbox.toArray()).filter((o) => o.table === 'medications')
    expect(sent).toHaveLength(1)
  })
  it('"stopped" moves it to Past and records who said so; "Ask the doctor" closes it and adds a visit question', async () => {
    await ldb.medications.add({ ...REVIEW, schedule: { v: 1, times: ['13:00'], review: true, review_since: '2026-10-20' } })
    render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Answer for Papa' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('radio', { name: /Ask the doctor/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    await waitFor(async () => expect((await db.kv.get('visits.questions.p2'))?.value).toEqual(['Is Metformin still needed?']))
    expect((await ldb.medications.toArray())[0]!.medStatus ?? 'active').toBe('active')
    cleanup()
    await ldb.medications.clear()
    await ldb.medications.add({ ...REVIEW, schedule: { v: 1, times: ['13:00'], review: true, review_since: '2026-10-20' } })
    render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Answer for Papa' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('radio', { name: /Papa stopped it/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Send answer' }))
    await waitFor(async () => expect((await ldb.medications.toArray())[0]!.medStatus).toBe('stopped'))
    expect((await ldb.medications.toArray())[0]!.schedule).toMatchObject({ answered_by: 'Lloyd' })
  })
  it('a medicine asked today is not an ask yet, and a person this user cannot write for is not offered', async () => {
    const today = new Date().toLocaleDateString('en-CA')
    await ldb.medications.add({ ...REVIEW, schedule: { v: 1, times: ['13:00'], review: true, review_since: today } })
    await ldb.medications.add({ ...REVIEW, personId: 'p3', name: 'Losartan', serverId: 'm8', clientId: 'c8', schedule: { v: 1, times: ['13:00'], review: true, review_since: '2026-10-01' } })
    const { container } = render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    await act(async () => { await Promise.resolve() }) // the count is read from the rows on the first render; one flush settles the hooks
    expect(container.firstChild).toBeNull()
  })
  it('a phone row opens Phones and marks the row seen; a not-feeling-well row offers Call and Message', async () => {
    h.rows = [row('ph', { personId: 'p2', kind: 'phone_health', template: 'phone_health', ref: 'u2:2026-10-26' }), row('mo', { personId: 'p2', kind: 'mood_unwell', template: 'mood_unwell', ref: 'p2:2026-10-26' })]
    const onPhones = vi.fn()
    const onMessage = vi.fn()
    render(<CarerCards onMessage={onMessage} onPhones={onPhones} onNote={vi.fn()} />)
    expect(await screen.findByText("Papa's phone may miss alarms")).toBeTruthy()
    expect(screen.getByText('Papa is not feeling well')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Call Papa' }).getAttribute('href')).toBe('tel:+639171234567')
    fireEvent.click(screen.getByRole('button', { name: "Fix Papa's phone" }))
    expect(onPhones).toHaveBeenCalled()
    expect(h.markSeen).toHaveBeenCalledWith('ph')
    fireEvent.click(screen.getByRole('button', { name: 'Message' }))
    expect(onMessage).toHaveBeenCalledWith('p2')
    expect(h.markSeen).toHaveBeenCalledWith('mo')
    expect(screen.queryByText(/Family alerts show here/)).toBeNull() // S5: filler gone
  })
  it('S8: six missed doses for one person are ONE card with six lines, and the count is the six lines', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const slots = ['04:00', '05:00', '06:00', '07:00', '08:00', '09:00']
    await ldb.medications.add({ personId: 'p2', name: 'Losartan', strength: '50 mg', serverId: 'm1', clientId: 'c1', medStatus: 'active', schedule: { v: 1, times: slots } })
    h.rows = slots.map((s) => row(`md${s}`, { personId: 'p2', kind: 'dose_missed', template: 'dose_missed', ref: `p2:2026-10-26:${s}` }))
    const { container } = render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    expect(await screen.findByText('Papa missed 6 doses')).toBeTruthy()
    expect(container.querySelectorAll('[data-kind="dose_missed"]')).toHaveLength(1) // one card per person
    expect(container.querySelectorAll('[data-kind="dose_missed"] .fm-need-lines li')).toHaveLength(6) // six lines
    expect(screen.getByText('6 things')).toBeTruthy() // badge = rows
    expect(screen.getAllByRole('link', { name: 'Call Papa' })).toHaveLength(1)
  })
  it('J r2: with several missed doses each line has its own Mark taken, and one tap records exactly one slot (ML-13)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    const slots = ['07:00', '08:00', '09:00']
    await ldb.medications.add({ personId: 'p2', name: 'Losartan', strength: '50 mg', serverId: 'm1', clientId: 'c1', medStatus: 'active', schedule: { v: 1, times: slots } })
    h.rows = slots.map((s) => row(`md${s}`, { personId: 'p2', kind: 'dose_missed', template: 'dose_missed', ref: `p2:2026-10-26:${s}` }))
    render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    expect(await screen.findByText('Papa missed 3 doses')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mark taken for Papa' })).toBeNull() // no all-in-one button
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Mark taken: / })).toHaveLength(3)) // the lines appear after the async medicine lookup
    const btns = screen.getAllByRole('button', { name: /^Mark taken: / })
    fireEvent.click(btns[1]!) // 08:00
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Yes, I saw' }))
    await waitFor(async () => expect((await ldb.meds.toArray()).map((m) => m.slot)).toEqual(['08:00']))
  })
  it('S8: three unanswered "Still taking it?" for one person are one card with three Answer buttons; two people are two cards', async () => {
    const old = { v: 1, times: ['13:00'], review: true, review_since: '2026-10-20' }
    h.writable = ['p2', 'p3']
    await ldb.medications.bulkAdd([
      { ...REVIEW, schedule: old },
      { ...REVIEW, name: 'Losartan', serverId: 'm2', clientId: 'c2', schedule: old },
      { ...REVIEW, name: 'Amlodipine', serverId: 'm3', clientId: 'c3', schedule: old },
      { ...REVIEW, personId: 'p3', name: 'Aspirin', serverId: 'm4', clientId: 'c4', schedule: old }
    ])
    const { container } = render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    expect(await screen.findByText('Papa has 3 questions waiting')).toBeTruthy()
    expect(container.querySelectorAll('[data-kind="review_open"]')).toHaveLength(2) // Papa and Mama
    expect(screen.getByText('4 things')).toBeTruthy() // 3 + 1 rows
    expect(screen.getAllByRole('button', { name: /^Answer for Papa: / })).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Answer for Mama' })).toBeTruthy() // a single ask keeps the plain button
  })
  it('a missed dose today: what, when, Call and Mark taken for her; it closes by itself once the dose is marked', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    await ldb.medications.add({ personId: 'p2', name: 'Losartan', strength: '50 mg', serverId: 'm1', clientId: 'c1', medStatus: 'active', schedule: { v: 1, times: ['09:00'] } })
    h.rows = [row('md', { personId: 'p2', kind: 'dose_missed', template: 'dose_missed', ref: 'p2:2026-10-26:09:00' })]
    render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    expect(await screen.findByText('Papa missed a medicine')).toBeTruthy()
    expect(await screen.findByText('Losartan was due 9:00 AM, 1 h 10 min ago')).toBeTruthy() // the medicine name loads after the card
    expect(screen.getByRole('link', { name: 'Call Papa' }).getAttribute('href')).toBe('tel:+639171234567')
    expect(screen.getByRole('button', { name: 'Mark taken for Papa' })).toBeTruthy()
    await ldb.meds.add({ personId: 'p2', name: 'Losartan', takenAt: new Date('2026-10-26T09:40:00+08:00').toISOString(), medicationId: 'm1', slot: '09:00' })
    await waitFor(() => expect(screen.queryByText('Papa missed a medicine')).toBeNull())
    await waitFor(() => expect(h.markSeen).toHaveBeenCalledWith('md'))
  })
  it('a missed dose from an earlier day is left to the alert list', async () => {
    h.rows = [row('md', { personId: 'p2', kind: 'dose_missed', template: 'dose_missed', ref: 'p2:2026-10-20:09:00' })]
    const { container } = render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    await act(async () => { await Promise.resolve() }) // the count is read from the rows on the first render; one flush settles the hooks
    expect(container.querySelector('[data-kind="dose_missed"]')).toBeNull()
    expect(screen.queryByText('Needs you now')).toBeNull() // no card, so no header and no count
  })
  it('the Needs you now count is the cards that show: a yesterday row alone makes no header; with one today row the count is 1', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    await ldb.medications.add({ personId: 'p2', name: 'Losartan', strength: '50 mg', serverId: 'm1', clientId: 'c1', medStatus: 'active', schedule: { v: 1, times: ['09:00'] } })
    h.rows = [row('old', { personId: 'p2', kind: 'dose_missed', template: 'dose_missed', ref: 'p2:2026-10-25:09:00' })]
    const first = render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    await act(async () => { await Promise.resolve() }) // the count is read from the rows on the first render; one flush settles the hooks
    expect(screen.queryByText('Needs you now')).toBeNull()
    first.unmount()
    h.rows = [row('old', { personId: 'p2', kind: 'dose_missed', template: 'dose_missed', ref: 'p2:2026-10-25:09:00' }), row('md', { personId: 'p2', kind: 'dose_missed', template: 'dose_missed', ref: 'p2:2026-10-26:09:00' })]
    render(<CarerCards onMessage={vi.fn()} onPhones={vi.fn()} onNote={vi.fn()} />)
    expect(await screen.findByText('Papa missed a medicine')).toBeTruthy()
    expect(screen.getByText('1 thing')).toBeTruthy()
  })
})

describe('FamilyPhones (family-phones)', () => {
  const ph = (o: Partial<PhoneHealthRow>): PhoneHealthRow => ({ user_id: 'u2', platform: 'android', alarms_ok: true, notif_ok: true, exact_ok: true, battery_ok: true, call_ok: true, last_open_at: '2026-10-26T01:55:00Z', alarms_checked_at: null, ...o })
  it('phoneStatus: working, each way to fail, not opened lately, and unknown is never a good answer', () => {
    expect(phoneStatus(ph({}), NOW)).toEqual({ state: 'ok', text: 'Alarms ring on time' })
    expect(phoneStatus(ph({ alarms_ok: false, battery_ok: false }), NOW)).toEqual({ state: 'fix', text: 'Battery saver is stopping alarms' })
    expect(phoneStatus(ph({ alarms_ok: false, exact_ok: false }), NOW)).toEqual({ state: 'fix', text: 'Exact alarms are off' })
    expect(phoneStatus(ph({ alarms_ok: false, notif_ok: false }), NOW)).toEqual({ state: 'fix', text: 'Notifications are off' })
    expect(phoneStatus(ph({ alarms_ok: false }), NOW)).toEqual({ state: 'fix', text: 'Alarms may not ring on time' })
    expect(phoneStatus(ph({ call_ok: false }), NOW)).toEqual({ state: 'fix', text: 'Hold for help cannot place a call' })
    expect(phoneStatus(ph({ platform: 'web', alarms_ok: null, last_open_at: '2026-10-17T01:00:00Z' }), NOW)).toEqual({ state: 'stale', text: 'Browser app · not opened for 9 days' })
    expect(phoneStatus(ph({ alarms_ok: null }), NOW)).toEqual({ state: 'unknown', text: 'Not checked yet' })
    expect(phoneStatus(ph({ platform: 'web', alarms_ok: null }), NOW).state).toBe('unknown')
    expect(phoneStatus(null, NOW)).toEqual({ state: 'unknown', text: 'No phone check yet' })
  })
  it('lists the people looked after: Needs fixing opens the fix card; a phone not opened for days offers a reminder', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    h.writable = ['p2', 'p3']
    h.tables = {
      people: { data: [{ id: 'p2', auth_user_id: 'u2' }, { id: 'p3', auth_user_id: 'u3' }] },
      phone_health: { data: [ph({ alarms_ok: false, battery_ok: false }), ph({ user_id: 'u3', platform: 'web', alarms_ok: null, last_open_at: '2026-10-17T01:00:00Z' })] }
    }
    const onMessage = vi.fn()
    render(<FamilyPhones people={[{ id: 'p2', name: 'Papa', photoPath: null, thumb: null, phone: '+639171234567', birthdate: null, isMe: false }, { id: 'p3', name: 'Mama', photoPath: null, thumb: null, phone: null, birthdate: null, isMe: false }]} onBack={vi.fn()} onMessage={onMessage} />)
    expect(await screen.findByText('Battery saver is stopping alarms')).toBeTruthy()
    expect(screen.getByText('Browser app · not opened for 9 days')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remind Mama' }))
    expect(onMessage).toHaveBeenCalledWith('p3')
    fireEvent.click(screen.getByRole('button', { name: 'Needs fixing' }))
    const fix = screen.getByLabelText("Fix Papa's phone")
    expect(within(fix).getByText(/open Bantay, then Me, then Phone check/)).toBeTruthy()
    expect(fix.textContent).not.toMatch(/will be (told|notified)|lock screen/i)
    expect(within(fix).getByRole('link', { name: 'Call Papa' }).getAttribute('href')).toBe('tel:+639171234567')
  })
})
