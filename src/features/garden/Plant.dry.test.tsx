import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Drought } from './drought'
const useType = vi.hoisted(() => ({ t: 4 as 1 | 2 | 3 | 4 }))
const h = vi.hoisted(() => ({ province: 'Bohol' as string | null, dr: null as Drought | null | undefined }))
vi.mock('./climate', async (orig) => ({ ...(await orig<typeof import('./climate')>()), useClimate: () => ({ type: useType.t, guess: false, ready: true, pick: vi.fn(), picked: null, province: h.province }) }))
vi.mock('./daPrices', async (orig) => ({ ...(await orig<typeof import('./daPrices')>()), useDaPrices: () => null }))
vi.mock('./drought', async (orig) => ({ ...(await orig<typeof import('./drought')>()), useDrought: () => h.dr }))
import { DROUGHT_TOLERANT, dryText, PlantCard, PlantPoster, plantList, plantTiles } from './Plant'

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 9, 12, 0, 0)) }) // local midday, 9 Nov 2026 (ML-38)
afterEach(() => { vi.useRealTimers(); cleanup(); h.dr = null; h.province = 'Bohol'; useType.t = 4 })

const row = (issued: string, levels: [string, Drought['months'][number]['level']][]): Drought => ({
  province: 'Bohol', issued_at: issued, saved: false, months: levels.map(([month, level], i) => ({ month, level, kind: i === 0 ? 'assessment' : 'outlook' as const }))
})
// PAGASA's real Bohol outlook issued 3 Nov 2026 (assessment Oct, then Nov not affected, Dec dry condition, Jan dry spell, Feb drought)
const BOHOL = row('2026-11-03', [['2026-10', 'not_affected'], ['2026-11', 'not_affected'], ['2026-12', 'dry_condition'], ['2027-01', 'dry_spell'], ['2027-02', 'drought']])
const NOTE = 'Because of the dry spell in Bohol, Sitaw copes with less water.' // type 4, November: sitaw (yardlong bean) is the one tolerant crop shown
const TIP = 'Dry spell in Bohol: water early in the morning and mulch to keep the soil damp.'

describe('S29 C: dry spell in the outlook', () => {
  it('a dry spell within this month and the next two: the note shows on the card and on the poster page', () => {
    h.dr = BOHOL
    const { container, unmount } = render(<PlantCard />)
    expect(screen.getByTestId('plant-dry').textContent).toBe(NOTE)
    expect(container.querySelector('.gpl-sub')!.nextElementSibling!.textContent).toBe(NOTE) // directly under the sub-line
    unmount()
    render(<PlantPoster />)
    expect(screen.getByTestId('plant-dry').textContent).toBe(NOTE)
  })
  it('no note without a dry month in the window, with no outlook, an old one, or no province', () => {
    h.dr = row('2026-11-03', [['2026-10', 'not_affected'], ['2026-11', 'not_affected'], ['2026-12', 'dry_condition'], ['2027-01', 'not_affected'], ['2027-02', 'drought']]) // the drought is the 4th month: outside Nov to Jan
    render(<PlantCard />).unmount()
    expect(screen.queryByTestId('plant-dry')).toBeNull()
    h.dr = null
    render(<PlantCard />).unmount()
    expect(screen.queryByTestId('plant-dry')).toBeNull()
    h.dr = row('2026-08-01', [['2026-07', 'not_affected'], ['2026-11', 'drought']]) // issued over 60 days before 9 Nov
    render(<PlantCard />).unmount()
    expect(screen.queryByTestId('plant-dry')).toBeNull()
    h.dr = BOHOL; h.province = null
    render(<PlantCard />)
    expect(screen.queryByTestId('plant-dry')).toBeNull()
  })
  it('crops that cope with less water go first in each group; the poster order of the guided ones stays', () => {
    expect(plantList(4, 2).others.map((o) => o.name)).toEqual(['Celery', 'Garlic', 'Lettuce', 'Okra', 'Waterleaf'])
    expect(plantList(4, 2, true).others.map((o) => o.name)).toEqual(['Okra', 'Celery', 'Garlic', 'Lettuce', 'Waterleaf'])
    expect(plantList(4, 11, true).guided.map((g) => g.name)).toEqual(['Sitaw', 'Ampalaya', 'Pipino', 'Repolyo', 'Upo', 'Sayote']) // sitaw (yardlong bean) is the one tolerant guided crop and already leads
    expect(plantList(4, 11, true).others.slice(0, 3).map((o) => o.name)).toEqual(['Cowpea', 'Lima bean', 'Watermelon'])
  })
  it('February, dry spell ahead: the first tile is okra', () => {
    vi.setSystemTime(new Date(2026, 1, 9, 12, 0, 0))
    h.dr = row('2026-02-03', [['2026-01', 'not_affected'], ['2026-02', 'dry_spell'], ['2026-03', 'drought']])
    const { container } = render(<PlantCard />)
    expect(container.querySelector('.gpl-tile')!.textContent).toBe('OkraGuide coming')
    expect(screen.getByTestId('plant-dry').textContent).toBe('Because of the dry spell in Bohol, Okra copes with less water.')
  })
})

describe('S29 C fix r3: tiles, note, line and credit agree', () => {
  const tilesOf = (type: 1 | 2 | 3 | 4, month: number) => { const l = plantList(type, month, true); return { l, tiles: plantTiles(l.guided, l.others) } }
  const label = (t: ReturnType<typeof plantTiles>[number]) => ('g' in t ? t.g.name : t.name)
  it('every climate type and month: a guided crop in season always puts a photo tile first, and the note names exactly the tolerant crops shown', () => {
    for (const type of [1, 2, 3, 4] as const) for (let m = 1; m <= 12; m++) {
      const { l, tiles } = tilesOf(type, m)
      if (l.guided.length) expect('g' in tiles[0]!, `type ${type} month ${m}`).toBe(true)
      const shown = tiles.filter((t) => DROUGHT_TOLERANT.includes('g' in t ? t.g.calendar : t.name)).map(label)
      const text = dryText('Bohol', tiles)
      if (shown.length) shown.slice(0, 2).forEach((n) => expect(text).toContain(n)); else expect(text).toBe(TIP)
    }
  })
  it('the wording: one name, two names, none', () => {
    expect(dryText('Bohol', [{ name: 'Okra' }, { name: 'Celery' }, { name: 'Garlic' }])).toBe('Because of the dry spell in Bohol, Okra copes with less water.')
    expect(dryText('Bohol', [{ name: 'Cowpea' }, { name: 'Celery' }, { name: 'Okra' }])).toBe('Because of the dry spell in Bohol, Cowpea and Okra cope with less water.')
    expect(dryText('Bohol', [{ name: 'Celery' }, { name: 'Garlic' }, { name: 'Lettuce' }])).toBe(TIP)
  })
  it('type 2, February, dry outlook: the three guided tiles lead (no tolerant crop has a guide), so the tip shows; the line and the credit follow the first tile', () => {
    vi.setSystemTime(new Date(2026, 1, 9, 12, 0, 0))
    h.dr = row('2026-02-03', [['2026-01', 'not_affected'], ['2026-02', 'dry_spell'], ['2026-03', 'drought']])
    useType.t = 2
    const { container } = render(<PlantCard />)
    const tiles = Array.from(container.querySelectorAll('.gpl-tile'))
    expect(tiles.map((t) => t.textContent)).toEqual(['Ampalaya', 'Repolyo', 'Upo'])
    expect(tiles.every((t) => !!t.querySelector('img'))).toBe(true)
    expect(screen.getByTestId('plant-dry').textContent).toBe(TIP)
    expect(container.querySelector('.gpl-line')!.textContent).toMatch(/^Ampalaya: first harvest in /)
    expect(screen.getByTestId('plant-photos').textContent).toBe('Photos: Wikimedia Commons, see credits')
  })
  it('type 4, February (no guided crop): no photo, so no credit and a plain line; the note names okra only', () => {
    vi.setSystemTime(new Date(2026, 1, 9, 12, 0, 0))
    h.dr = row('2026-02-03', [['2026-01', 'not_affected'], ['2026-02', 'dry_spell'], ['2026-03', 'drought']])
    const { container } = render(<PlantCard />)
    expect(Array.from(container.querySelectorAll('.gpl-tile')).map((t) => t.textContent)).toEqual(['OkraGuide coming', 'CeleryGuide coming', 'GarlicGuide coming'])
    expect(screen.getByTestId('plant-dry').textContent).toBe('Because of the dry spell in Bohol, Okra copes with less water.')
    expect(container.querySelector('.gpl-line')!.textContent).toBe('Tap to see what to plant in February.')
    expect(screen.queryByTestId('plant-photos')).toBeNull()
  })
  it('poster page, type 4 February: the first group on screen is the bare list, so it names Okra', () => {
    vi.setSystemTime(new Date(2026, 1, 9, 12, 0, 0))
    h.dr = row('2026-02-03', [['2026-01', 'not_affected'], ['2026-02', 'dry_spell'], ['2026-03', 'drought']])
    render(<PlantPoster />)
    expect(screen.getByTestId('plant-dry').textContent).toBe('Because of the dry spell in Bohol, Okra copes with less water.')
  })
  it('poster page, type 2 February: the first group on screen is the guided one with no tolerant crop, so the tip', () => {
    vi.setSystemTime(new Date(2026, 1, 9, 12, 0, 0))
    h.dr = row('2026-02-03', [['2026-01', 'not_affected'], ['2026-02', 'dry_spell'], ['2026-03', 'drought']])
    useType.t = 2
    render(<PlantPoster />)
    expect(screen.getByTestId('plant-dry').textContent).toBe(TIP)
  })
})
