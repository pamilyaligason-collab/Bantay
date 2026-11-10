import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const LN = vi.hoisted(() => ({ schedule: vi.fn(), cancel: vi.fn(), checkPermissions: vi.fn() }))
const fcx = vi.hoisted(() => ({ probs: [null, null] as (number | null)[] }))
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: LN }))
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
vi.mock('../location/useLocation', () => ({ weatherPoint: async () => ({ lat: 9.65, lon: 123.85 }) }))
vi.mock('../today/weather', () => ({ toWx: () => ({}) }))
vi.mock('../today/RainMini', () => ({ MINI_SLOTS: 8, miniSlots: () => Array.from({ length: 8 }, (_, i) => ({ time: `t${i}`, mm: 0, pct: null, wet: false })) }))
vi.mock('./forecast', async (orig) => ({
  ...(await orig<typeof import('./forecast')>()),
  getForecast: async () => ({ fromCache: false, fc: { utcOffset: 0, hourly: fcx.probs.map((prob, i) => ({ time: `2026-11-04T${String(11 + i).padStart(2, '0')}:00`, temp: 30, prob, code: 0, mm: 0 })) } })
}))

import { db } from '../../db'
import { RAIN_KEY, THRESH_KEY, syncRainReminder } from './rainRemind'

const NOW = new Date('2026-11-04T11:10:00Z')
beforeEach(async () => {
  vi.clearAllMocks(); LN.schedule.mockResolvedValue(undefined); LN.cancel.mockResolvedValue(undefined); LN.checkPermissions.mockResolvedValue({ display: 'granted' })
  await db.kv.clear(); await db.kv.put({ key: RAIN_KEY, value: true }); await db.kv.put({ key: THRESH_KEY, value: 60 })
})

describe('syncRainReminder reads the chance in the next hour (this hour and the next)', () => {
  it.each([[[70, 30]], [[30, 70]]])('the larger of the two, %j, is 70: at the 60 threshold it schedules', async (p) => {
    fcx.probs = p
    expect(await syncRainReminder(NOW)).toBe('scheduled')
    expect(LN.schedule).toHaveBeenCalledTimes(1)
    const n = LN.schedule.mock.calls[0][0].notifications[0] // chance only, no wet slot: rings 30 minutes from 11:10, with the chance-only body
    expect(n.schedule.at).toEqual(new Date('2026-11-04T11:40:00Z'))
    expect(n.body).toContain('Rain is likely in the next hour.')
  })
  it('both under the threshold: nothing is scheduled', async () => {
    fcx.probs = [50, 59]
    expect(await syncRainReminder(NOW)).toBe('cancelled')
  })
  it('no chance known (null, null): unknown is not a reason to ring', async () => {
    fcx.probs = [null, null]
    expect(await syncRainReminder(NOW)).toBe('cancelled'); expect(LN.schedule).not.toHaveBeenCalled()
  })
  it('one known value is used, the null is skipped', async () => {
    fcx.probs = [null, 65]
    expect(await syncRainReminder(NOW)).toBe('scheduled')
  })
})
