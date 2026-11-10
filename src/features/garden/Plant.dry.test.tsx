import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Drought } from './drought'
const useType = vi.hoisted(() => ({ t: 4 as 1 | 2 | 3 | 4 }))
const h = vi.hoisted(() => ({ province: 'Bohol' as string | null, dr: null as Drought | null | undefined }))
vi.mock('./climate', async (orig) => ({ ...(await orig<typeof import('./climate')>()), useClimate: () => ({ type: useType.t, guess: false, ready: true, pick: vi.fn(), picked: null, province: h.province }) }))
vi.mock('./daPrices', async (orig) => ({ ...(await orig<typeof import('./daPrices')>()), useDaPrices: () => null }))
vi.mock('./drought', async (orig) => ({ ...(await orig<typeof import('./drought')>()), useDrought: () => h.dr }))
import { anyTolerant, DROUGHT_TOLERANT, PlantCard, PlantPoster, plantList, plantTiles } from './Plant'

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 9, 12, 0, 0)) }) // local midday, 9 Nov 2026 (ML-38)
afterEach(() => { vi.useRealTimers(); cleanup(); h.dr = null; h.province = 'Bohol'; useType.t = 4 })

const row = (issued: string, levels: [string, Drought['months'][number]['level']][]): Drought => ({
  province: 'Bohol', issued_at: issued, saved: false, months: levels.map(([month, level], i) => ({ month, level, kind: i === 0 ? 'assessment' : 'outlook' as const }))
})
// PAGASA's real Bohol outlook issued 3 Nov 2026 (assessment Oct, then Nov not affected, Dec dry condition, Jan dry spell, Feb drought)
const BOHOL = row('2026-11-03', [['2026-10', 'not_affected'], ['2026-11', 'not_affected'], ['2026-12', 'dry_condition'], ['2027-01', 'dry_spell'], ['2027-02', 'drought']])
const NOTE = 'Because of the dry spell in Bohol, these crops cope with less water.'

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
  })
})

describe('S29 C fix: the dry note never claims tolerance falsely', () => {
  const names = (type: 1 | 2 | 3 | 4, month: number) => { const l = plantList(type, month, true); return plantTiles(l.guided, l.others, true).map((t) => ('g' in t ? t.g.calendar : t.name)) }
  it('every climate type and month: a tolerant crop in season always shows among the three tiles, and none shows when none is in season', () => {
    for (const type of [1, 2, 3, 4] as const) for (let m = 1; m <= 12; m++) {
      const l = plantList(type, m, true), tiles = plantTiles(l.guided, l.others, true)
      const inSeason = [...l.guided.map((g) => g.calendar), ...l.others.map((o) => o.name)]
      expect(anyTolerant(tiles), `type ${type} month ${m}`).toBe(inSeason.some((n) => DROUGHT_TOLERANT.includes(n)))
    }
  })
  it('type 2 in February: a tolerant crop leads; type 1 in August: the tip, not the claim', () => {
    expect(names(2, 2)[0]).toBe('Cowpea')
    expect(names(1, 8).some((n) => DROUGHT_TOLERANT.includes(n))).toBe(false)
    vi.setSystemTime(new Date(2026, 7, 9, 12, 0, 0))
    h.dr = row('2026-08-03', [['2026-07', 'not_affected'], ['2026-08', 'dry_spell'], ['2026-09', 'drought']])
    useType.t = 1
    render(<PlantCard />)
    expect(screen.getByTestId('plant-dry').textContent).toBe('Dry spell in Bohol: water early in the morning and mulch to keep the soil damp.')
  })
})
