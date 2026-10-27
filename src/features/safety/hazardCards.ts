import hazards from '../../data/safety/hazards.json'

export type Tone = 'good' | 'warn' | 'none'
export interface Reading { label: string; value: string | null }
export interface HazardCard { id: string; title: string; readings: Reading[]; tone: Tone; todo: string; plain?: string }
export interface HazardView { cards: HazardCard[]; rest: Reading[]; url: string; source: string }

/** "Safe" and "Low" are calm; any other reading is shown as a warning; no reading yet is neutral. */
export const toneOf = (v: string | null): Tone => (v == null ? 'none' : /^(safe|low)\b/i.test(v) ? 'good' : 'warn')

const CARDS = [
  { id: 'flood', title: 'Flood', labels: ['Flood'], todo: 'Know your nearest high ground. Move up early when heavy rain keeps falling. Never walk or drive through flood water.' },
  { id: 'landslide', title: 'Landslide', labels: ['Rain-induced landslide'], todo: 'On a slope, leave early in long heavy rain. Watch for cracks, leaning trees and muddy water.' },
  { id: 'surge', title: 'Storm surge', labels: ['Storm surge'], todo: 'When a typhoon is near the coast, move inland to higher ground before it arrives.' },
  { id: 'quake', title: 'Earthquake', labels: ['Ground shaking', 'Liquefaction, tsunami, ground rupture'], todo: 'Drop, cover and hold on. If you are on the coast and the ground shakes hard, go to high ground at once.' }
]

// PHIVOLCS Earthquake Intensity Scale (PEIS), in plain words. The reading says "Prone, Intensity VIII"; nobody should have to know what VIII means.
const PEIS: Record<string, string> = {
  I: 'barely felt', II: 'felt a little', III: 'weak shaking', IV: 'moderate shaking', V: 'strong shaking', VI: 'very strong shaking',
  VII: 'destructive shaking', VIII: 'very destructive shaking', IX: 'devastating shaking', X: 'completely devastating shaking'
}
const QUAKE_DO = 'Know a safe spot in each room. Drop, cover and hold on when it shakes.'

/** The ground shaking reading in plain words: what it means and one thing to do. Null when there is no intensity in the reading (we never guess). */
export function quakeMeaning(value: string | null): { status: string; text: string } | null {
  const m = value ? /intensity\s+(X|IX|VIII|VII|VI|V|IV|III|II|I)\b/i.exec(value) : null
  const word = m ? PEIS[m[1]!.toUpperCase()] : undefined
  if (!word) return null
  return { status: `can have ${word}`, text: `In a big quake this place can have ${word} (Intensity ${m![1]!.toUpperCase()}). Old or weak buildings can be damaged. ${QUAKE_DO}` }
}

/** Four hazard cards from the bundled HazardHunterPH readings, or null when we have none for this zone. */
export function hazardsFor(zone: string): HazardView | null {
  if (hazards.zone !== zone) return null
  const rows: Reading[] = hazards.rows.map((r) => ({ label: r.label, value: r.value ?? null }))
  const used = new Set(CARDS.flatMap((c) => c.labels))
  const cards = CARDS.map((c): HazardCard => {
    const readings = c.labels.map((l) => rows.find((r) => r.label === l) ?? { label: l, value: null })
    const tones = readings.map((r) => toneOf(r.value))
    const q = c.id === 'quake' ? quakeMeaning(readings[0]!.value) : null
    return { id: c.id, title: c.title, readings, todo: q ? q.text : c.todo, ...(q ? { plain: q.status } : {}), tone: tones.includes('warn') ? 'warn' : tones.includes('none') ? 'none' : 'good' }
  })
  return { cards, rest: rows.filter((r) => !used.has(r.label)), url: hazards.url, source: hazards.source }
}

/** One line for the Safety tile. */
export function hazardStatus(v: HazardView | null): string {
  if (!v) return 'Not checked for this place yet'
  const w = v.cards.find((c) => c.tone === 'warn')
  if (w) return `${w.title}: ${w.plain ?? w.readings[0]!.value ?? 'check'}`
  return v.cards.some((c) => c.tone === 'none') ? 'Some levels not confirmed' : 'No high risks found'
}

const TONE_WORD: Record<Tone, string> = { good: 'Lower risk', warn: 'Take care', none: 'Not confirmed yet' }
/** One label per card: a single reading is its own headline ("Safe"); several readings get one overall word and the readings list below it. */
export const hazardLabel = (c: Pick<HazardCard, 'readings' | 'tone'>): string =>
  c.readings.length === 1 ? (c.readings[0]!.value ?? TONE_WORD.none) : TONE_WORD[c.tone]
