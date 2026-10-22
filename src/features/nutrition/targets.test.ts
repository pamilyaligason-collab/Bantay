import { describe, expect, it } from 'vitest'
import type { FoodEntry } from '../log/store'
import { customFood, dailyTotals, favouriteFoods, foodByKey, isHighSalt, plateTotals, snapshot, unknownCount } from './logic'
import { nutrientRows, segments, targetsFor } from './targets'

const base = { sodiumMg: 2000, potassiumLimitMg: null }
const row = (o: Partial<FoodEntry>): FoodEntry => ({ clientId: Math.random().toString(), personId: 'p', eatenAt: '2026-10-21T04:00:00Z', meal: 'lunch', foodKey: null, name: 'x', portion: 1, servingLabel: null, kcal: null, sodiumMg: null, potassiumMg: null, proteinG: null, ...o })

describe('targets by age and sex (NIH ODS / NASEM reference intakes)', () => {
  it('a woman of 60 and a man of 40', () => {
    const w = targetsFor({ ...base, age: 60, sex: 'female' })
    expect(w.missing).toBeNull()
    expect(w.targets).toMatchObject({ calciumMg: { amount: 1200 }, ironMg: { amount: 8 }, magnesiumMg: { amount: 320 }, vitdUg: { amount: 15 }, b12Ug: { amount: 2.4 }, fiberG: { amount: 21 }, proteinG: { amount: 46 }, potassiumMg: { amount: 2600, kind: 'reach' }, carbsG: { amount: 130 } })
    const m = targetsFor({ ...base, age: 40, sex: 'male' })
    expect(m.targets).toMatchObject({ calciumMg: { amount: 1000 }, ironMg: { amount: 8 }, magnesiumMg: { amount: 420 }, fiberG: { amount: 38 }, proteinG: { amount: 56 }, potassiumMg: { amount: 3400 } })
  })
  it('the age steps: iron falls for women at 51, vitamin D rises at 71, calcium rises for men at 71', () => {
    expect(targetsFor({ ...base, age: 50, sex: 'female' }).targets.ironMg!.amount).toBe(18)
    expect(targetsFor({ ...base, age: 51, sex: 'female' }).targets.ironMg!.amount).toBe(8)
    expect(targetsFor({ ...base, age: 70, sex: 'male' }).targets.vitdUg!.amount).toBe(15)
    expect(targetsFor({ ...base, age: 71, sex: 'male' }).targets.vitdUg!.amount).toBe(20)
    expect(targetsFor({ ...base, age: 70, sex: 'male' }).targets.calciumMg!.amount).toBe(1000)
    expect(targetsFor({ ...base, age: 71, sex: 'male' }).targets.calciumMg!.amount).toBe(1200)
    expect(targetsFor({ ...base, age: 30, sex: 'female' }).targets.magnesiumMg!.amount).toBe(310)
  })
  it('sodium is always the person goal as a limit; saturated fat is a limit', () => {
    const t = targetsFor({ ...base, sodiumMg: 1500, age: 70, sex: 'male' }).targets
    expect(t.sodiumMg).toEqual({ amount: 1500, kind: 'limit' })
    expect(t.satFatG!.kind).toBe('limit')
  })
  it('no age, no sex, or a child gives no guessed targets: only the salt limit', () => {
    for (const [p, why] of [[{ age: null, sex: 'female' as const }, 'age'], [{ age: 70, sex: null }, 'sex'], [{ age: 12, sex: 'male' as const }, 'adult']] as const) {
      const r = targetsFor({ ...base, ...p })
      expect(r.missing).toBe(why)
      expect(Object.keys(r.targets)).toEqual(['sodiumMg'])
    }
  })
  it('a doctor-set potassium limit replaces the potassium target, with or without age and sex', () => {
    expect(targetsFor({ age: 70, sex: 'male', sodiumMg: 2000, potassiumLimitMg: 2500 }).targets.potassiumMg).toEqual({ amount: 2500, kind: 'limit' })
    expect(targetsFor({ age: null, sex: null, sodiumMg: 2000, potassiumLimitMg: 2500 }).targets.potassiumMg).toEqual({ amount: 2500, kind: 'limit' })
  })
})

describe('segments: food first, supplements after, null is not 0', () => {
  const reach = { amount: 1000, kind: 'reach' as const }
  it('food and supplement fill one bar and never pass 100%', () => {
    expect(segments({ food: 400, supp: 200, target: reach })).toMatchObject({ foodPct: 40, suppPct: 20, totalPct: 60, reached: false })
    expect(segments({ food: 900, supp: 500, target: reach })).toMatchObject({ foodPct: 90, suppPct: 10, totalPct: 140, reached: true })
    expect(segments({ food: 1500, supp: 500, target: reach })).toMatchObject({ foodPct: 100, suppPct: 0, reached: true })
  })
  it('supplement alone counts when no food has a number; no numbers at all is an empty bar', () => {
    expect(segments({ food: null, supp: 500, target: reach })).toMatchObject({ foodPct: 0, suppPct: 50, totalPct: 50 })
    expect(segments({ food: null, supp: null, target: reach })).toEqual({ foodPct: 0, suppPct: 0, totalPct: null, reached: false, over: false })
  })
  it('a limit has no supplement segment and goes over at 100%', () => {
    const lim = { amount: 2000, kind: 'limit' as const }
    expect(segments({ food: 1500, supp: 800, target: lim })).toMatchObject({ foodPct: 75, suppPct: 0, over: false })
    expect(segments({ food: 2100, supp: null, target: lim })).toMatchObject({ foodPct: 100, over: true })
    expect(segments({ food: null, supp: null, target: lim }).totalPct).toBeNull()
  })
  it('no target means no bar', () => {
    expect(segments({ food: 5, supp: null, target: null }).totalPct).toBeNull()
  })
  it('rows join totals, targets and supplements; only supplement-capable nutrients take a supplement', () => {
    const totals = dailyTotals([row({ calciumMg: 300, sodiumMg: 1000 })])
    const rows = nutrientRows(totals, targetsFor({ ...base, age: 60, sex: 'female' }).targets, { calciumMg: 500, sodiumMg: 99 }, { calciumMg: 0 })
    const get = (id: string) => rows.find((r) => r.def.id === id)!
    expect(get('calciumMg')).toMatchObject({ food: 300, supp: 500 })
    expect(get('sodiumMg').supp).toBeNull()
    expect(get('vitdUg')).toMatchObject({ food: null, supp: null })
    expect(nutrientRows(totals, targetsFor({ ...base, age: 60, sex: 'female' }).targets, { vitdUg: 0 }, {}).find((r) => r.def.id === 'vitdUg')!.supp).toBeNull()
  })
})

describe('meal totals with the new nutrients', () => {
  it('sums known values only; a nutrient nobody logged is null, and unknownCount says how many rows lack it', () => {
    const t = dailyTotals([row({ carbsG: 10.5, vitdUg: null }), row({ carbsG: 4.25 }), row({ carbsG: null })])
    expect(t.carbsG).toBe(14.8)
    expect(t.vitdUg).toBeNull()
    expect(unknownCount([row({ carbsG: 1 }), row({}), row({ carbsG: null })], 'carbsG')).toBe(2)
    expect(dailyTotals([]).b12Ug).toBeNull()
  })
  it('a snapshot multiplies the new nutrients and keeps null null', () => {
    const f = foodByKey('chicken_adobo')!
    const e = snapshot(f, 2, 'lunch', 'p', new Date(), 'c')
    expect(e.carbsG).toBe(Math.round(f.carbs_g! * 2 * 10) / 10)
    expect(e.vitdUg).toBeNull()
    expect(snapshot(f, 2, 'lunch', 'p', new Date(), 'c').ironMg).toBe(Math.round(f.iron_mg! * 2 * 10) / 10)
  })
  it('an own food has every nutrient blank: it adds nothing, not 0', () => {
    const e = snapshot(customFood('  Lola\'s kakanin '), 1.5, 'snack', 'p', new Date(), 'c')
    expect(e).toMatchObject({ name: 'Lola\'s kakanin', foodKey: null, servingLabel: null, kcal: null, sodiumMg: null, carbsG: null, b12Ug: null })
    expect(plateTotals([{ food: customFood('x'), portion: 1 }]).sodiumMg).toBeNull()
  })
  it('the plate adds its salt to a plain meal and still ignores the unknown one', () => {
    const rice = foodByKey('rice_white')!
    const t = plateTotals([{ food: rice, portion: 2 }, { food: customFood('x'), portion: 1 }])
    expect(t.sodiumMg).toBe(Math.round(rice.sodium_mg! * 2))
  })
  it('high salt means 460 mg or more a serving (20% of the 2300 mg Daily Value); unknown is not high', () => {
    expect(isHighSalt({ sodium_mg: 460 })).toBe(true)
    expect(isHighSalt({ sodium_mg: 459 })).toBe(false)
    expect(isHighSalt({ sodium_mg: null })).toBe(false)
    expect(isHighSalt(foodByKey('patis')!)).toBe(true)
    expect(isHighSalt(foodByKey('rice_white')!)).toBe(false)
  })
  it('favourites need two meals and come most-eaten first', () => {
    const r = (k: string) => row({ foodKey: k })
    expect(favouriteFoods([r('toyo'), r('patis'), r('patis'), r('rice_white'), r('rice_white'), r('rice_white')]).map((f) => f.key)).toEqual(['rice_white', 'patis'])
    expect(favouriteFoods([r('toyo')])).toEqual([])
  })
})
