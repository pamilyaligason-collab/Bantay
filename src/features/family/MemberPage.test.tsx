import 'fake-indexeddb/auto'
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./roster', async (orig) => ({
  ...(await orig<typeof import('./roster')>()),
  useFamilyPeople: () => ({ people: [{ id: 'p2', name: 'Lola Sample', isMe: false, phone: '0917 123 4567', birthdate: null, photoPath: null, thumb: null }, { id: 'p3', name: 'VILLAR, Rey', isMe: false, phone: '0917 000 0000', birthdate: null, photoPath: null, thumb: null }], selfId: 'p1' }),
  useCheckIns: () => ({})
}))
const acc = vi.hoisted(() => ({ v: true as boolean | null }))
vi.mock('./reportData', async (orig) => ({ ...(await orig<typeof import('./reportData')>()), useReportAccess: () => acc.v }))
import MemberPage, { todayView, useToday, whenAgo } from './MemberPage'
import { setPersonZones, setSelf } from '../time/zone'
import { ldb } from '../log/store'
import { hdb } from '../records/store'

afterEach(() => { cleanup(); vi.useRealTimers(); setPersonZones({}, null); setSelf(null) })
const now = new Date(2026, 9, 27, 14, 0) // 2:00 PM
const med = (name: string, time: string, id: string) => ({ personId: 'p2', name, medStatus: 'active', schedule: { v: 1, times: [time] }, serverId: id }) as never
const iso = (h: number, m = 0, d = 27) => new Date(2026, 9, d, h, m).toISOString()
// The doses use fixed Manila instants (D-148, ML-38): 2:00 PM Tue 27 Oct Manila, and a Manila clock time on that day. The mood and BP words stay on the phone's own clock.
const nowM = new Date('2026-10-27T06:00:00Z')
const mIso = (h: number, m = 0) => new Date(Date.UTC(2026, 9, 27, h - 8, m)).toISOString()
const none = { meds: [], takes: [], activity: [], readings: [], thresholds: [], personId: 'p2', now }

describe('todayView (hand-computed at 2:00 PM)', () => {
  const meds = [med('Aspirin', '08:00', 'a'), med('Losartan', '13:00', 'l'), med('Metformin', '20:00', 'm'), med('Statin', '07:00', 's')]
  const takes = [{ name: 'Aspirin', takenAt: mIso(8, 10), medicationId: 'a', slot: '08:00' }, { name: 'Statin', takenAt: mIso(7, 5), medicationId: 's', slot: '07:00', skipped: true }]
  it('taken, skipped, due now (within 2 h) and later', () => {
    const v = todayView({ ...none, meds, takes, now: nowM })
    expect(v.doses.map((d) => `${d.name} ${d.time} ${d.word}`)).toEqual(['Statin 7:00 AM Skipped', 'Aspirin 8:00 AM Taken', 'Losartan 1:00 PM Due now', 'Metformin 8:00 PM Later'])
  })
  it('a dose more than 2 h past its time and not taken is Missed', () => {
    expect(todayView({ ...none, now: nowM, meds: [med('Aspirin', '10:00', 'a')] }).doses[0]).toMatchObject({ word: 'Missed', state: 'missed' })
  })
  it('last mood by time, with the word; none when there is none', () => {
    const act = [{ personId: 'p2', kind: 'mood-ok', startedAt: iso(8) }, { personId: 'p2', kind: 'mood-low', startedAt: iso(11, 30) }, { personId: 'p2', kind: 'check-in', startedAt: iso(13) }, { personId: 'p3', kind: 'mood-good', startedAt: iso(13) }]
    expect(todayView({ ...none, activity: act }).mood).toEqual({ word: 'Not good', when: '11:30 AM' })
    expect(todayView(none).mood).toBeNull()
  })
  it('last BP uses the newest pair and the shared band word (150/95 High, 118/76 In range); a lone number is null, never In range', () => {
    const r = (test: string, value: number, h: number) => ({ personId: 'p2', takenAt: iso(h), test, value, unit: 'mmHg' }) as never
    expect(todayView({ ...none, readings: [r('bp_systolic', 118, 7), r('bp_diastolic', 76, 7), r('bp_systolic', 150, 9), r('bp_diastolic', 95, 9)] }).bp).toEqual({ value: '150/95', word: 'High', when: '9:00 AM' })
    expect(todayView({ ...none, readings: [r('bp_systolic', 118, 7), r('bp_diastolic', 76, 7)] }).bp?.word).toBe('In range')
    expect(todayView({ ...none, readings: [r('bp_systolic', 118, 7)] }).bp).toBeNull()
  })
  it('whenAgo says Yesterday for yesterday', () => expect(whenAgo(iso(21, 5, 26), now)).toBe('Yesterday 9:05 PM'))
})

describe('useToday follows the person\'s zone (S30 L9)', () => {
  it('a 7:30 PM dose is Later on the Manila clock (10:00 AM) and Due now once people.tz says Chicago (Mon 8:00 PM)', async () => {
    await ldb.medications.clear()
    await ldb.medications.add({ personId: 'p2', name: 'Evening', medStatus: 'active', schedule: { v: 1, times: ['19:30'] }, serverId: 'ev', clientId: 'c-ev', startedOn: '2026-11-01' } as never)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-01T02:00:00Z')) // Manila Tue 10:00, Chicago Mon 20:00
    setSelf('me')
    const { result } = renderHook(() => useToday('p2'))
    await waitFor(() => expect(result.current.doses.map((d) => d.word)).toEqual(['Later']))
    act(() => setPersonZones({ p2: 'America/Chicago' }, 'me'))
    expect(result.current.doses.map((d) => d.word)).toEqual(['Due now'])
  })
})

describe('MemberPage', () => {
  beforeEach(async () => { acc.v = true; vi.useFakeTimers({ toFake: ['Date'], now: nowM }); await Promise.all([ldb.medications.clear(), ldb.meds.clear(), ldb.activity.clear(), hdb.readings.clear()]) })
  it('shows today doses, last mood, last BP with its word, and Call and Text', async () => {
    const t = new Date().toISOString()
    await ldb.medications.add({ personId: 'p2', name: 'Aspirin', medStatus: 'active', schedule: { v: 1, times: ['00:01'] }, serverId: 'a' } as never)
    await ldb.activity.add({ personId: 'p2', kind: 'mood-good', minutes: null, steps: null, startedAt: t, source: 'manual' })
    await hdb.readings.bulkAdd([{ personId: 'p2', takenAt: t, test: 'bp_systolic', value: 150, unit: 'mmHg' }, { personId: 'p2', takenAt: t, test: 'bp_diastolic', value: 95, unit: 'mmHg' }])
    render(<MemberPage id="p2" />)
    const card = await screen.findByTestId('member-today')
    await waitFor(() => expect(card.textContent).toMatch(/Aspirin.*12:01 AM.*Missed/))
    await waitFor(() => expect(card.textContent).toMatch(/Good,/))
    await waitFor(() => expect(card.textContent).toMatch(/150\/95, High/))
    expect(screen.getByRole('link', { name: 'Call Lola' }).getAttribute('href')).toBe('tel:09171234567')
    expect(screen.getByRole('link', { name: 'Text Lola' }).getAttribute('href')).toBe('sms:09171234567')
  })
  it('without access: asks to share, links to Sharing, and never says no mood or no blood pressure', async () => {
    acc.v = false
    render(<MemberPage id="p2" />)
    const card = await screen.findByTestId('member-today-denied')
    expect(card.textContent).toContain('Ask Lola to share with you')
    expect(card.querySelector('a')?.getAttribute('href')).toBe('#sharing')
    expect(screen.queryByTestId('member-today')).toBeNull()
    expect(document.body.textContent).not.toMatch(/has not said how they feel|No blood pressure saved yet/)
  })
  it('a "SURNAME, Given" name shows the given name on the buttons: Rey, not VILLAR,', async () => {
    render(<MemberPage id="p3" />)
    expect(await screen.findByRole('link', { name: 'Call Rey' })).toBeTruthy()
  })
  it('there is no in-app Message button or chat sheet: the page offers Call, Text and the Messenger name instead', async () => {
    render(<MemberPage id="p2" />)
    await screen.findByRole('link', { name: 'Call Lola' })
    expect(screen.queryByRole('button', { name: /^Message/ })).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByTestId('member-reach')).toBeTruthy()
  })
})
