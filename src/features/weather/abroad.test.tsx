import 'fake-indexeddb/auto'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { resolvePlace } from '../location/place'
import type { Alert } from '../safety/alerts'
import { openMeteoFixture } from './fixture'
import WeatherScreen from './WeatherScreen'

vi.mock('../admin/events', () => ({ track: vi.fn(async () => true) }))
vi.mock('../location/ZonePicker', () => ({ default: () => null }))
vi.mock('../location/useLocation', () => {
  const l = { source: 'gps', lat: 32.78, lon: -96.8, ask: async () => null }
  return { ZONE_KEY: 'test.zone', useLocation: () => l, usePlaceFrom: () => ({ ...resolvePlace({ gps: { lat: 32.78, lon: -96.8 }, lastZone: 'dampas' }), lastZone: 'dampas', settled: true, picked: true }) }
})

const row = (o: Partial<Alert>): Alert => ({ id: 'x', kind: 'gdacs', level: null, title: 't', what: '', where: '', when: '', doNow: 'Stay home.', source: 'GDACS', sourceUrl: null, issuedAt: new Date().toISOString(), lat: null, lon: null, bulletin: '', ...o })

beforeEach(async () => {
  await db.kv.clear()
  await db.kv.put({ key: 'alerts:checkedAt', value: new Date().toISOString() })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(openMeteoFixture({ now: new Date(), temp: 25, humidity: 40 })), { status: 200 })))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('R4 Weather on a phone in Texas: sentences that name home measure from home', () => {
  it('a typhoon near home: Storm track gives the distance from home and is not calm', async () => {
    await db.kv.put({ key: 'safety.alerts', value: [row({ id: 'gdacs-TC-1', title: 'Tropical Cyclone PEPITO', lat: 10.5, lon: 124.5 })] })
    render(<WeatherScreen />)
    await waitFor(() => expect(document.querySelector('.wx-storm [role="status"]')?.textContent).toContain('about 100 km north-east of Dampas')) // 95 km north and 68 km east: 117 km, rounded to 50s
    expect(document.querySelector('.wx-storm [role="status"]')!.textContent).not.toMatch(/far from|Away/)
    expect(document.querySelector('.wx-storm')?.getAttribute('data-tone')).toBe('watch')
  })
  it('a wind signal at home: the Official row shows it, never "no warning near"', async () => {
    await db.kv.put({ key: 'safety.alerts', value: [row({ id: 'pagasa-tcws-1-1', kind: 'tcws', level: 'Signal No. 2', title: 'Signal No. 2 for Dampas', source: 'PAGASA', lat: 9.645705, lon: 123.877951 })] })
    render(<WeatherScreen />)
    await waitFor(() => expect(screen.getByRole('link', { name: /Official warnings/ }).textContent).toContain('Signal No. 2 for Dampas'))
    expect(screen.getByRole('link', { name: /Official warnings/ }).textContent).not.toContain('no warning near')
  })
})
