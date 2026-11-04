import type { HazardView, Tone } from './hazardCards'
import type { HazardLevels } from './hazardLookup'

const NOAH_WORD = ['Low', 'Medium', 'High'] as const

export const NOAH_URL = 'https://noah.up.edu.ph/'
export const LAYERS = [{ id: 'flood', label: 'Flood' }, { id: 'landslide', label: 'Landslide' }, { id: 'surge', label: 'Storm surge' }] as const
export type LayerId = (typeof LAYERS)[number]['id']
export interface LayerState { label: string; reading: string | null; tone: Tone; text: string }

/** What the layer switch says. The map has no hazard tiles, so the caption says so; the reading is the one HazardHunterPH value we hold. */
export function layerState(id: LayerId, v: HazardView | null, hz?: HazardLevels | null): LayerState {
  const label = LAYERS.find((l) => l.id === id)!.label
  // NOAH level from the phone's hazard file (flag localPacks). Null = no file or outside its bounds: fall through to what we had.
  const lv = hz?.[id]
  if (lv !== undefined && lv !== null) {
    if (lv === 0) return { label, reading: null, tone: 'none', text: `No mapped ${label.toLowerCase()} hazard here in NOAH's maps (100-year scenario). That is not a promise of safety: the maps may not cover every place, and a phone's position can be off by tens of metres.` }
    const reading = NOAH_WORD[lv - 1]!
    return { label, reading, tone: lv === 1 ? 'good' : 'warn', text: `${label} level from NOAH: ${reading} (about 10 m accuracy).` }
  }
  if (!v) return { label, reading: null, tone: 'none', text: 'Not checked for this place yet.' }
  const card = v.cards.find((c) => c.id === id)
  const reading = card?.readings[0]?.value ?? null
  if (reading === null) return { label, reading: null, tone: 'none', text: `No ${label.toLowerCase()} map for this place yet. Hazard maps arrive with the local data pack.` }
  return { label, reading, tone: card!.tone, text: `${label} reading from HazardHunterPH: ${reading}. The map shows your place only; hazard layers arrive with the local data pack.` }
}

/** "17 Oct 2026" from the "read 2026-10-17" tail of the hazards source line, else null. */
export function readDate(source: string): string | null {
  const m = /read (\d{4})-(\d{2})-(\d{2})/.exec(source)
  if (!m) return null
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
