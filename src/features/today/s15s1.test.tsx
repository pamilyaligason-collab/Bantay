import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ native: false, writers: [] as { carer_id: string }[], rpc: vi.fn() }))
vi.mock('@capacitor/core', async (orig) => ({ ...(await orig<typeof import('@capacitor/core')>()), Capacitor: { isNativePlatform: () => h.native, getPlatform: () => (h.native ? 'android' : 'web') } }))
vi.mock('../auth/client', () => ({ supabase: { rpc: (...a: unknown[]) => h.rpc(...a), from: () => { const q = { eq: () => q, then: (ok: (r: unknown) => unknown) => Promise.resolve({ data: h.writers, error: null }).then(ok) }; return { select: () => q } } } }))
vi.mock('../auth/session', () => ({ getMember: async () => ({ userId: 'owner-user', personId: 'p1', role: 'member', handle: null }) }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: async () => 'p1' }))
vi.mock('../admin/events', () => ({ track: async () => undefined }))
vi.mock('../health/reminderActions', () => ({ handleReminderAction: async () => 'snoozed' }))
vi.mock('./useDueMeds', () => ({ markDue: async () => true, markTaken: async () => 1 }))
import CrisisCard from '../health/bpcheck/CrisisCard'
import { db } from '../../db'
import { KEY_ALARM_HEALTH } from '../phonecheck/keys'
import { logFeeling, moodLine } from './actions'
import NextUp from './NextUp'
import { pickNext, type DuePerson } from './nextPick'

beforeEach(() => { h.native = false; h.writers = []; h.rpc.mockReset(); localStorage.clear() })
afterEach(cleanup)

describe('DS-1: the family line follows a real writer carer', () => {
  it('a writer carer who is not the person: the card says the family will see it', async () => {
    h.writers = [{ carer_id: 'daughter-user' }]
    render(<CrisisCard kind="bp" personId="p1" onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(await screen.findByText('Your family will see this in Bantay.')).toBeTruthy()
    expect(screen.queryByText('Tell your family now. Bantay may not reach them.')).toBeNull()
  })
  it('the only writer row is the person own login (same rule as MedDetail): nobody else is told, so call the family', async () => {
    h.writers = [{ carer_id: 'owner-user' }]
    render(<CrisisCard kind="bp" personId="p1" onClose={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    await waitFor(() => expect(screen.getByText('Tell your family now. Bantay may not reach them.')).toBeTruthy())
    expect(screen.queryByText('Your family will see this in Bantay.')).toBeNull()
  })
  it('moodLine promises only when a writer carer exists; unknown and none say call', () => {
    expect(moodLine(true)).toBe('Your family will see it in Bantay.')
    expect(moodLine(false)).toMatch(/call your family/)
    expect(moodLine(undefined)).toMatch(/call your family/)
  })
})

describe('DS-1: told-today follows the Manila day (23:30 and 00:30)', () => {
  afterEach(() => vi.useRealTimers())
  it('told at 23:30 Manila still reads sent for a 0-row repeat at 23:50; at 00:30 the next day it is a new day, so nobody, and yesterday key is pruned', async () => {
    for (const k of await db.kv.toCollection().primaryKeys()) if (String(k).startsWith('mood.told.')) await db.kv.delete(k)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-20T15:30:00Z')) // 23:30 on 20 Oct in Manila (still 15:30 UTC the same day)
    h.rpc.mockResolvedValue({ data: 1, error: null })
    expect(await logFeeling('unwell')).toBe('told')
    expect(await db.kv.get('mood.told.p1.2026-10-20')).toBeTruthy()
    vi.setSystemTime(new Date('2026-10-20T15:50:00Z'))
    h.rpc.mockResolvedValue({ data: 0, error: null })
    expect(await logFeeling('unwell')).toBe('told')
    vi.setSystemTime(new Date('2026-10-20T16:30:00Z')) // 00:30 on 21 Oct in Manila, but still 20 Oct in UTC
    expect(await logFeeling('unwell')).toBe('nobody')
    h.rpc.mockResolvedValue({ data: 2, error: null })
    expect(await logFeeling('unwell')).toBe('told')
    expect(await db.kv.get('mood.told.p1.2026-10-21')).toBeTruthy()
    expect(await db.kv.get('mood.told.p1.2026-10-20')).toBeUndefined()
  })
})

describe('DS-8: the In 10 min toast follows the alarm health', () => {
  const now = new Date(2026, 9, 19, 9)
  const late: DuePerson = { personId: 'me', name: 'Lloyd', isMe: true, at: 540, rel: 540, status: 'missed', slots: [{ name: 'Losartan', slot: '09:00', at: 540, medicationId: 'm1', key: 'm1', personId: 'me', dose: '1 tablet' }] }
  /** Taps Snooze until the toast reads `want` (useKvValue reads Dexie live, so the first tap may still see no health row); a wrong toast never appears, so the wait times out and fails. */
  const toast = async (native: boolean, ok: boolean | undefined, want: string) => {
    h.native = native
    await db.kv.delete(KEY_ALARM_HEALTH)
    if (ok !== undefined) await db.kv.put({ key: KEY_ALARM_HEALTH, value: { ok } })
    const notify = vi.fn()
    render(<NextUp item={pickNext({ due: [late], plan: null, storm: null }, now)} review={0} notify={notify} />)
    await waitFor(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Snooze, in 10 minutes' }))
      expect(notify).toHaveBeenLastCalledWith(want)
    })
    cleanup()
  }
  it('promises a reminder only on native with alarms known to work', async () => {
    await toast(true, true, 'Okay. I will remind you in 10 minutes')
    await toast(true, false, 'Okay. This card comes back in 10 minutes')
    await toast(true, undefined, 'Okay. This card comes back in 10 minutes')
    await toast(false, true, 'Okay. This card comes back in 10 minutes')
  })
})
