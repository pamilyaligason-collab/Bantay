import type { NutrientField } from './logic'

// Daily nutrient targets by age and sex. Pure, no React. Unknown is null: with no age or sex the table gives no target, it does not guess.
// Every number below is a published reference intake for healthy adults (19+). It is information, not a prescription: a doctor's number wins.
// Sources, all public: NIH Office of Dietary Supplements fact sheets (Calcium, Iron, Magnesium, Potassium, Vitamin D, Vitamin B12 - "Health Professional" versions),
// the National Academies Dietary Reference Intakes summary tables (protein, carbohydrate, fibre) at https://www.ncbi.nlm.nih.gov/books/NBK56068/ ,
// WHO sodium (https://www.who.int/news-room/fact-sheets/detail/salt-reduction) and WHO saturated fat (https://www.who.int/news-room/fact-sheets/detail/healthy-diet). Listed in docs/SOURCES.md.

export type Sex = 'female' | 'male'
export interface Target { amount: number; kind: 'reach' | 'limit' }
export type Targets = Partial<Record<NutrientField, Target>>

export interface NutrientDef {
  id: NutrientField; label: string; tl: string; unit: 'mg' | 'g' | 'mcg'
  /** A supplement can add to this nutrient (calcium, iron, vitamin D, B12). */
  supp?: boolean
  /** Public page that backs the target. */
  source: string
}
const ODS = 'https://ods.od.nih.gov/factsheets/'
const DRI = 'https://www.ncbi.nlm.nih.gov/books/NBK56068/'
/** The nutrients that get a bar, in the order shown. */
export const BAR_NUTRIENTS: NutrientDef[] = [
  { id: 'sodiumMg', label: 'Sodium', tl: 'Asin', unit: 'mg', source: 'https://www.who.int/news-room/fact-sheets/detail/salt-reduction' },
  { id: 'potassiumMg', label: 'Potassium', tl: 'Potasyo', unit: 'mg', source: `${ODS}Potassium-HealthProfessional/` },
  { id: 'proteinG', label: 'Protein', tl: 'Protina', unit: 'g', source: DRI },
  { id: 'carbsG', label: 'Carbohydrate', tl: 'Karbohidrat', unit: 'g', source: DRI },
  { id: 'fiberG', label: 'Fibre', tl: 'Hibla', unit: 'g', source: DRI },
  { id: 'satFatG', label: 'Saturated fat', tl: 'Taba', unit: 'g', source: 'https://www.who.int/news-room/fact-sheets/detail/healthy-diet' },
  { id: 'calciumMg', label: 'Calcium', tl: 'Kalsyum', unit: 'mg', supp: true, source: `${ODS}Calcium-HealthProfessional/` },
  { id: 'ironMg', label: 'Iron', tl: 'Bakal', unit: 'mg', supp: true, source: `${ODS}Iron-HealthProfessional/` },
  { id: 'magnesiumMg', label: 'Magnesium', tl: 'Magnesium', unit: 'mg', source: `${ODS}Magnesium-HealthProfessional/` },
  { id: 'vitdUg', label: 'Vitamin D', tl: 'Bitamina D', unit: 'mcg', supp: true, source: `${ODS}VitaminD-HealthProfessional/` },
  { id: 'b12Ug', label: 'Vitamin B12', tl: 'Bitamina B12', unit: 'mcg', supp: true, source: `${ODS}VitaminB12-HealthProfessional/` }
]
/** Shown as plain amounts with no bar: there is no single daily target for them. */
export const INFO_NUTRIENTS: { id: NutrientField; label: string; tl: string; unit: string }[] = [
  { id: 'kcal', label: 'Energy', tl: 'Calorya', unit: 'kcal' },
  { id: 'fatG', label: 'Total fat', tl: 'Taba (kabuuan)', unit: 'g' },
  { id: 'sugarsG', label: 'Sugars', tl: 'Asukal', unit: 'g' }
]

/** Whole-year ages where the adult tables apply. Under 19 gets no targets (children and teenagers have other tables). */
export const ADULT_AGE = 19
/** 10% of a 2,000 kcal reference diet: 22 g. WHO: less than 10% of energy from saturated fat. */
export const SAT_FAT_LIMIT_G = 22
/** What was assumed, in words, for the footnote. */
export const TARGET_NOTE = 'Targets are reference intakes for healthy adults from the NIH and WHO. They are not a prescription: your doctor\'s numbers come first. Not for pregnancy or for children.'

export interface TargetsResult { targets: Targets; /** Why the age/sex-based targets are missing, or null when they are there. */ missing: null | 'age' | 'sex' | 'adult' }

/** Targets for one person. Sodium is always the person's own goal (WHO 2000 mg unless changed); a doctor-set potassium limit replaces the potassium target. */
export function targetsFor(p: { age: number | null; sex: Sex | null; sodiumMg: number; potassiumLimitMg: number | null }): TargetsResult {
  const targets: Targets = { sodiumMg: { amount: p.sodiumMg, kind: 'limit' } }
  if (p.potassiumLimitMg != null) targets.potassiumMg = { amount: p.potassiumLimitMg, kind: 'limit' }
  const { age, sex } = p
  if (age == null) return { targets, missing: 'age' }
  if (age < ADULT_AGE) return { targets, missing: 'adult' }
  if (sex == null) return { targets, missing: 'sex' }
  const f = sex === 'female'
  const reach = (amount: number): Target => ({ amount, kind: 'reach' })
  if (targets.potassiumMg == null) targets.potassiumMg = reach(f ? 2600 : 3400) // AI, NASEM 2019 (ODS potassium)
  targets.proteinG = reach(f ? 46 : 56) // RDA for 19+ at the reference weight
  targets.carbsG = reach(130) // RDA, adults
  targets.fiberG = reach(f ? (age >= 51 ? 21 : 25) : (age >= 51 ? 30 : 38)) // AI
  targets.satFatG = { amount: SAT_FAT_LIMIT_G, kind: 'limit' }
  targets.calciumMg = reach(f ? (age >= 51 ? 1200 : 1000) : (age >= 71 ? 1200 : 1000)) // RDA
  targets.ironMg = reach(f && age < 51 ? 18 : 8) // RDA
  targets.magnesiumMg = reach(f ? (age <= 30 ? 310 : 320) : (age <= 30 ? 400 : 420)) // RDA
  targets.vitdUg = reach(age >= 71 ? 20 : 15) // RDA, 600 IU to 70 and 800 IU after
  targets.b12Ug = reach(2.4) // RDA
  return { targets, missing: null }
}

export interface NutrientRow {
  def: NutrientDef
  /** From food (null = no number logged). */
  food: number | null
  /** From supplements taken today (null = no supplement for it, or no amount on the medicine list). */
  supp: number | null
  target: Target | null
  /** Meals logged today with no number for this nutrient, so the total may be low. */
  unknown: number
}
export interface Segments { foodPct: number; suppPct: number; totalPct: number | null; reached: boolean; over: boolean }

/** Bar fill. Food first, the supplement segment after it, the two never past 100%. A limit has no supplement segment and goes `over` at 100% or more. No target or no number: empty. */
export function segments(r: Pick<NutrientRow, 'food' | 'supp' | 'target'>): Segments {
  const none: Segments = { foodPct: 0, suppPct: 0, totalPct: null, reached: false, over: false }
  const t = r.target
  if (!t || !(t.amount > 0)) return none
  const food = r.food ?? 0
  const supp = t.kind === 'reach' ? (r.supp ?? 0) : 0
  if (r.food == null && (t.kind === 'limit' || r.supp == null)) return none
  const totalPct = Math.round(((food + supp) / t.amount) * 100)
  const foodPct = Math.min(100, Math.round((food / t.amount) * 100))
  const suppPct = Math.max(0, Math.min(100 - foodPct, Math.round((supp / t.amount) * 100)))
  return { foodPct, suppPct, totalPct, reached: t.kind === 'reach' && totalPct >= 100, over: t.kind === 'limit' && totalPct >= 100 }
}

/** The rows of the nutrients view: today's totals, supplement amounts and targets joined. */
export function nutrientRows(totals: Record<NutrientField, number | null>, targets: Targets, supp: Partial<Record<NutrientField, number | null>>, unknown: Partial<Record<NutrientField, number>>): NutrientRow[] {
  return BAR_NUTRIENTS.map((def) => ({ def, food: totals[def.id] ?? null, supp: def.supp ? (supp[def.id] ?? null) : null, target: targets[def.id] ?? null, unknown: unknown[def.id] ?? 0 }))
}
