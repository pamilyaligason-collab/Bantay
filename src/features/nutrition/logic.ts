import type { FoodEntry, Meal, NutritionGoal, WaterEntry } from '../log/store'
import foodsJson from './foods.json'

// Pure rules for food, salt and water. No storage, no React. Unknown is null, never 0.

export interface Food {
  key: string; name: string; tl: string; serving_label: string
  kcal: number | null; sodium_mg: number | null; potassium_mg: number | null; protein_g: number | null
  src: string; estimate?: boolean
}
export const FOODS = foodsJson as Food[]
const BY_KEY = new Map(FOODS.map((f) => [f.key, f]))
export const foodByKey = (key: string | null | undefined): Food | undefined => (key ? BY_KEY.get(key) : undefined)

export const MEALS: { id: Meal; tl: string; en: string }[] = [
  { id: 'breakfast', tl: 'Almusal', en: 'Breakfast' },
  { id: 'lunch', tl: 'Tanghalian', en: 'Lunch' },
  { id: 'dinner', tl: 'Hapunan', en: 'Dinner' },
  { id: 'snack', tl: 'Meryenda', en: 'Snack' }
]
/** The meal that fits the clock: before 10 breakfast, to 3 pm lunch, to 5 pm snack, to 10 pm dinner, later a snack. */
export const mealAt = (d: Date): Meal => { const h = d.getHours(); return h < 5 ? 'snack' : h < 10 ? 'breakfast' : h < 15 ? 'lunch' : h < 17 ? 'snack' : h < 22 ? 'dinner' : 'snack' }

export const PORTIONS = [
  { id: 'small', label: 'Small', value: 0.5 },
  { id: 'normal', label: 'Normal', value: 1 },
  { id: 'large', label: 'Large', value: 1.5 }
] as const
/** The one-tap salty items (keys in foods.json). */
export const SALTY_KEYS = ['patis', 'toyo', 'bagoong', 'tuyo', 'instant_noodles'] as const

export const ML_PER_TAP = 250
export const DEFAULT_GOAL = { sodiumMg: 2000, waterMl: 1500 }
/** 2000 mg is the WHO ceiling for adults, 1500 mg the lower option. A doctor's number wins. */
export const SODIUM_OPTIONS = [2000, 1500] as const
export const GOAL_NOTE = 'Ask your doctor about your salt limit'
export const WHO_SALT_URL = 'https://www.who.int/news-room/fact-sheets/detail/salt-reduction'

/** 1,204 */
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
export const dayKey = (d: Date | string) => { const x = typeof d === 'string' ? new Date(d) : d; return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
const shiftDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12)

/** Nutrient x portion, or null when the nutrient is unknown. */
export const scale = (v: number | null | undefined, portion: number, decimals = 0): number | null => {
  if (!finite(v) || !finite(portion)) return null
  const f = 10 ** decimals
  return Math.round(v * portion * f) / f
}

/** A food, a portion and a meal become the row we keep: the numbers are already multiplied, so a later change to the food list never rewrites history. */
export function snapshot(food: Food, portion: number, meal: Meal, personId: string, at: Date, clientId: string): FoodEntry {
  return {
    clientId, personId, eatenAt: at.toISOString(), meal, foodKey: food.key, name: food.name, portion, servingLabel: food.serving_label,
    kcal: scale(food.kcal, portion), sodiumMg: scale(food.sodium_mg, portion), potassiumMg: scale(food.potassium_mg, portion), proteinG: scale(food.protein_g, portion, 1)
  }
}

/** Sum of the known values; null when none is known (never 0). */
const sumKnown = (xs: (number | null | undefined)[]): number | null => {
  const known = xs.filter(finite)
  return known.length ? known.reduce((a, b) => a + b, 0) : null
}
export interface Totals { kcal: number | null; sodiumMg: number | null; potassiumMg: number | null; proteinG: number | null; count: number }
export function dailyTotals(entries: FoodEntry[]): Totals {
  const p = sumKnown(entries.map((e) => e.proteinG))
  return {
    kcal: sumKnown(entries.map((e) => e.kcal)), sodiumMg: sumKnown(entries.map((e) => e.sodiumMg)),
    potassiumMg: sumKnown(entries.map((e) => e.potassiumMg)), proteinG: p == null ? null : Math.round(p * 10) / 10, count: entries.length
  }
}

export const onDay = <T extends { eatenAt?: string; drunkAt?: string }>(rows: T[], day: Date): T[] => {
  const k = dayKey(day)
  return rows.filter((r) => dayKey((r.eatenAt ?? r.drunkAt)!) === k)
}

/** The foods that gave the most sodium, biggest first (several servings of one food add up). Foods with unknown sodium are left out. */
export function topSodium(entries: FoodEntry[], n = 3): { key: string; name: string; tl: string | null; sodiumMg: number }[] {
  const by = new Map<string, { key: string; name: string; tl: string | null; sodiumMg: number }>()
  for (const e of entries) {
    if (!finite(e.sodiumMg) || e.sodiumMg <= 0) continue
    const k = e.foodKey ?? `name:${e.name}`
    const cur = by.get(k)
    if (cur) cur.sodiumMg += e.sodiumMg
    else by.set(k, { key: k, name: e.name, tl: foodByKey(e.foodKey)?.tl ?? null, sodiumMg: e.sodiumMg })
  }
  return [...by.values()].sort((a, b) => b.sodiumMg - a.sodiumMg || a.name.localeCompare(b.name)).slice(0, n)
}

/** Salt in grams from sodium in mg (salt = sodium x 2.5), one decimal. */
export const saltGrams = (mg: number | null | undefined): number | null => (finite(mg) ? Math.round((mg * 2.5) / 100) / 10 : null)

export type Band = 'none' | 'under' | 'near' | 'over'
/** Under 80% of the goal is Under, from 80% up to the goal is Near, the goal or more is Over. No sodium logged: none. */
export function goalBand(mg: number | null | undefined, goal: number): Band {
  if (!finite(mg) || !finite(goal) || goal <= 0) return 'none'
  const r = mg / goal
  return r >= 1 ? 'over' : r >= 0.8 ? 'near' : 'under'
}
export const BAND_WORD: Record<Exclude<Band, 'none'>, string> = { under: 'Under', near: 'Near', over: 'Over' }
/** How full the bar is, 0 to 100. */
export const fillPct = (mg: number | null | undefined, goal: number): number => (finite(mg) && finite(goal) && goal > 0 ? Math.max(0, Math.min(100, Math.round((mg / goal) * 100))) : 0)

export const goalOf = (g: Pick<NutritionGoal, 'sodiumMg' | 'waterMl'> | undefined | null) => ({
  sodiumMg: finite(g?.sodiumMg) && g!.sodiumMg > 0 ? g!.sodiumMg : DEFAULT_GOAL.sodiumMg,
  waterMl: finite(g?.waterMl) && g!.waterMl > 0 ? g!.waterMl : DEFAULT_GOAL.waterMl
})

export const waterTotal = (rows: WaterEntry[]): number => rows.reduce((a, r) => a + (finite(r.ml) ? r.ml : 0), 0)

/** The same meal as yesterday, as new rows for `now`: same foods, same portions, a new client id each. Empty when yesterday had none. */
export function copyMeal(entries: FoodEntry[], meal: Meal, now: Date, newId: () => string): FoodEntry[] {
  const y = dayKey(shiftDays(now, -1))
  return entries.filter((e) => e.meal === meal && dayKey(e.eatenAt) === y).map(({ id: _id, ...e }) => ({ ...e, clientId: newId(), eatenAt: now.toISOString() }))
}

/** Daily sodium for the chart: one point per day that has a known sodium value (days with nothing logged are gaps, not 0). Oldest first. */
export function dailySodium(entries: FoodEntry[], now: Date, days = 7): { takenAt: string; value: number }[] {
  const out: { takenAt: string; value: number }[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = shiftDays(now, -i)
    const t = dailyTotals(onDay(entries, d))
    if (t.sodiumMg != null) out.push({ takenAt: d.toISOString(), value: t.sodiumMg })
  }
  return out
}

/** The foods used most recently, newest first, no repeats. */
export function recentFoods(entries: FoodEntry[], n = 6): Food[] {
  const seen = new Set<string>()
  const out: Food[] = []
  for (const e of [...entries].sort((a, b) => b.eatenAt.localeCompare(a.eatenAt))) {
    const f = foodByKey(e.foodKey)
    if (f && !seen.has(f.key)) { seen.add(f.key); out.push(f); if (out.length >= n) break }
  }
  return out
}

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Search by Tagalog or English name; every word typed must be in the name. */
export function searchFoods(q: string, list: Food[] = FOODS): Food[] {
  const words = plain(q).split(/\s+/).filter(Boolean)
  if (!words.length) return list
  return list.filter((f) => { const hay = plain(`${f.tl} ${f.name}`); return words.every((w) => hay.includes(w)) })
}

/** How the portion reads on a row: 0.5 half, 1 one, 1.5 one and a half. */
export const portionWord = (p: number) => (p === 0.5 ? 'Small' : p === 1.5 ? 'Large' : p === 1 ? 'Normal' : `x${p}`)
