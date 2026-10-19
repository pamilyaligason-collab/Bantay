import hazards from '../../data/safety/hazards.json'

export type Tone = 'good' | 'warn' | 'none'
export interface Reading { label: string; value: string | null }
export interface HazardCard { id: string; title: string; readings: Reading[]; tone: Tone; todo: string }
export interface HazardView { cards: HazardCard[]; rest: Reading[]; url: string; source: string }

/** "Safe" and "Low" are calm; any other reading is shown as a warning; no reading yet is neutral. */
export const toneOf = (v: string | null): Tone => (v == null ? 'none' : /^(safe|low)\b/i.test(v) ? 'good' : 'warn')

const CARDS = [
  { id: 'flood', title: 'Flood', labels: ['Flood'], todo: 'Know your nearest high ground. Move up early when heavy rain keeps falling. Never walk or drive through flood water.' },
  { id: 'landslide', title: 'Landslide', labels: ['Rain-induced landslide'], todo: 'On a slope, leave early in long heavy rain. Watch for cracks, leaning trees and muddy water.' },
  { id: 'surge', title: 'Storm surge', labels: ['Storm surge'], todo: 'When a typhoon is near the coast, move inland to higher ground before it arrives.' },
  { id: 'quake', title: 'Earthquake', labels: ['Ground shaking', 'Liquefaction, tsunami, ground rupture'], todo: 'Drop, cover and hold on. If you are on the coast and the ground shakes hard, go to high ground at once.' }
]

/** Four hazard cards from the bundled HazardHunterPH readings, or null when we have none for this zone. */
export function hazardsFor(zone: string): HazardView | null {
  if (hazards.zone !== zone) return null
  const rows: Reading[] = hazards.rows.map((r) => ({ label: r.label, value: r.value ?? null }))
  const used = new Set(CARDS.flatMap((c) => c.labels))
  const cards = CARDS.map((c): HazardCard => {
    const readings = c.labels.map((l) => rows.find((r) => r.label === l) ?? { label: l, value: null })
    const tones = readings.map((r) => toneOf(r.value))
    return { id: c.id, title: c.title, readings, todo: c.todo, tone: tones.includes('warn') ? 'warn' : tones.includes('none') ? 'none' : 'good' }
  })
  return { cards, rest: rows.filter((r) => !used.has(r.label)), url: hazards.url, source: hazards.source }
}

/** One line for the Safety tile. */
export function hazardStatus(v: HazardView | null): string {
  if (!v) return 'Not checked for this place yet'
  const w = v.cards.find((c) => c.tone === 'warn')
  if (w) return `${w.title}: ${w.readings[0]!.value ?? 'check'}`
  return v.cards.some((c) => c.tone === 'none') ? 'Some levels not confirmed' : 'No high risks found'
}

const TONE_WORD: Record<Tone, string> = { good: 'Lower risk', warn: 'Take care', none: 'Not confirmed yet' }
/** One label per card: a single reading is its own headline ("Safe"); several readings get one overall word and the readings list below it. */
export const hazardLabel = (c: Pick<HazardCard, 'readings' | 'tone'>): string =>
  c.readings.length === 1 ? (c.readings[0]!.value ?? TONE_WORD.none) : TONE_WORD[c.tone]
