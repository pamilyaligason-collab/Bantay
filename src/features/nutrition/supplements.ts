import type { Medication } from '../log/store'
import type { NutrientField } from './logic'

// Supplements come from the person's own medicine list: an active medicine whose name matches a short list of supplements. Nothing is guessed:
// an amount that is not written on the medicine (strength) stays null, and a supplement with no nutrient bar (fish oil, multivitamin) is listed, not counted.
// This is a record of what the person says they take, never advice to take or stop anything.

export interface SupplementKind { id: string; label: string; words: string[]; nutrient: NutrientField | null; unit: 'mg' | 'mcg' | null }
export const SUPPLEMENTS: SupplementKind[] = [
  { id: 'calcium', label: 'Calcium', words: ['calcium'], nutrient: 'calciumMg', unit: 'mg' },
  { id: 'vitd', label: 'Vitamin D', words: ['vitamin d', 'cholecalciferol', 'ergocalciferol'], nutrient: 'vitdUg', unit: 'mcg' },
  { id: 'b12', label: 'Vitamin B12', words: ['b12', 'b-12', 'cobalamin'], nutrient: 'b12Ug', unit: 'mcg' },
  { id: 'iron', label: 'Iron', words: ['iron', 'ferrous', 'ferric'], nutrient: 'ironMg', unit: 'mg' },
  { id: 'fishoil', label: 'Fish oil', words: ['fish oil', 'omega-3', 'omega 3'], nutrient: null, unit: null },
  { id: 'multi', label: 'Multivitamin', words: ['multivitamin', 'multi-vitamin', 'multivit'], nutrient: null, unit: null }
]

export interface SuppItem { id: string; label: string; name: string; nutrient: NutrientField | null; /** Per dose, in the nutrient's unit; null when the medicine list has no amount. */ perDose: number | null; /** Doses marked taken today. */ taken: number }

const AMOUNT = /(\d+(?:[.,]\d+)?)\s*(mcg|µg|μg|ug|mg|g|iu)\b/i
/** An amount in the unit the bar uses (mg or mcg), or null. 1 mcg of vitamin D = 40 IU (NIH ODS). A unit that does not fit the nutrient is null. */
export function amountIn(text: string | undefined, kind: SupplementKind): number | null {
  const m = text ? AMOUNT.exec(text) : null
  if (!m || !kind.unit) return null
  const n = Number(m[1]!.replace(',', '.'))
  const u = m[2]!.toLowerCase()
  if (!Number.isFinite(n) || n <= 0) return null
  const mcg = u === 'mcg' || u === 'µg' || u === 'μg' || u === 'ug' ? n : u === 'mg' ? n * 1000 : u === 'g' ? n * 1_000_000 : u === 'iu' && kind.id === 'vitd' ? n / 40 : null
  if (mcg == null) return null
  return kind.unit === 'mcg' ? Math.round(mcg * 100) / 100 : Math.round((mcg / 1000) * 100) / 100
}

/** "2 tablets" -> 2; anything else -> 1 (one dose is one dose). */
const perTake = (dose: string | undefined): number => { const m = /^(\d+(?:\.\d+)?)\s*(tab|cap|pill|softgel|piece|pc)/i.exec(dose?.trim() ?? ''); return m ? Number(m[1]) : 1 }

/** Which supplement a medicine is, or null. Matches the name or the generic name. */
export const supplementKind = (m: Pick<Medication, 'name' | 'genericName'>): SupplementKind | null => {
  const hay = `${m.name} ${m.genericName ?? ''}`.toLowerCase()
  return SUPPLEMENTS.find((s) => s.words.some((w) => hay.includes(w))) ?? null
}

/** The supplements among these (live) medicines, with the doses marked taken today. `takes` rows come from the dose log; a row matches by medication id, else by name. Skipped rows are not takes. */
export function supplementItems(meds: Medication[], takes: { name: string; medicationId?: string; skipped?: boolean }[]): SuppItem[] {
  const out: SuppItem[] = []
  for (const m of meds) {
    const kind = supplementKind(m)
    if (!kind) continue
    const taken = takes.filter((t) => !t.skipped && (t.medicationId && m.serverId ? t.medicationId === m.serverId : t.name.trim().toLowerCase() === m.name.trim().toLowerCase())).length
    const per = amountIn(m.strength, kind) ?? amountIn(m.name, kind)
    out.push({ id: m.serverId ?? m.clientId ?? m.name, label: kind.label, name: m.name, nutrient: kind.nutrient, perDose: per == null ? null : per * perTake(m.dose), taken })
  }
  return out
}

/** Amount from supplements per nutrient: doses taken x amount per dose. A nutrient with no supplement, or only supplements with no written amount, is absent (unknown), not 0. */
export function supplementTotals(items: SuppItem[]): Partial<Record<NutrientField, number>> {
  const out: Partial<Record<NutrientField, number>> = {}
  for (const i of items) {
    if (!i.nutrient || i.perDose == null) continue
    out[i.nutrient] = Math.round(((out[i.nutrient] ?? 0) + i.perDose * i.taken) * 100) / 100
  }
  return out
}
