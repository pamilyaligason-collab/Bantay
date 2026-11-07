import { ML_PER_TAP } from './logic'

/** D-144: a daily drinks goal that fits the person, not a fixed 6 glasses. General guidance, not a prescription.
 *  Sources: EFSA 2010 (Scientific Opinion on Dietary Reference Values for water): adequate intake of TOTAL water per day is
 *  2.0 L for women and 2.5 L for men aged 14+, 1.3 L for ages 1-3, 1.6 L for 4-8, 2.1 L (boys) and 1.9 L (girls) for 9-13.
 *  About 80% of total water comes from drinks, so the drinks target is 80% of those values (1600 ml women, 2000 ml men).
 *  With a known weight (14+ or age unknown): 30 ml per kg, kept between 1500 and 3000 ml (a common clinical rule of thumb).
 *  Unknown sex and no weight: 1800 ml, the midpoint of the two adult values. A doctor's fluid limit always wins.
 *  Under 1 year: no goal at all (null). Babies under 6 months take breast milk or formula, not water, and 6-12 months is led by the baby's doctor.
 *  Age 70+: the weight rule never goes above the sex default (older adults are more often on fluid limits). */
export interface WaterPerson { ageYears?: number | null; sex?: 'female' | 'male' | null; weightKg?: number | null; fluidLimitMl?: number | null }
export type WaterSource = 'limit' | 'weight' | 'sex' | 'child' | 'default'

const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0 // unknown is null, never 0
const known = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 // an age of 0 is a real age (a baby)

/** Total-water AI x 0.8 for 1-13 year olds (EFSA 2010). */
function childMl(age: number, sex: 'female' | 'male' | null): number {
  if (age < 4) return 1040
  if (age < 9) return 1280
  return sex === 'female' ? 1520 : 1680 // unknown sex takes the higher (boys) value: the safer drink-enough side
}

export function waterGoal(p: WaterPerson): { ml: number; glasses: number; source: WaterSource } | null {
  if (known(p.ageYears) && p.ageYears < 1) return null // no water goal under 1 year
  const sexMl = p.sex === 'female' ? 1600 : p.sex === 'male' ? 2000 : 1800
  let ml: number, source: WaterSource
  if (known(p.ageYears) && p.ageYears < 14) { ml = childMl(p.ageYears, p.sex ?? null); source = 'child' }
  else if (ok(p.weightKg)) {
    ml = Math.min(3000, Math.max(1500, Math.round(p.weightKg * 30))); source = 'weight'
    if (known(p.ageYears) && p.ageYears >= 70) ml = Math.min(ml, sexMl)
  }
  else if (p.sex === 'female' || p.sex === 'male') { ml = sexMl; source = 'sex' }
  else { ml = 1800; source = 'default' }
  ml = Math.max(4 * ML_PER_TAP, ml) // at least 4 glasses
  // with a limit the glasses round DOWN so the goal never asks for more than the doctor allows (a limit under one glass still shows 1)
  if (ok(p.fluidLimitMl) && ml > p.fluidLimitMl) return { ml: p.fluidLimitMl, glasses: goalGlasses(p.fluidLimitMl, 'limit'), source: 'limit' }
  return { ml, glasses: goalGlasses(ml, source), source }
}
/** Glasses for a goal: a doctor's limit rounds DOWN so a goal never asks for more than the limit allows, else nearest. One rule for every screen. */
export const goalGlasses = (ml: number, source?: string): number => Math.max(1, (source === 'limit' ? Math.floor : Math.round)(ml / ML_PER_TAP))
export const waterGoalMl = (p: WaterPerson): number | null => waterGoal(p)?.ml ?? null
