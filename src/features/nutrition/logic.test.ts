import { describe, expect, it } from 'vitest'
import type { FoodEntry } from '../log/store'
import { BAND_WORD, copyMeal, dailySodium, dailyTotals, fillPct, foodByKey, goalBand, goalOf, mealAt, onDay, recentFoods, saltGrams, scale, searchFoods, snapshot, topSodium, waterTotal } from './logic'

const row = (o: Partial<FoodEntry> = {}): FoodEntry => ({
  clientId: 'c' + Math.random(), personId: 'p1', eatenAt: '2026-10-21T12:00:00.000Z', meal: 'lunch', foodKey: 'x', name: 'X', portion: 1, servingLabel: '1', kcal: 100, sodiumMg: 500, potassiumMg: 100, proteinG: 5, ...o
})

describe('portion snapshot', () => {
  const adobo = foodByKey('chicken_adobo')!
  it('multiplies every nutrient by the portion and keeps the portion', () => {
    const e = snapshot(adobo, 1.5, 'dinner', 'p1', new Date('2026-10-21T10:00:00Z'), 'cid')
    expect(e).toMatchObject({ clientId: 'cid', personId: 'p1', meal: 'dinner', foodKey: 'chicken_adobo', name: adobo.name, portion: 1.5, servingLabel: adobo.serving_label })
    expect(e.sodiumMg).toBe(Math.round(adobo.sodium_mg! * 1.5))
    expect(e.kcal).toBe(Math.round(adobo.kcal! * 1.5))
    expect(e.proteinG).toBe(Math.round(adobo.protein_g! * 1.5 * 10) / 10)
    expect(e.eatenAt).toBe('2026-10-21T10:00:00.000Z')
  })
  it('half a portion halves it, and a later change to the food list does not touch a saved row', () => {
    const half = snapshot(adobo, 0.5, 'lunch', 'p1', new Date(), 'c')
    expect(half.sodiumMg).toBe(Math.round(adobo.sodium_mg! / 2))
    const copy = { ...adobo, sodium_mg: 99999 }
    expect(half.sodiumMg).not.toBe(scale(copy.sodium_mg, 0.5))
  })
  it('an unknown nutrient stays null, never 0', () => {
    const f = { ...adobo, sodium_mg: null, kcal: null }
    const e = snapshot(f, 1, 'lunch', 'p1', new Date(), 'c')
    expect(e.sodiumMg).toBeNull()
    expect(e.kcal).toBeNull()
    expect(scale(undefined, 1)).toBeNull()
    expect(scale(NaN, 1)).toBeNull()
    expect(scale(10, NaN)).toBeNull()
  })
})

describe('daily totals', () => {
  it('sums the known values; a nutrient nobody knows is null', () => {
    const t = dailyTotals([row({ kcal: 100, sodiumMg: 500, proteinG: 1.2 }), row({ kcal: 250, sodiumMg: null, proteinG: 2.3 }), row({ kcal: null, sodiumMg: 700, proteinG: null })])
    expect(t).toMatchObject({ kcal: 350, sodiumMg: 1200, proteinG: 3.5, count: 3 })
    const none = dailyTotals([row({ sodiumMg: null }), row({ sodiumMg: null })])
    expect(none.sodiumMg).toBeNull()
    expect(dailyTotals([]).sodiumMg).toBeNull()
    expect(dailyTotals([]).count).toBe(0)
  })
  it('onDay keeps one local day', () => {
    const d = new Date(2026, 9, 21, 9, 0)
    const same = row({ eatenAt: new Date(2026, 9, 21, 20, 0).toISOString() })
    const other = row({ eatenAt: new Date(2026, 9, 20, 20, 0).toISOString() })
    expect(onDay([same, other], d)).toEqual([same])
  })
  it('water adds up the glasses', () => {
    expect(waterTotal([{ clientId: 'a', personId: 'p', drunkAt: 't', ml: 250 }, { clientId: 'b', personId: 'p', drunkAt: 't', ml: 250 }])).toBe(500)
    expect(waterTotal([])).toBe(0)
  })
})

describe('top 3 sodium foods', () => {
  it('ranks by total sodium, adds servings of one food, leaves out unknown and zero', () => {
    const es = [
      row({ foodKey: 'patis', name: 'Fish sauce', sodiumMg: 1413 }),
      row({ foodKey: 'rice_white', name: 'Cooked white rice', sodiumMg: 2 }),
      row({ foodKey: 'toyo', name: 'Soy sauce', sodiumMg: 879 }),
      row({ foodKey: 'toyo', name: 'Soy sauce', sodiumMg: 879 }),
      row({ foodKey: 'tuyo', name: 'Dried salted fish', sodiumMg: 1405 }),
      row({ foodKey: 'milk', name: 'Milk', sodiumMg: null }),
      row({ foodKey: 'fried_egg', name: 'Fried egg', sodiumMg: 0 })
    ]
    const top = topSodium(es)
    expect(top.map((t) => t.key)).toEqual(['toyo', 'patis', 'tuyo'])
    expect(top[0]).toMatchObject({ sodiumMg: 1758, tl: 'Toyo' })
    expect(topSodium(es, 5).map((t) => t.key)).toEqual(['toyo', 'patis', 'tuyo', 'rice_white'])
    expect(topSodium([])).toEqual([])
  })
  it('a food with no key is grouped by name', () => {
    expect(topSodium([row({ foodKey: null, name: 'Mystery', sodiumMg: 100 }), row({ foodKey: null, name: 'Mystery', sodiumMg: 50 })])).toEqual([{ key: 'name:Mystery', name: 'Mystery', tl: null, sodiumMg: 150 }])
  })
})

describe('salt conversion', () => {
  it('salt grams = sodium mg x 2.5 / 1000, one decimal', () => {
    expect(saltGrams(2000)).toBe(5)
    expect(saltGrams(1500)).toBe(3.8)
    expect(saltGrams(1204)).toBe(3)
    expect(saltGrams(400)).toBe(1)
    expect(saltGrams(0)).toBe(0)
  })
  it('unknown stays null', () => {
    expect(saltGrams(null)).toBeNull()
    expect(saltGrams(undefined)).toBeNull()
    expect(saltGrams(NaN)).toBeNull()
  })
})

describe('goal band', () => {
  it('Under below 80%, Near from 80% up to the goal, Over at the goal or more', () => {
    expect(goalBand(1599, 2000)).toBe('under')
    expect(goalBand(1600, 2000)).toBe('near')
    expect(goalBand(1999, 2000)).toBe('near')
    expect(goalBand(2000, 2000)).toBe('over')
    expect(goalBand(3500, 2000)).toBe('over')
    expect(goalBand(1200, 1500)).toBe('near')
    expect(goalBand(0, 2000)).toBe('under')
  })
  it('no sodium logged or no goal is none; words are Under / Near / Over', () => {
    expect(goalBand(null, 2000)).toBe('none')
    expect(goalBand(500, 0)).toBe('none')
    expect(BAND_WORD).toEqual({ under: 'Under', near: 'Near', over: 'Over' })
  })
  it('the bar fills from 0 to 100 and stops at the goal', () => {
    expect(fillPct(1000, 2000)).toBe(50)
    expect(fillPct(5000, 2000)).toBe(100)
    expect(fillPct(null, 2000)).toBe(0)
  })
  it('goalOf falls back to 2000 mg and 1500 ml', () => {
    expect(goalOf(undefined)).toEqual({ sodiumMg: 2000, waterMl: 1500 })
    expect(goalOf({ sodiumMg: 1500, waterMl: 2000 })).toEqual({ sodiumMg: 1500, waterMl: 2000 })
    expect(goalOf({ sodiumMg: 0, waterMl: NaN })).toEqual({ sodiumMg: 2000, waterMl: 1500 })
  })
})

describe('same as yesterday', () => {
  const now = new Date(2026, 9, 21, 8, 0)
  const y = (h: number) => new Date(2026, 9, 20, h).toISOString()
  it('copies yesterday\'s foods for that meal with new client ids and the time of now', () => {
    let n = 0
    const es = [row({ clientId: 'a', meal: 'breakfast', eatenAt: y(7), foodKey: 'pandesal' }), row({ clientId: 'b', meal: 'lunch', eatenAt: y(12) }), row({ clientId: 'c', meal: 'breakfast', eatenAt: new Date(2026, 9, 21, 7).toISOString() })]
    const copies = copyMeal(es, 'breakfast', now, () => `new${++n}`)
    expect(copies).toHaveLength(1)
    expect(copies[0]).toMatchObject({ clientId: 'new1', meal: 'breakfast', foodKey: 'pandesal', eatenAt: now.toISOString() })
    expect(copyMeal(es, 'dinner', now, () => 'x')).toEqual([])
  })
})

describe('week of sodium', () => {
  it('one point per day with a known value; days with nothing are gaps, not 0', () => {
    const now = new Date(2026, 9, 21, 20, 0)
    const at = (d: number, h = 12) => new Date(2026, 9, d, h).toISOString()
    const pts = dailySodium([row({ eatenAt: at(21), sodiumMg: 600 }), row({ eatenAt: at(21, 8), sodiumMg: 400 }), row({ eatenAt: at(19), sodiumMg: 900 }), row({ eatenAt: at(18), sodiumMg: null }), row({ eatenAt: at(5), sodiumMg: 7000 })], now, 7)
    expect(pts.map((p) => p.value)).toEqual([900, 1000])
    expect(pts.every((p) => typeof p.takenAt === 'string')).toBe(true)
  })
})

describe('helpers', () => {
  it('searches Tagalog and English names, accents and word order do not matter', () => {
    expect(searchFoods('adobo').map((f) => f.key)).toEqual(expect.arrayContaining(['chicken_adobo', 'pork_adobo']))
    expect(searchFoods('kanin').map((f) => f.key)).toContain('rice_white')
    expect(searchFoods('manok adobong').map((f) => f.key)).toContain('chicken_adobo')
    expect(searchFoods('zzzz')).toEqual([])
    expect(searchFoods('  ').length).toBeGreaterThan(90)
  })
  it('the meal follows the clock', () => {
    expect([6, 12, 16, 19, 23, 2].map((h) => mealAt(new Date(2026, 9, 21, h)))).toEqual(['breakfast', 'lunch', 'snack', 'dinner', 'snack', 'snack'])
  })
  it('recent foods are newest first without repeats', () => {
    const es = [row({ foodKey: 'patis', eatenAt: '2026-10-20T10:00:00Z' }), row({ foodKey: 'toyo', eatenAt: '2026-10-21T10:00:00Z' }), row({ foodKey: 'patis', eatenAt: '2026-10-19T10:00:00Z' }), row({ foodKey: 'nope', eatenAt: '2026-10-22T10:00:00Z' })]
    expect(recentFoods(es).map((f) => f.key)).toEqual(['toyo', 'patis'])
  })
})
