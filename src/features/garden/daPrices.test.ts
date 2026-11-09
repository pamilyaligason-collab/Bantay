import { beforeEach, describe, expect, it, vi } from 'vitest'
const h = vi.hoisted(() => ({ kv: new Map<string, unknown>(), fail: false, dates: [] as { price_date: string }[], rows: [] as unknown[] }))
vi.mock('../../db', () => ({ db: { kv: { get: async (k: string) => (h.kv.has(k) ? { key: k, value: h.kv.get(k) } : undefined), put: async (r: { key: string; value: unknown }) => { h.kv.set(r.key, r.value) } } } }))
vi.mock('../auth/client', () => ({
  supabase: {
    from: () => {
      let rowsQuery = false
      const q: Record<string, unknown> = {
        select: (cols: string) => { rowsQuery = cols.includes('commodity'); return q },
        order: () => q, eq: () => q,
        limit: async () => (h.fail ? { data: null, error: { message: 'x' } } : { data: rowsQuery ? h.rows : h.dates, error: null })
      }
      return q
    }
  }
}))
import { commonItems, groupOf, groupRows, loadDaPrices, priceDay, priceFor, priceText, resetDaPrices, type DaRow } from './daPrices'

const r = (commodity: string, price_php: number, specification = '', unit: DaRow['unit'] = 'kg'): DaRow => ({ price_date: '2026-11-08', commodity, specification, unit, price_php })
const LIST = [r('Bitter Gourd (Ampalaya)', 109.77, '4-5 pcs/kg'), r('Cabbage (Rare Ball), Local', 168.75), r('Cabbage, Imported', 99), r('Chayote, Local', 49.46, 'Medium (301-400 gm)'), r('Galunggong (Round Scad), Local', 260), r('Pork Liempo, Local', 380.5), r('Red Onion, Imported', 90), r('Red Onion, Local', 250), r('Regular Milled Rice', 52), r('Egg, Chicken', 9.5, 'Medium', 'piece')]

beforeEach(() => { h.kv.clear(); h.fail = false; h.dates = [{ price_date: '2026-11-08' }]; h.rows = LIST; resetDaPrices() })

describe('da_prices read', () => {
  it('reads the newest day, saves it and returns it as live (not saved)', async () => {
    const d = await loadDaPrices(1_000)
    expect(d).toMatchObject({ date: '2026-11-08', saved: false })
    expect(d!.rows).toHaveLength(LIST.length)
    expect(h.kv.has('today.daPrices')).toBe(true)
  })
  it('numeric strings from the database become numbers; bad rows are dropped', async () => {
    h.rows = [{ ...LIST[0]!, price_php: '109.77' }, { ...LIST[1]!, price_php: 0 }, { ...LIST[2]!, unit: 'bag' }, { commodity: '' }]
    const d = await loadDaPrices(2_000)
    expect(d!.rows.map((x) => x.price_php)).toEqual([109.77])
  })
  it('an empty table reads as null (the card hides)', async () => {
    h.dates = []
    expect(await loadDaPrices(3_000)).toBeNull()
  })
  it('a failed read falls back to the saved list with its date, and to null when nothing is saved or it is older than 30 days', async () => {
    await loadDaPrices(1_000)
    h.fail = true; resetDaPrices()
    expect(await loadDaPrices(2_000)).toMatchObject({ date: '2026-11-08', saved: true })
    resetDaPrices()
    expect(await loadDaPrices(1_000 + 31 * 86_400_000)).toBeNull()
    h.kv.clear(); resetDaPrices()
    expect(await loadDaPrices(2_000)).toBeNull()
  })
})

describe('price helpers', () => {
  it('priceDay and priceText', () => {
    expect(priceDay('2026-11-08')).toBe('Nov 8')
    expect(priceDay('2026-12-25')).toBe('Dec 25')
    expect(priceText(r('x', 109.7))).toBe('₱109.70/kg')
    expect(priceText(r('x', 9.5, '', 'piece'))).toBe('₱9.50 each')
    expect(priceText(r('x', 80, '', 'liter'))).toBe('₱80.00/liter')
  })
  it('priceFor tries the patterns in order and never returns an imported row', () => {
    expect(priceFor(LIST, [/^cabbage \(rare ball\)/i, /^cabbage.*local/i])!.price_php).toBe(168.75)
    expect(priceFor([r('Cabbage, Imported', 1)], [/^cabbage/i])).toBeNull()
    expect(priceFor(LIST, [/nothing/i])).toBeNull()
    expect(priceFor(LIST, [/^chayote/i])!.price_php).toBe(49.46)
  })
  it('commonItems: rice, galunggong, liempo, red onion (local) in that order', () => {
    expect(commonItems(LIST).map((i) => [i.label, i.row.price_php])).toEqual([['Rice, regular milled', 52], ['Galunggong', 260], ['Pork liempo', 380.5], ['Red onion', 250]])
  })
  it('commonItems fills up to four from the first rows when a match is missing, and is empty for no rows', () => {
    const few = [r('Okra', 80), r('Eggplant', 70), r('Regular Milled Rice', 52), r('Ginger', 120), r('Tomato', 60)]
    const out = commonItems(few)
    expect(out).toHaveLength(4)
    expect(out.map((i) => i.row.commodity)).toEqual(['Regular Milled Rice', 'Okra', 'Eggplant', 'Ginger'])
    expect(commonItems([])).toEqual([])
  })
  it('groupRows: fixed group order, A to Z inside, empty groups left out', () => {
    const g = groupRows(LIST)
    expect(g.map((x) => x.group)).toEqual(['Rice and corn', 'Fish and seafood', 'Meat', 'Chicken and eggs', 'Vegetables', 'Garlic, onion and spices'])
    expect(g.find((x) => x.group === 'Vegetables')!.rows.map((x) => x.commodity)).toEqual(['Bitter Gourd (Ampalaya)', 'Cabbage (Rare Ball), Local', 'Cabbage, Imported', 'Chayote, Local'])
    expect(groupOf('Unknown thing')).toBe('Other')
  })
})
