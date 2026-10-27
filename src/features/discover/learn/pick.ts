import { isLive, normaliseDrug } from '../../health/meds'
import type { Medication } from '../../log/store'
import { MEDCARDS, RECIPES, sodiumPerServing, stepText, type MedCardData } from './data'

export interface Picked { med: Medication; card: MedCardData | null }

const norm = new Map(MEDCARDS.map((c) => [c.id, new Set(c.match.map((m) => normaliseDrug(m)).filter((m): m is string => !!m))]))

/** The card a medicine row means: its normalised name (or generic name) equals one of the card's names. Null when there is no card yet. */
export function cardFor(m: Pick<Medication, 'name' | 'genericName'>): MedCardData | null {
  const names = [normaliseDrug(m.name), normaliseDrug(m.genericName)].filter((n): n is string => !!n)
  return MEDCARDS.find((c) => names.some((n) => norm.get(c.id)!.has(n))) ?? null
}

/** "Mama's medicines": every live medicine row, each with its card or null. One card is listed once even if two rows match it. */
export function pickMeds(meds: Medication[]): Picked[] {
  const seen = new Set<string>()
  return meds.filter(isLive).map((med) => ({ med, card: cardFor(med) })).filter((p) => {
    const k = p.card?.id ?? `none:${normaliseDrug(p.med.name) ?? p.med.id}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const join = (parts: (string | string[])[]) => parts.flat().join(' ')

/** Plain text of one card or recipe for read-aloud (F4's SpeakButton). Null for an unknown id. Medicine and supplement cards give null unless the caller passes `medcards: true` (the learn.medcards flag), so an unsigned card can never be read out by accident. */
export function articleText(id: string, opts: { medcards?: boolean } = {}): string | null {
  const c = MEDCARDS.find((x) => x.id === id)
  if (c) return !opts.medcards ? null : join([`${c.name}. ${c.forWhat}.`, c.what, 'How to take it.', c.how, 'If you miss a dose.', c.missed, 'Common side effects.', c.side, 'Get help.', c.emergency, 'Do not mix with.', c.noMix, 'Talk to your doctor first.'])
  const r = RECIPES.find((x) => x.id === id)
  if (r) return join([`${r.name}. ${r.blurb}. About ${sodiumPerServing(r)} milligrams of sodium in one serving.`, 'Ingredients.', r.ingredients.map((i) => i[0] + '.'), 'Steps.', r.steps.map((s, i) => `Step ${i + 1}. ${stepText(s)}`)])
  return null
}
