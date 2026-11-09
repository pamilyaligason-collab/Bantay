import { readFileSync, statSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClimateType } from '../../data/provinceClimate'
import type { DaPrices, DaRow } from './daPrices'
const h = vi.hoisted(() => ({ type: 4 as number | null, guess: false, ready: true, pick: vi.fn(), d: null as DaPrices | null | undefined }))
vi.mock('./climate', async (orig) => ({ ...(await orig<typeof import('./climate')>()), useClimate: () => ({ type: h.type, suggested: null, guess: h.guess, ready: h.ready, pick: h.pick, picked: null }) }))
vi.mock('./daPrices', async (orig) => ({ ...(await orig<typeof import('./daPrices')>()), useDaPrices: () => h.d }))
import { resolveClimate, cropsFor, provinceNameAt } from './climate'
import { PlantCard, PlantPoster, PLANT_FOOTER, plantList } from './Plant'
import { VEG_GUIDE } from './vegGuide'

const r = (commodity: string, price_php: number, specification = ''): DaRow => ({ price_date: '2026-11-08', commodity, specification, unit: 'kg', price_php })
const PRICES: DaPrices = { date: '2026-11-08', saved: false, rows: [r('Pole Sitao', 109.3), r('Bitter Gourd (Ampalaya)', 109.77, '4-5 pcs/kg'), r('Cucumber, Native/Local', 111.23), r('Cabbage (Rare Ball), Local', 168.75), r('Bottle Gourd (Upo)', 57.28), r('Chayote, Local', 49.46)] }

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(2026, 10, 9, 12, 0, 0)) }) // local midday, 9 Nov 2026 (ML-38)
afterEach(() => { vi.useRealTimers(); cleanup(); h.type = 4; h.guess = false; h.ready = true; h.d = null; h.pick.mockClear() })

describe('climate rule', () => {
  it('the province decides, uncertain ones too; a pick counts only where no province answers or in the province it was made in', () => {
    const sure = { type: 4 as const, uncertain: false }, unsure = { type: 2 as const, uncertain: true }
    expect(resolveClimate(sure, null, 'A')).toEqual({ type: 4, suggested: null, guess: false })
    expect(resolveClimate(unsure, null, 'A')).toEqual({ type: 2, suggested: null, guess: true })
    expect(resolveClimate(sure, { type: 3, province: 'A' }, 'A').type).toBe(3) // pick made here
    expect(resolveClimate(sure, { type: 3, province: 'A' }, 'B').type).toBe(4) // moved: automatic again
    expect(resolveClimate(null, { type: 3, province: 'A' }, null).type).toBe(3) // province unknown: latest pick
    expect(resolveClimate(sure, 3, 'A').type).toBe(4) // legacy bare number: ignored once a province resolves
    expect(resolveClimate(null, 3, null).type).toBe(3)
    expect(resolveClimate(null, null, null)).toEqual({ type: null, suggested: null, guess: false })
  })
  it('cropsFor reads the bulletin: type 4 in November lists sitaw, ampalaya, pipino, repolyo, upo and sayote (calendar names)', () => {
    const names = cropsFor(4, 11).map((c) => c.name)
    for (const n of ['Yardlong bean', 'Bitter gourd', 'Cucumber', 'Cabbage', 'Bottle gourd', 'Chayote']) expect(names).toContain(n)
    expect(plantList(4, 11).guided.map((g) => g.name)).toEqual(['Sitaw', 'Ampalaya', 'Pipino', 'Repolyo', 'Upo', 'Sayote'])
  })
  it('every guide crop name exists in the calendar (a rename in the data would drop a poster silently)', () => {
    const all = new Set([1, 2, 3, 4].flatMap((t) => Array.from({ length: 12 }, (_, m) => cropsFor(t as ClimateType, m + 1).map((c) => c.name)).flat()))
    for (const g of VEG_GUIDE) expect(all.has(g.calendar), g.calendar).toBe(true)
  })
  it('provinceNameAt uses the parent province of a city', () => {
    const sq = (c: number): number[][][][] => [[[[c, c], [c + 1, c], [c + 1, c + 1], [c, c + 1], [c, c]]]]
    const units = [
      { code: 'P', name: 'South Cotabato', bbox: [0, 0, 10, 10] as [number, number, number, number], polys: [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]] },
      { code: 'C', name: 'City of General Santos', parent: 'P', bbox: [4, 4, 5, 5] as [number, number, number, number], polys: sq(4) }
    ]
    expect(provinceNameAt({ lat: 4.5, lon: 4.5 }, units)).toBe('South Cotabato')
    expect(provinceNameAt({ lat: 8, lon: 8 }, units)).toBe('South Cotabato')
    expect(provinceNameAt({ lat: 50, lon: 50 }, units)).toBeNull()
  })
})

describe('Plant this month card', () => {
  it('shows three photo tiles with the DA price and opens the poster page', () => {
    h.d = PRICES
    const { container } = render(<PlantCard />)
    expect(screen.getByRole('heading', { name: 'Plant this month' })).toBeTruthy()
    const tiles = Array.from(container.querySelectorAll('.gpl-tile'))
    expect(tiles.map((x) => x.textContent)).toEqual(['Sitaw₱109.30/kg', 'Ampalaya₱109.77/kg', 'Pipino₱111.23/kg'])
    expect(tiles.every((x) => x.querySelector('img')!.getAttribute('alt'))).toBe(true)
    expect(screen.getByTestId('plant-card').getAttribute('href')).toBe('#garden/plant')
    expect(container.textContent).toContain('November, climate type 4 · DA prices, Metro Manila')
    expect(container.textContent).toContain('Sitaw: first harvest in 45 to 50 days after sowing.')
    expect(screen.getByRole('link', { name: `See all ${cropsFor(4, 11).length}` }).getAttribute('href')).toBe('#garden/plant')
  })
  it('without prices the tiles show no price and the label does not claim DA prices', () => {
    h.d = null
    const { container } = render(<PlantCard />)
    expect(Array.from(container.querySelectorAll('.gpl-tile')).map((x) => x.textContent)).toEqual(['Sitaw', 'Ampalaya', 'Pipino'])
    expect(container.textContent).not.toContain('DA prices')
  })
  it('another month: crops without a guide show their name and "Guide coming" on a photo-less tile', () => {
    vi.setSystemTime(new Date(2026, 1, 9, 12, 0, 0)) // February, type 4
    const { container } = render(<PlantCard />)
    const bare = container.querySelectorAll('.gpl-tile--bare')
    expect(bare.length).toBeGreaterThan(0)
    for (const b of Array.from(bare)) { expect(b.querySelector('img')).toBeNull(); expect(b.textContent).toContain('Guide coming') }
  })
  it('climate unknown: the card asks "Pick your area\'s climate type" with types 1 to 4 and remembers the pick', () => {
    h.type = null
    render(<PlantCard />)
    expect(screen.getByText("Pick your area's climate type")).toBeTruthy()
    expect(screen.getAllByRole('button').map((b) => b.querySelector('b')!.textContent)).toEqual(['Type 1', 'Type 2', 'Type 3', 'Type 4'])
    expect(screen.getByRole('button', { name: /Type 4.*evenly/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Type 2/ }))
    expect(h.pick).toHaveBeenCalledWith(2)
  })
  it('uncertain province: the type is used and the sub line says it comes from the province', () => {
    h.guess = true
    const { container } = render(<PlantCard />)
    expect(container.textContent).toContain('November, climate type 4 (from your province)')
  })
  it('renders nothing until the climate is settled (no picker flash)', () => {
    h.ready = false
    const { container } = render(<PlantCard />)
    expect(container.innerHTML).toBe('')
  })
})

describe('poster page', () => {
  it('has one poster per November vegetable with price, variety, days, land prep and credits, and the footer', () => {
    h.d = PRICES
    const { container } = render(<PlantPoster />)
    expect(container.querySelectorAll('article.gpl-poster')).toHaveLength(6)
    const sitaw = screen.getByTestId('poster-Yardlong bean')
    expect(sitaw.textContent).toContain('₱109.30/kg')
    expect(sitaw.textContent).toContain('NSIC PS 03, Sandigan, Sierra Madre')
    expect(sitaw.textContent).toContain('45 to 50 days after sowing')
    expect(sitaw.textContent).toContain('Land prep: Plough 15 to 20 cm deep')
    expect(sitaw.textContent).toContain('Photo: David, public domain (Wikimedia Commons). Guide: DA Region 2.')
    expect(screen.getByTestId('poster-Bitter gourd').textContent).toContain('Photo: Katja Schulz, CC BY 2.0, cropped (Wikimedia Commons). Guide: Bureau of Plant Industry.')
    expect(screen.getByTestId('poster-Cabbage').textContent).toContain('Balajijagadesh, CC BY-SA 3.0')
    expect(screen.getByTestId('poster-Chayote').textContent).toContain('Gaurav Dhwaj Khadka, CC BY-SA 4.0')
    expect(screen.getByTestId('poster-Bottle gourd').textContent).toContain('Yoko Nekonomania, CC BY 2.0')
    expect(screen.getByTestId('poster-Cucumber').textContent).toContain('NPS, public domain')
    expect(screen.getByTestId('poster-Cabbage').textContent).toContain('₱168.75/kg')
    expect(container.querySelector('.gpl-foot')!.textContent).toContain(PLANT_FOOTER)
    expect(PLANT_FOOTER).toBe('General guide from the planting calendar of PCARRD, now PCAARRD (bulletin 200, 2000), with data from the Bureau of Plant Industry.')
    const links = Array.from(container.querySelectorAll('.gpl-credit a')).filter((a) => a.getAttribute('href')!.includes('wikimedia'))
    expect(links).toHaveLength(6)
    const deeds = Array.from(container.querySelectorAll('.gpl-credit a')).map((a) => a.getAttribute('href')).filter((h) => h!.includes('creativecommons'))
    expect(deeds.sort()).toEqual(['https://creativecommons.org/licenses/by-sa/3.0/', 'https://creativecommons.org/licenses/by-sa/4.0/', 'https://creativecommons.org/licenses/by/2.0/', 'https://creativecommons.org/licenses/by/2.0/'])
    expect(screen.getByTestId('poster-Chayote').textContent).toContain('CC BY-SA 4.0, cropped')
    expect(screen.getByTestId('poster-Yardlong bean').textContent).not.toContain('cropped')
    expect(container.textContent).toContain('60 to 75 days after sowing')
    expect(container.textContent).toContain('Common varieties')
    expect(container.textContent).toContain('PLANT THIS MONTH')
    expect(links.every((a) => a.getAttribute('href')!.startsWith('https://commons.wikimedia.org/wiki/File:') && a.getAttribute('rel')!.includes('noopener'))).toBe(true)
    expect(container.querySelectorAll('.gpl-hero')).toHaveLength(1) // one hero shadow per screen
  })
  it('sayote carries the highland warning; the others do not', () => {
    h.d = PRICES
    const { container } = render(<PlantPoster />)
    expect(screen.getByTestId('poster-Chayote').querySelector('[role="note"]')!.textContent).toContain('Grows best in cool upland areas (about 1,000 m and up). In hot lowlands it may flower and fruit poorly.')
    expect(container.querySelectorAll('[role="note"]')).toHaveLength(1)
  })
  it('a price that does not match is hidden, never 0', () => {
    h.d = { date: '2026-11-08', saved: false, rows: [r('Pole Sitao', 109.3)] }
    const { container } = render(<PlantPoster />)
    expect(container.querySelectorAll('.gpl-price')).toHaveLength(1)
    expect(container.textContent).not.toMatch(/₱0\b/)
    h.d = null
    cleanup()
    expect(render(<PlantPoster />).container.querySelectorAll('.gpl-price')).toHaveLength(0)
  })
  it('crops of the month without a guide are listed as "Guide coming"', () => {
    const { container } = render(<PlantPoster />)
    const more = screen.getByTestId('plant-others')
    expect(more.textContent).toContain('Guide coming')
    expect(more.textContent).toContain('Talong')
    expect(container.querySelectorAll('article')).toHaveLength(6)
  })
  it('climate unknown: the page shows the picker and no posters; Change climate type re-opens it', () => {
    h.type = null
    const { container } = render(<PlantPoster />)
    expect(screen.getByTestId('climate-picker')).toBeTruthy()
    expect(container.querySelectorAll('article')).toHaveLength(0)
    cleanup(); h.type = 4
    render(<PlantPoster />)
    expect(screen.queryByTestId('climate-picker')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Change climate type/ }))
    expect(screen.getByTestId('climate-picker')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Type 1/ }))
    expect(h.pick).toHaveBeenCalledWith(1)
  })
})

describe('photos', () => {
  it('six webp files, each under 60 KB, one per guide entry', () => {
    for (const n of ['ampalaya', 'upo', 'repolyo', 'sayote', 'pipino', 'sitaw']) expect(statSync(`src/features/garden/img/${n}.webp`).size, n).toBeLessThan(60_000)
    expect(VEG_GUIDE).toHaveLength(6)
  })
  it('its class names are global CSS: none is defined in any other stylesheet', () => {
    const own = new Set(readFileSync('src/features/garden/garden.css', 'utf8').match(/\.gpl-[\w-]+/g))
    const others = import.meta.glob('../../**/*.css', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    for (const [path, css] of Object.entries(others)) {
      if (path.endsWith('/garden.css')) continue
      for (const c of own) expect(css.includes(c), `${c} also in ${path}`).toBe(false)
    }
  })
})
