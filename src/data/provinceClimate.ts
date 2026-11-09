import climate from './provinceClimate.json'

export type ClimateType = 1 | 2 | 3 | 4
export type ClimateResult = { type: ClimateType; uncertain: boolean }

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

const table = new Map(
  Object.entries(climate.provinces as Record<string, { type: number; uncertain?: boolean }>).map(
    ([name, v]) => [norm(name), { type: v.type as ClimateType, uncertain: !!v.uncertain }] as const,
  ),
)

// Old names; a name that maps to two new provinces is always uncertain.
const ALIASES: Record<string, string[]> = {
  'compostela valley': ['Davao de Oro'],
  maguindanao: ['Maguindanao del Norte', 'Maguindanao del Sur'],
  'western samar': ['Samar'],
}

/** Climate type for a province name, or null when unknown (the UI then asks the person to pick). */
export function climateTypeFor(province: string | null | undefined): ClimateResult | null {
  if (!province) return null
  const key = norm(province)
  const direct = table.get(key)
  if (direct) return direct
  const alias = ALIASES[key]
  if (!alias) return null
  const hits = alias.map((a) => table.get(norm(a))!)
  if (!hits.every((h) => h.type === hits[0].type)) return null
  return { type: hits[0].type, uncertain: hits.length > 1 || hits.some((h) => h.uncertain) }
}
