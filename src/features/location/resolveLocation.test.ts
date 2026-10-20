import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { resolveLocation } from './useLocation'

// Session 7 bug: in the Android shell, Capacitor's BridgeWebChromeClient answers the WebView geolocation prompt with
// invoke(origin, true, false) (retain=false), so navigator.permissions keeps reporting 'prompt' after the member allowed it.
// resolveLocation(false) then never reads GPS and Today shows the home zone (Dampas) while the phone is in General Santos.
const GENSAN = { latitude: 6.1164, longitude: 125.1716 }

function phone(state: PermissionState) {
  vi.stubGlobal('navigator', {
    ...navigator,
    permissions: { query: vi.fn().mockResolvedValue({ state }) },
    geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: GENSAN } as GeolocationPosition) }
  })
}

afterEach(async () => {
  vi.unstubAllGlobals()
  await db.kv.clear()
})

describe('resolveLocation without asking', () => {
  it('uses GPS when the browser reports granted', async () => {
    phone('granted')
    expect((await resolveLocation(false)).source).toBe('gps')
  })

  it.fails('uses GPS in the Android shell after the member allowed location once (permission API still says prompt)', async () => {
    phone('prompt')
    await db.kv.put({ key: 'loc.asked', value: true })
    await db.kv.put({ key: 'loc.gps_ok', value: true })
    expect((await resolveLocation(false)).source).toBe('gps')
  })

  it('never reads GPS (no prompt) for a member who was never asked', async () => {
    phone('prompt')
    expect((await resolveLocation(false)).source).toBe('home')
  })

  it('never reads GPS when denied', async () => {
    phone('denied')
    await db.kv.put({ key: 'loc.gps_ok', value: true })
    expect((await resolveLocation(false)).source).toBe('home')
  })
})
