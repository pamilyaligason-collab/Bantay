import { readFileSync } from 'node:fs'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import climate from '../../data/provinceClimate.json'
import { PROVINCES } from '../../../supabase/functions/pagasa-drought/provinces'
import type { Unit } from '../safety/unitAt'

const UNITS = (JSON.parse(readFileSync('public/geo/units.json', 'utf8')) as { units: Unit[] }).units
const h = vi.hoisted(() => ({ loc: { lat: 14.5995, lon: 120.9842 } as { lat: number | null; lon: number | null }, asked: [] as (string | null)[] }))
vi.mock('./useLocation', () => ({ useLocation: () => h.loc }))
vi.mock('../safety/unitAt', async (orig) => ({ ...(await orig<typeof import('../safety/unitAt')>()), loadUnits: async () => UNITS }))
vi.mock('../shell/useKv', () => ({ useKv: () => [null, vi.fn(), true] }))
vi.mock('../garden/drought', async (orig) => ({
  ...(await orig<typeof import('../garden/drought')>()),
  // the Climate card asks for the outlook of the province the place resolves to; this stands in for the pagasa_drought read
  useDrought: (province: string | null) => { h.asked.push(province); return province === 'Metro Manila' ? { province, issued_at: '2026-11-03T00:00:00Z', saved: false, months: [{ month: '2026-11', level: 'not_affected', kind: 'outlook' }, { month: '2026-12', level: 'dry_condition', kind: 'outlook' }, { month: '2027-01', level: 'dry_spell', kind: 'outlook' }] } : province ? null : undefined }
}))
import ClimateCard from '../garden/ClimateCard'
import { placeProvince, provinceFromName } from './province'

afterEach(() => { cleanup(); h.asked = [] })

describe('province names', () => {
  it('the app list and the edge function list are the same 83 names, and each resolves to itself', () => {
    const names = Object.keys(climate.provinces)
    expect(names).toHaveLength(83)
    expect([...PROVINCES].sort()).toEqual([...names].sort())
    for (const n of names) {
      expect(provinceFromName(n), n).toBe(n)
      expect(provinceFromName(n.toUpperCase()), n).toBe(n)
    }
  })
  it('Manila and every NCR city read Metro Manila', () => {
    for (const n of ['Manila', 'City of Manila', 'NCR', 'National Capital Region', 'Metropolitan Manila', 'Quezon City', 'Makati', 'Pasig', 'Taguig', 'Caloocan', 'Muntinlupa', 'Las Piñas', 'Parañaque', 'Pateros']) expect(provinceFromName(n), n).toBe('Metro Manila')
  })
  it('a city uses its province and an old name its new one; an unknown name is null', () => {
    expect(provinceFromName('City of Isabela')).toBe('Basilan') // not Isabela province
    expect(provinceFromName('Isabela')).toBe('Isabela')
    expect(provinceFromName('City of Davao')).toBe('Davao del Sur')
    expect(provinceFromName('General Santos City')).toBe('South Cotabato')
    expect(provinceFromName('Compostela Valley')).toBe('Davao de Oro')
    expect(provinceFromName('Atlantis')).toBeNull()
    expect(provinceFromName(null)).toBeNull()
  })
  it('every unit of the offline map resolves to a PAGASA name (so none leaves the Climate card empty)', () => {
    const ok = new Set(Object.keys(climate.provinces))
    for (const u of UNITS) {
      const name = provinceFromName(UNITS.find((x) => x.code === u.parent)?.name ?? u.name)
      expect(name && ok.has(name), u.name).toBe(true)
    }
  })
  it('real points: Manila, Quezon City, Makati, Pasig, Taguig and Caloocan are Metro Manila; GenSan, Davao and Tagbilaran keep their provinces', async () => {
    for (const [lat, lon] of [[14.5995, 120.9842], [14.676, 121.0437], [14.5547, 121.0244], [14.5764, 121.0851], [14.5176, 121.0509], [14.6507, 120.9667]]) expect(await placeProvince({ lat: lat!, lon: lon! }), `${lat},${lon}`).toBe('Metro Manila')
    expect(await placeProvince({ lat: 6.1164, lon: 125.1716 })).toBe('South Cotabato')
    expect(await placeProvince({ lat: 7.0731, lon: 125.6128 })).toBe('Davao del Sur')
    expect(await placeProvince({ lat: 9.6478, lon: 123.8556 })).toBe('Bohol')
    expect(await placeProvince({ lat: 0, lon: 0 })).toBeNull()
  })
})

describe('Climate card follows the place', () => {
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })
  it('a Manila point shows the Metro Manila outlook, not "not available yet"; moving to Bohol asks Bohol', async () => {
    const { rerender } = render(<ClimateCard />); await flush()
    expect(h.asked).toContain('Metro Manila')
    expect(screen.queryByText('Climate outlook not available yet.')).toBeNull()
    expect(screen.getByText(/Metro Manila · PAGASA/)).toBeTruthy()
    h.loc = { lat: 9.6478, lon: 123.8556 }
    rerender(<ClimateCard />); await flush()
    expect(h.asked.at(-1)).toBe('Bohol')
  })
})
