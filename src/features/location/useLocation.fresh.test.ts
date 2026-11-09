import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, isPluginAvailable: () => false } }))
import { refreshLocation, resetRefresh, resolveLocation } from './useLocation'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { placeLine, placeWords } from './placeWords'
import { placeLineOf, placeNameOf } from '../today/placeName'
import { placeName } from '../safety/warningsLogic'
import { quietQuakeWords } from '../safety/alerts'

// these cases are about the map being off (low-accuracy plain reads, the four feed switches): the family map is on by default since D-143
beforeEach(() => { localStorage.setItem('bantay.flag.places', '0') })

const stub = (coords: Record<string, number>, timestamp?: number, perm = 'granted') => {
  const g = vi.fn((ok: (p: unknown) => void) => ok({ coords: { latitude: 6.11, longitude: 125.17, ...coords }, timestamp }))
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: g }, permissions: { query: () => Promise.resolve({ state: perm }) } })
  return g
}

describe('S22 G: accuracy, fix time, options, shared refresh', () => {
  beforeEach(async () => { resetRefresh(); await db.kv.clear() })
  it('stores accuracy and the phone fix time with loc.last and returns them', async () => {
    stub({ accuracy: 1800 }, Date.now() - 120_000)
    const l = await resolveLocation(false)
    expect(l).toMatchObject({ source: 'gps', accuracy: 1800 })
    expect(Date.now() - l.at!).toBeGreaterThanOrEqual(120_000)
    await vi.waitFor(async () => expect((await db.kv.get('loc.last'))?.value).toMatchObject({ lat: 6.11, accuracy: 1800, at: l.at }))
  })
  it('an old loc.last without accuracy still parses', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 9.65, lon: 123.85, at: 1700000000000 } }); stub({}, undefined, 'denied')
    const l = await resolveLocation(false)
    expect(l).toEqual({ lat: 9.65, lon: 123.85, source: 'last', at: 1700000000000 })
    expect('accuracy' in l).toBe(false)
  })
  it('a stored accuracy comes back on the last fix', async () => {
    await db.kv.put({ key: 'loc.last', value: { lat: 9.65, lon: 123.85, at: 1700000000000, accuracy: 40 } }); stub({}, undefined, 'denied')
    expect(await resolveLocation(false)).toMatchObject({ source: 'last', accuracy: 40 })
  })
  it('plain refresh reads low-accuracy with a 10 min cache; precise reads high-accuracy fresh', async () => {
    const g = stub({})
    await resolveLocation(false)
    expect((g.mock.calls[0] as unknown[])[2]).toEqual({ enableHighAccuracy: false, maximumAge: 600_000, timeout: 15_000 })
    await resolveLocation(false, true)
    expect((g.mock.calls[1] as unknown[])[2]).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 })
  })
  it('the foreground refresh is throttled to 5 min and shared while one is running', async () => {
    const g = stub({})
    const t0 = 1_000_000_000_000
    const a = refreshLocation({ now: t0 })
    expect(refreshLocation({ now: t0 + 1 })).toBe(a) // joins the running one
    await a
    expect(g).toHaveBeenCalledTimes(1)
    expect(refreshLocation({ now: t0 + 4 * 60_000 })).toBeNull()
    await refreshLocation({ now: t0 + 5 * 60_000 })
    expect(g).toHaveBeenCalledTimes(2)
    await refreshLocation({ now: t0 + 5 * 60_000 + 1, force: true, precise: true })
    expect(g).toHaveBeenCalledTimes(3)
    expect((g.mock.calls[2] as unknown[])[2]).toMatchObject({ enableHighAccuracy: true })
  })
})

describe('S22 G: place line accuracy wording', () => {
  const base = { source: 'gps', zone: 'dampas', weather: { lat: 9.6457, lon: 123.878 }, settled: true }
  it('a rough fix (over 1000 m) says "around <place>" on the place line only; the title stays plain', () => {
    const w = placeWords({ ...base, accuracy: 1500 })
    expect(w.approx).toBe(true)
    expect(w.title.startsWith('around ')).toBe(false)
    expect(placeLine(w)).toBe(`around ${w.title}`)
  })
  it('a good or unknown accuracy keeps the plain name', () => {
    expect(placeLine(placeWords({ ...base, accuracy: 30 })).startsWith('around ')).toBe(false)
    expect(placeLine(placeWords({ ...base })).startsWith('around ')).toBe(false)
  })
  it('a last-known rough fix keeps the last-known tail', () => {
    const w = placeWords({ ...base, source: 'last', accuracy: 2000, fixAt: 0 }, 3 * 3_600_000)
    expect(placeLine(w)).toMatch(/^around .* · last known, 3 hours ago$/)
  })
  it('a rough fix: sentences use the plain title (the "near around" screens are rendered in weather/roughNear and today/roughAria tests)', () => {
    const rough = { ...base, accuracy: 1500 }
    expect(placeNameOf(rough as never)).toBe('Tagbilaran')
    expect(placeLineOf(rough as never)).toBe('around Tagbilaran')
    expect(placeName(rough)).toBe('Tagbilaran')
  })
  it('a far quake on a rough live fix says exactly "Too far to feel in <place>. No action needed.", no "around"', () => {
    const now = 1_800_000_000_000
    // M4.5 felt out to 100 km (D-87); 300 km away is beyond it, M4.5 < M6, issued 3 h ago (over the 1 h RECENT_MS): a quiet quake
    const quake = { id: 'q1', kind: 'quake', level: 'M4.5', title: 'M4.5 earthquake', what: 'Invented test quake', issuedAt: new Date(now - 3 * 3_600_000).toISOString() } as never
    const q = quietQuakeWords(quake, 300, { ...base, accuracy: 1500, fixAt: now - 60_000 }, now)
    expect(q).toEqual({ line: 'Too far to feel in Tagbilaran. No action needed.', steps: false })
    expect(q!.line).not.toContain('around')
  })
})

describe('S22 G: source encoding', () => {
  it('src text files are valid UTF-8 (no stray 0x85 / Windows-1252 bytes)', () => {
    const bad: string[] = []
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(tsx?|css|json|md|html)$/.test(e.name)) {
          try { new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(p)) } catch { bad.push(p) }
        }
      }
    }
    walk('src')
    expect(bad).toEqual([])
  })
})
