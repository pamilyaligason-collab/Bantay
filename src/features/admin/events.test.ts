import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { EVENT_NAMES, track } from './events'
import { pinError } from './pin'

const st = vi.hoisted(() => ({ client: true, token: 'tok' as string | null }))
vi.mock('../auth/client', () => ({ get supabase() { return st.client ? {} : null } }))
vi.mock('../auth/session', () => ({ getAccessToken: async () => st.token }))

describe('track allowlist (B-7)', () => {
  beforeEach(async () => { st.client = true; st.token = 'tok'; await db.outbox.clear() })
  it('queues nothing when not configured or signed out', async () => {
    st.client = false
    expect(await track('screen', 'health')).toBe(false)
    st.client = true; st.token = null
    expect(await track('screen', 'health')).toBe(false)
    expect(await db.outbox.count()).toBe(0)
  })
  it('queues an allowed event with only kind, name and appVersion', async () => {
    expect(await track('screen', 'health')).toBe(true)
    const rows = await db.outbox.toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ table: 'usage_events', op: 'insert' })
    expect(Object.keys(rows[0]!.payload as object).sort()).toEqual(['appVersion', 'clientAt', 'kind', 'name'])
    const at = Date.parse((rows[0]!.payload as { clientAt: string }).clientAt)
    expect(Math.abs(Date.now() - at)).toBeLessThan(5000) // the phone's own time of the tap
  })
  it('leaves clientAt out when the device clock is wrong, still queues the event', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      for (const t of ['2001-01-01T00:00:00Z', '2150-01-01T00:00:00Z']) {
        vi.setSystemTime(new Date(t))
        await db.outbox.clear()
        expect(await track('screen', 'today')).toBe(true)
        expect(Object.keys((await db.outbox.toArray())[0]!.payload as object).sort()).toEqual(['appVersion', 'kind', 'name'])
      }
    } finally { vi.useRealTimers() }
  })
  it('allows the Me and notifications screens', async () => {
    expect(await track('screen', 'me')).toBe(true)
    expect(await track('screen', 'notif')).toBe(true)
    expect(await track('screen', 'docs')).toBe(true)
  })
  it('drops unknown kinds, unknown names and digit-bearing names', async () => {
    for (const [k, n] of [['reading', 'health'], ['screen', 'bp_150'], ['screen', 'health2'], ['action', '120/80'], ['screen', ''], ['__proto__', 'x'], ['constructor', 'today'], ['action', 'Health']]) {
      expect(await track(k!, n!), `${k}/${n}`).toBe(false)
    }
    expect(await db.outbox.count()).toBe(0)
  })
  it('allows every session 6 habit event (PART-2 section 4) and the Ask screen', async () => {
    for (const n of ['dose_logged', 'dose_skipped', 'reading_added', 'sos_sent', 'checkin_done', 'med_added', 'med_edited', 'med_paused',
      'med_deleted', 'reminder_opened', 'card_seen_my_week', 'card_seen_family_line', 'weather_opened', 'weather_opened_action', 'records_confirmed']) {
      expect(await track('action', n), n).toBe(true)
    }
    expect(await track('screen', 'ask')).toBe(true)
  })
  it('allows the three nutrition events and never a food name (B-7)', async () => {
    for (const n of ['meal_logged', 'water_logged', 'salt_goal_set']) expect(await track('action', n), n).toBe(true)
    for (const n of ['chicken_adobo', 'Adobong manok', 'patis', 'instant_noodles']) expect(await track('action', n), n).toBe(false)
  })
  it('every allowed name is letters and underscores only (matches the DB check)', () => {
    for (const names of Object.values(EVENT_NAMES)) for (const n of names) expect(n).toMatch(/^[a-z_]{1,40}$/)
  })
})

describe('pinError', () => {
  it('accepts a good PIN and rejects the weak ones', () => {
    expect(pinError('483920')).toBeNull()
    expect(pinError('12345')).not.toBeNull()
    expect(pinError('1234567')).not.toBeNull()
    expect(pinError('12345a')).not.toBeNull()
    expect(pinError('111111')).not.toBeNull()
    expect(pinError('123456')).not.toBeNull()
  })
})
