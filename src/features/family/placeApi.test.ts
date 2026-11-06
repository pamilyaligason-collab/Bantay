import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

const h = vi.hoisted(() => ({ rpc: vi.fn(), self: 'pa' as string | null }))
vi.mock('../sync/profile', () => ({ selfIdOrCached: () => Promise.resolve(h.self) }))
vi.mock('../auth/client', () => ({ supabase: { rpc: h.rpc } }))
import { fetchPlaces, placeKey, placeNoticeKey, placeSharingOn, putLivePlace } from './placeApi'

const fix = { lat: 14.5995, lon: 120.9842, accuracy: 19.6, at: Date.UTC(2026, 10, 6, 4, 0, 0) }
beforeEach(async () => { await db.kv.clear(); await db.kv.put({ key: placeNoticeKey('pa'), value: true }); h.self = 'pa'; h.rpc.mockReset().mockResolvedValue({ error: null }); localStorage.setItem('bantay.flag.places', '1') })
afterEach(() => localStorage.clear())

describe('putLivePlace (D-138)', () => {
  it('sends nothing before the first-open notice was answered, then writes after OK', async () => {
    await db.kv.delete(placeNoticeKey('pa'))
    expect(await putLivePlace(fix, null)).toBe('skipped')
    expect(h.rpc).not.toHaveBeenCalled()
    await db.kv.put({ key: placeNoticeKey('pa'), value: true })
    expect(await putLivePlace(fix, null)).toBe('ok')
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })
  it('Turn off from the notice leaves the explicit off row cached and sends no point', async () => {
    await db.kv.put({ key: placeKey('pa'), value: false })
    expect(await putLivePlace(fix, null)).toBe('skipped')
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('writes through live_location_put with the fix and the battery, rounded', async () => {
    expect(await putLivePlace(fix, { pct: 18, charging: false })).toBe('ok')
    expect(h.rpc).toHaveBeenCalledWith('live_location_put', { p_lat: 14.5995, p_lon: 120.9842, p_accuracy_m: 20, p_fixed_at: '2026-11-06T04:00:00.000Z', p_battery_pct: 18, p_charging: false })
  })
  it('sends unknown battery as null, not 0 (ML-05)', async () => {
    await putLivePlace({ ...fix, accuracy: undefined }, null)
    expect(h.rpc.mock.calls[0]![1]).toMatchObject({ p_accuracy_m: null, p_battery_pct: null, p_charging: null })
  })
  it('is on by default: no cached value still writes', async () => {
    expect(await placeSharingOn('pa')).toBe(true)
    expect(await putLivePlace(fix, null)).toBe('ok')
  })
  it('is skipped, with no call at all, while the cached switch is off', async () => {
    await db.kv.put({ key: placeKey('pa'), value: false })
    expect(await putLivePlace(fix, null)).toBe('skipped')
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('is skipped while the places flag is off', async () => {
    localStorage.removeItem('bantay.flag.places')
    expect(await putLivePlace(fix, null)).toBe('skipped')
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('is skipped for 0,0 and off-globe fixes', async () => {
    expect(await putLivePlace({ ...fix, lat: 0, lon: 0 }, null)).toBe('skipped')
    expect(await putLivePlace({ ...fix, lat: 91 }, null)).toBe('skipped')
    expect(h.rpc).not.toHaveBeenCalled()
  })
  it('a server refusal (42501) turns the cached switch off so the next open does not ask again', async () => {
    h.rpc.mockResolvedValue({ error: { code: '42501' } })
    expect(await putLivePlace(fix, null)).toBe('off')
    expect(await placeSharingOn('pa')).toBe(false)
    expect(await putLivePlace(fix, null)).toBe('skipped')
    expect(h.rpc).toHaveBeenCalledTimes(1)
  })
  it('any other failure is failed and leaves the switch on', async () => {
    h.rpc.mockResolvedValue({ error: { code: '53400' } })
    expect(await putLivePlace(fix, null)).toBe('failed')
    expect(await placeSharingOn('pa')).toBe(true)
    h.rpc.mockRejectedValue(new Error('network'))
    expect(await putLivePlace(fix, null)).toBe('failed')
  })
})

describe('fetchPlaces', () => {
  it('maps rows and drops a row with a bad position or time', async () => {
    h.rpc.mockResolvedValue({ data: [
      { person_id: 'p1', lat: 14.6, lon: 121, accuracy_m: 20, fixed_at: '2026-11-06T04:00:00Z', battery_pct: 82, charging: true },
      { person_id: 'p2', lat: 0, lon: 0, accuracy_m: null, fixed_at: '2026-11-06T04:00:00Z', battery_pct: null, charging: null },
      { person_id: 'p3', lat: 14.6, lon: 121, accuracy_m: null, fixed_at: 'nope', battery_pct: null, charging: null }
    ], error: null })
    expect(await fetchPlaces()).toEqual([{ personId: 'p1', lat: 14.6, lon: 121, accuracyM: 20, fixedAt: Date.UTC(2026, 10, 6, 4), batteryPct: 82, charging: true }])
    expect(h.rpc).toHaveBeenCalledWith('family_places')
  })
  it('unknown is null, never an empty family', async () => {
    h.rpc.mockResolvedValue({ data: null, error: { code: '42883' } })
    expect(await fetchPlaces()).toBeNull()
    h.rpc.mockRejectedValue(new Error('offline'))
    expect(await fetchPlaces()).toBeNull()
    h.rpc.mockResolvedValue({ data: [], error: null })
    expect(await fetchPlaces()).toEqual([])
  })
})
