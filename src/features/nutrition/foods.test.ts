import { describe, expect, it } from 'vitest'
import { buildFoods, FIELDS, perServing, type Recipes } from '../../../scripts/nutrition/recipeMath.mjs'
import recipes from '../../../scripts/nutrition/recipes.json'
import recipesRaw from '../../../scripts/nutrition/recipes.json?raw'
import foodsRaw from './foods.json?raw'
import { FOODS, SALTY_KEYS, foodByKey } from './logic'

const R = recipes as unknown as Recipes

describe('foods.json schema', () => {
  it('holds 100 to 120 foods with unique keys', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(100)
    expect(FOODS.length).toBeLessThanOrEqual(120)
    expect(new Set(FOODS.map((f) => f.key)).size).toBe(FOODS.length)
  })
  it('every entry has the agreed fields and sane numbers (null is allowed for unknown, 0 is not used for unknown)', () => {
    for (const f of FOODS) {
      expect(f.key, f.key).toMatch(/^[a-z0-9_]{1,40}$/)
      for (const s of [f.name, f.tl, f.serving_label, f.src]) expect(typeof s === 'string' && s.trim().length > 0, f.key).toBe(true)
      for (const n of [f.kcal, f.sodium_mg, f.potassium_mg, f.protein_g]) expect(n === null || (typeof n === 'number' && Number.isFinite(n) && n >= 0), f.key).toBe(true)
      expect(f.kcal, f.key).toBeLessThan(1500)
      expect(f.sodium_mg, f.key).toBeLessThan(4000)
      expect(f.estimate === undefined || f.estimate === true, f.key).toBe(true)
      expect(Object.keys(f).every((k) => ['key', 'name', 'tl', 'serving_label', 'kcal', 'sodium_mg', 'potassium_mg', 'protein_g', 'src', 'estimate'].includes(k)), f.key).toBe(true)
    }
  })
  it('credits USDA SR Legacy and nothing else (no PhilFCT / FNRI values)', () => {
    // verified foods credit USDA; unverified ones say they are estimates to be checked against USDA (never PhilFCT/FNRI)
    for (const f of FOODS) expect(f.src, f.key).toMatch(f.estimate ? /^Estimate, to be checked against USDA FoodData Central$/ : /^(USDA SR Legacy|Recipe estimate from USDA SR Legacy ingredients)$/)
    expect(/philfct|fnri/i.test(foodsRaw + recipesRaw)).toBe(false)
  })
  it('has the salty one-tap items and the key Filipino dishes', () => {
    for (const k of SALTY_KEYS) expect(foodByKey(k), k).toBeTruthy()
    for (const k of ['chicken_adobo', 'sinigang_baboy', 'tinola', 'pancit_canton', 'lugaw', 'arroz_caldo', 'champorado', 'longganisa', 'tocino', 'tuyo', 'daing_bangus', 'sardines_canned', 'sinangag', 'instant_noodles']) expect(foodByKey(k), k).toBeTruthy()
  })
  it('the salty items are salty: patis, toyo and bagoong over 800 mg a tablespoon, instant noodles over 1000 mg a pack', () => {
    expect(foodByKey('patis')!.sodium_mg).toBeGreaterThan(1000)
    expect(foodByKey('toyo')!.sodium_mg).toBeGreaterThan(800)
    expect(foodByKey('bagoong')!.sodium_mg).toBeGreaterThan(800)
    expect(foodByKey('instant_noodles')!.sodium_mg).toBeGreaterThan(1000)
    expect(foodByKey('rice_white')!.sodium_mg).toBeLessThan(10)
  })
})

describe('recipe maths is reproducible from scripts/nutrition/recipes.json', () => {
  it('foods.json is exactly what the recipes produce', () => {
    expect(FOODS).toEqual(buildFoods(R))
  })
  it('a dish is the sum of its ingredients per gram', () => {
    // tocino: 80 g pork + 12 g sugar + 1.2 g salt + 5 g soy + 4 g oil
    const i = R.ingredients
    const na = i.pork_shoulder_raw!.sodium_mg! * 0.8 + i.sugar!.sodium_mg! * 0.12 + i.salt!.sodium_mg! * 0.012 + i.soy_sauce!.sodium_mg! * 0.05 + i.oil_veg!.sodium_mg! * 0.04
    expect(foodByKey('tocino')!.sodium_mg).toBe(Math.round(na))
  })
  it('every ingredient has all four numbers and a way to look it up (fdc id or an FDC name)', () => {
    for (const [k, ing] of Object.entries(R.ingredients)) {
      for (const f of FIELDS) expect(typeof (ing as unknown as Record<string, unknown>)[f] === 'number', `${k}.${f}`).toBe(true)
      expect(ing.fdc != null || (ing.fdcName ?? '').length > 5, k).toBe(true)
    }
  })
  it('an unknown ingredient value makes the dish value null, never 0; bad grams and unknown keys throw', () => {
    const ing = { a: { kcal: 100, sodium_mg: null, potassium_mg: 5, protein_g: 1 }, b: { kcal: 50, sodium_mg: 10, potassium_mg: 5, protein_g: 1 } }
    expect(perServing([['a', 100], ['b', 100]], ing)).toEqual({ kcal: 150, sodium_mg: null, potassium_mg: 10, protein_g: 2 })
    expect(() => perServing([['zz', 10]], ing)).toThrow(/unknown ingredient/)
    expect(() => perServing([['a', 0]], ing)).toThrow(/bad grams/)
  })
  it('estimate stays true until every ingredient is verified', () => {
    const one: Recipes = { ingredients: { a: { kcal: 1, sodium_mg: 1, potassium_mg: 1, protein_g: 1, verified: true } }, foods: [{ key: 'x', name: 'X', tl: 'X', serving_label: '1', parts: [['a', 100]] }] }
    expect(buildFoods(one)[0]!.estimate).toBeUndefined()
    one.ingredients.a!.verified = false
    expect(buildFoods(one)[0]!.estimate).toBe(true)
  })
})
