import 'fake-indexeddb/auto'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db'
import { weatherSummary } from '../assistant/weather'
import { openMeteoFixture } from '../weather/fixture'
import { planDial } from './dial'
import { abroadNumber, dialNumber, type Entry, extensionOf, firstNumber, orphanRows, telHref, withFamilyAdded } from './entries'
import LiveMaps from './LiveMaps'
import { sentenceCase } from './news'
import { stormCentre, zoomEarthUrl } from './stormView'

const mockKv = vi.hoisted(() => ({ list: [] as unknown[] }))
vi.mock('./store', () => ({ useKv: () => mockKv.list }))
afterEach(cleanup)

describe('OFW numbers from abroad and extensions', () => {
  it('abroad: uses the abroad number when the entry has one, else converts a leading 0 to +63', () => {
    expect(abroadNumber('1348 (abroad: +63 2 1348)')).toBe('+63 2 1348')
    expect(telHref('1348 (abroad: +63 2 1348)', true)).toBe('tel:+6321348')
    expect(telHref('(02) 8722-1144 / (02) 8722-1155', true)).toBe('tel:+63287221144')
    expect(telHref('0917 839 9896', true)).toBe('tel:+639178399896')
    expect(dialNumber('(02) 8722-1144', true)).toBe('+63287221144')
  })
  it('inside the Philippines the local format stays', () => {
    expect(telHref('(02) 8722-1144 / (02) 8722-1155')).toBe('tel:0287221144')
    expect(telHref('1348 (abroad: +63 2 1348)')).toBe('tel:1348')
    expect(dialNumber('(02) 8722-1144')).toBe('(02) 8722-1144')
  })
  it('an extension is never glued onto the number', () => {
    expect(firstNumber('(02) 8834-4000 loc. 4031')).toBe('(02) 8834-4000')
    expect(firstNumber('PAGASA (02) 8284-0800 local 1100')).not.toMatch(/1100/)
    expect(extensionOf('(02) 8834-4000 loc. 4031')).toBe('4031')
    expect(telHref('(02) 8834-4000 loc. 4031')).toBe('tel:028834' + '4000,4031')
    expect(telHref('(02) 8834-4000 loc. 4031')).not.toBe('tel:02883440004031')
    expect(telHref('(02) 8834-4000 loc. 4031', true)).toBe('tel:+63288344000')
  })
})

describe('old hotline ids keep what a family typed', () => {
  const seed = [{ id: 'hl-new', zone: 'tagbilaran', group: 'Emergency', name: 'New', phone: '911', status: 'CONFIRMED', source: 's', sourceUrl: null, date: 'd' }] as Entry[]
  const o = { 'hl-tag911': { phone: '038 411 0911' }, 'hl-bfp': { phone: '160', name: 'Fire station' }, 'hl-new': { phone: '912' }, 'hl-old-noph': { note: 'x' } }
  it('shows an override whose id is gone as a family-added row', () => {
    const rows = orphanRows(seed, o)
    expect(rows.map((r) => [r.id, r.name, r.phone, r.status])).toEqual([['hl-tag911', 'Tagbilaran 911', '038 411 0911', 'FAMILY'], ['hl-bfp', 'Fire station', '160', 'FAMILY']])
    expect(withFamilyAdded(seed, o).find((e) => e.id === 'hl-new')?.phone).toBe('912')
  })
  it('planDial lists them in a Family-added set wherever the person is', () => {
    const entries = withFamilyAdded(seed, o)
    for (const pos of [{ lat: 9.6472, lon: 123.8556 }, { lat: 32.8, lon: -96.8 }, { lat: 51.5, lon: -0.1 }]) {
      const set = planDial(pos, entries, true).sets.find((s) => s.id === 'family')
      expect(set?.header).toBe('Family-added')
      expect(set?.entries.map((e) => e.id)).toEqual(['hl-tag911', 'hl-bfp'])
    }
    expect(planDial({ lat: 51.5, lon: -0.1 }, withFamilyAdded(seed, {}), true).sets.some((s) => s.id === 'family')).toBe(false)
  })
})

describe('LiveMaps follows the place, not 12N 128E', () => {
  beforeEach(() => { mockKv.list = [] })
  it('the storm map and the Zoom Earth link are centred on loc', () => {
    const loc = { lat: 32.78, lon: -96.8 }
    render(<LiveMaps loc={loc} />)
    const v = stormCentre(loc)
    expect(zoomEarthUrl(loc)).toBe('https://zoom.earth/maps/satellite/#view=32.78,-96.80,5z')
    expect(screen.getByText('Zoom Earth').closest('a')?.getAttribute('href')).toBe(zoomEarthUrl(loc))
    expect(screen.getByText('Zoom Earth').closest('a')?.getAttribute('href')).not.toContain('12,128')
    expect(v).toEqual({ lat: 32.78, lon: -96.8, zoom: 5 })
  })
})

describe('sentence case', () => {
  it('KEEP_CAPS is case-insensitive and canonical (DepEd stays DepEd)', () => {
    expect(sentenceCase('DEPED SUSPENDS CLASSES IN CEBU')).toBe('DepEd suspends classes in Cebu')
  })
  it('handles possessives', () => {
    expect(sentenceCase("PAGASA'S LATEST BULLETIN FOR LUZON")).toBe("PAGASA's latest bulletin for Luzon")
  })
  it('keeps storm names capitalised', () => {
    expect(sentenceCase('TYPHOON PAENG NEARS LUZON')).toBe('Typhoon Paeng nears Luzon')
    expect(sentenceCase('TROPICAL STORM NALGAE HITS BOHOL')).toBe('Tropical storm Nalgae hits Bohol')
    expect(sentenceCase('SUPER TYPHOON ROLLY LANDFALL')).toBe('Super typhoon Rolly landfall')
    expect(sentenceCase('TROPICAL DEPRESSION AGATON WEAKENS')).toBe('Tropical depression Agaton weakens')
  })
})

describe('Assistant weather says when the forecast is old', () => {
  beforeEach(async () => { await db.kv.clear() })
  const P = { lat: 9.645705, lon: 123.877951 }
  it('fresh: "now"', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(openMeteoFixture({ now: new Date() })), { status: 200 }))
    expect(await weatherSummary(P, f as unknown as typeof fetch)).toMatch(/ now\./)
  })
  it('cached because the network failed: "as of HH:MM", never "now"', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify(openMeteoFixture({ now: new Date() })), { status: 200 }))
    await weatherSummary({ lat: 9.65, lon: 123.88 }, ok as unknown as typeof fetch)
    const bad = vi.fn(async () => { throw new Error('offline') })
    // force past the 10-minute freshness window by backdating the cached row
    const key = 'weather.forecast.9.65,123.88'
    const row = (await db.kv.get(key))!.value as { fetchedAt: string }
    row.fetchedAt = new Date(Date.now() - 3600_000).toISOString()
    await db.kv.put({ key, value: row })
    const s = await weatherSummary({ lat: 9.65, lon: 123.88 }, bad as unknown as typeof fetch)
    expect(s).toMatch(/ as of \d{1,2}:\d{2} (AM|PM)\./)
    expect(s).not.toMatch(/ now/)
  })
})
