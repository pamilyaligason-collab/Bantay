import 'fake-indexeddb/auto'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { validZone } from '../time/zone'
import { HOME_CITIES, nearestCity, searchCities } from './homeCities'
import { asHome, placeTimezone, resolvePlace, setKnownHome } from './place'
import { placeWords } from './placeWords'
import { placeOutsidePh, placeRegion } from './region'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false } }))
vi.mock('../family/placeApi', () => ({ putLivePlace: vi.fn(() => Promise.resolve()) }))
import { HOME_KEY, resetRefresh, usePlaceFrom, weatherPoint, ZONE_KEY } from './useLocation'

// S30 L9 (F1): the member's own home place. Hand values: Houston centre 29.76, -95.37 (America/Chicago); Tagbilaran 9.65, 123.86; Tokyo 35.68, 139.69.
const HOUSTON = { name: 'Houston, Texas', lat: 29.76, lon: -95.37, tz: 'America/Chicago' }
const TOKYO = { lat: 35.68, lon: 139.69 }
const TAG = { lat: 9.65, lon: 123.85 }
const phoneIn = (tz: string) => vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: tz } as Intl.ResolvedDateTimeFormatOptions)
afterEach(() => { vi.restoreAllMocks(); setKnownHome(null); cleanup() })

describe('asHome reads a saved home back safely', () => {
  it('keeps a name, a real position and a real zone; the wizard\'s old shape (no tz) is fine', () => {
    expect(asHome(HOUSTON)).toEqual(HOUSTON)
    expect(asHome({ name: ' Dampas ', lat: 9.6, lon: 123.8 })).toEqual({ name: 'Dampas', lat: 9.6, lon: 123.8 })
  })
  it('refuses nothing-places: no name, 0,0, off the globe, text numbers, a made-up zone is dropped but the place stays', () => {
    expect(asHome(null)).toBeNull()
    expect(asHome({ name: '', lat: 1, lon: 1 })).toBeNull()
    expect(asHome({ name: 'x', lat: 0, lon: 0 })).toBeNull()
    expect(asHome({ name: 'x', lat: 91, lon: 1 })).toBeNull()
    expect(asHome({ name: 'x', lat: '29', lon: -95 })).toBeNull()
    expect(asHome({ ...HOUSTON, tz: 'Mars/Olympus' })).toEqual({ name: 'Houston, Texas', lat: 29.76, lon: -95.37 })
  })
})

describe('resolvePlace with a home place (outside the Philippines)', () => {
  it('no position: Texas weather, the Philippine zone stays for Philippine alerts, source home', () => {
    expect(resolvePlace({ gps: null, lastZone: 'conel', home: HOUSTON })).toEqual({ weather: { lat: 29.76, lon: -95.37 }, zone: 'conel', source: 'home' })
  })
  it('an old fix abroad is not where the phone is now: the home place, not the last zone', () => {
    expect(resolvePlace({ gps: { ...TOKYO, stale: true }, lastZone: 'dampas', home: HOUSTON }).source).toBe('home')
  })
  it('a live position beats the home place, in the Philippines and abroad; an old Philippine fix too', () => {
    expect(resolvePlace({ gps: TAG, lastZone: 'conel', home: HOUSTON })).toEqual({ weather: TAG, zone: 'dampas', source: 'gps' })
    expect(resolvePlace({ gps: TOKYO, lastZone: 'conel', home: HOUSTON })).toEqual({ weather: TOKYO, zone: 'conel', source: 'gps-abroad' })
    expect(resolvePlace({ gps: { ...TAG, stale: true }, lastZone: 'conel', home: HOUSTON }).source).toBe('last')
  })
  it('no home, or a home inside the Philippines: exactly as before (the zone)', () => {
    expect(resolvePlace({ gps: null, lastZone: 'conel' }).source).toBe('zone')
    expect(resolvePlace({ gps: null, lastZone: 'conel', home: null }).source).toBe('zone')
    const r = resolvePlace({ gps: null, lastZone: 'conel', home: { name: 'Cebu City', lat: 10.32, lon: 123.89 } })
    expect(r.source).toBe('zone'); expect(r.weather.lat).toBeCloseTo(6.2015, 3)
  })
})

describe('place words, timezone and region follow the home place', () => {
  it('words: the name the member gave; at home with a live fix it is the same name; far away it is the area', () => {
    expect(placeWords({ source: 'home', zone: 'conel', weather: HOUSTON, home: HOUSTON }, 0)).toEqual({ title: 'Houston, Texas', stale: false })
    expect(placeWords({ source: 'gps-abroad', zone: 'conel', weather: { lat: 29.8, lon: -95.4 }, home: HOUSTON }, 0).title).toBe('Houston, Texas') // about 5 km away
    expect(placeWords({ source: 'gps-abroad', zone: 'conel', weather: { lat: 30.27, lon: -97.74 }, home: HOUSTON }, 0).title).toBe('Texas') // Austin, 230 km away
    expect(placeWords({ source: 'gps-abroad', zone: 'conel', weather: TOKYO, home: HOUSTON }, 0).title).toBe('Away · Conel, General Santos')
  })
  it('timezone: the forecast\'s own zone first; Manila inside the Philippines; the home place\'s zone near it; else the phone', () => {
    setKnownHome(HOUSTON)
    expect(placeTimezone({ lat: 29.76, lon: -95.37 }, 'America/Denver')).toBe('America/Denver')
    expect(placeTimezone(TAG)).toBe('Asia/Manila')
    expect(placeTimezone({ lat: 29.76, lon: -95.37 })).toBe('America/Chicago')
    expect(placeTimezone({ lat: 30.27, lon: -97.74 })).toBeUndefined() // Austin is 230 km from the saved home
    setKnownHome(null)
    expect(placeTimezone({ lat: 29.76, lon: -95.37 })).toBeUndefined()
  })
  it('region: a home in Texas counts like a fix, but a phone set to the Philippines disagrees, so it is unknown (both crisis lines stay)', () => {
    const place = { source: 'home', weather: { lat: 29.76, lon: -95.37 } }
    phoneIn('America/Chicago')
    expect(placeRegion(place)).toBe('us')
    expect(placeOutsidePh(place)).toBe(true)
    vi.restoreAllMocks(); phoneIn('Asia/Manila')
    expect(placeRegion(place)).toBeNull()
    expect(placeOutsidePh(place)).toBe(true) // still not a Philippine place: the Plant guide says so
    expect(placeOutsidePh({ source: 'zone', weather: TAG })).toBe(false)
    expect(placeOutsidePh(null)).toBe(false)
  })
})

describe('the city list', () => {
  it('every city is a real place with a real IANA zone', () => {
    for (const c of HOME_CITIES) {
      expect(validZone(c.tz), c.name).toBe(c.tz)
      expect(Math.abs(c.lat) <= 90 && Math.abs(c.lon) <= 180, c.name).toBe(true)
      expect(asHome(c), c.name).toEqual(c)
    }
    expect(new Set(HOME_CITIES.map((c) => c.name)).size).toBe(HOME_CITIES.length)
  })
  it('search matches every typed word in any order; nothing typed lists the first few', () => {
    expect(searchCities('hou').map((c) => c.name)).toEqual(['Houston, Texas'])
    expect(searchCities('texas houston').map((c) => c.name)).toEqual(['Houston, Texas'])
    expect(searchCities('zzz')).toEqual([])
    expect(searchCities('').length).toBe(8)
    expect(searchCities('', 3)[0]!.name).toBe('Houston, Texas')
  })
  it('a point is named by the nearest listed city within 60 km, else nothing', () => {
    expect(nearestCity({ lat: 29.7, lon: -95.4 })?.name).toBe('Houston, Texas')
    expect(nearestCity({ lat: 31.0, lon: -100.0 })).toBeNull()
  })
})

describe('usePlaceFrom reads the saved home from this phone', () => {
  beforeEach(async () => { resetRefresh(); await db.kv.clear() })
  const loc = (o: Record<string, unknown>) => ({ ask: vi.fn(), refine: vi.fn(), setHome: vi.fn(), forget: vi.fn(), ...o }) as unknown as Parameters<typeof usePlaceFrom>[0]
  const NOFIX = loc({ source: 'home', lat: 9.64, lon: 123.87 })

  it('a Texas member without a position sees Texas weather and the Texas name, not Dampas', async () => {
    await db.kv.put({ key: HOME_KEY, value: HOUSTON })
    const { result } = renderHook(() => usePlaceFrom(NOFIX))
    await waitFor(() => expect(result.current?.source).toBe('home'))
    expect(result.current!.weather).toEqual({ lat: 29.76, lon: -95.37 })
    expect(result.current!.home?.name).toBe('Houston, Texas')
    expect(placeWords(result.current, 0).title).toBe('Houston, Texas')
    expect(result.current!.zone).toBe('dampas') // Philippine alerts keep their own zone
  })
  it('no home saved: the last Philippine zone, as before', async () => {
    await db.kv.put({ key: ZONE_KEY, value: 'conel' })
    const { result } = renderHook(() => usePlaceFrom(NOFIX))
    await waitFor(() => expect(result.current?.source).toBe('zone'))
    expect(result.current!.zone).toBe('conel')
  })
  it('saving a home while the screen is open moves the place at once; removing it moves it back', async () => {
    const { result } = renderHook(() => usePlaceFrom(NOFIX))
    await waitFor(() => expect(result.current?.source).toBe('zone'))
    await act(async () => { await db.kv.put({ key: HOME_KEY, value: HOUSTON }) })
    await waitFor(() => expect(result.current?.source).toBe('home'))
    await act(async () => { await db.kv.delete(HOME_KEY) })
    await waitFor(() => expect(result.current?.source).toBe('zone'))
  })
  it('a home inside the Philippines picks the nearest zone only when none was picked by hand', async () => {
    await db.kv.put({ key: HOME_KEY, value: { name: 'General Santos', lat: 6.12, lon: 125.17 } })
    const a = renderHook(() => usePlaceFrom(NOFIX))
    await waitFor(() => expect(a.result.current?.zone).toBe('conel'))
    expect(a.result.current!.source).toBe('zone')
    a.unmount()
    await db.kv.put({ key: ZONE_KEY, value: 'dampas' })
    const b = renderHook(() => usePlaceFrom(NOFIX))
    await waitFor(() => expect(b.result.current?.picked).toBe(true))
    expect(b.result.current!.zone).toBe('dampas')
  })
  it('the rain reminder looks where the home place is when there is no fix', async () => {
    await db.kv.put({ key: HOME_KEY, value: HOUSTON })
    expect(await weatherPoint()).toEqual({ lat: 29.76, lon: -95.37 })
    await db.kv.delete(HOME_KEY)
    expect((await weatherPoint()).lat).toBeCloseTo(9.6457, 3)
  })
})
