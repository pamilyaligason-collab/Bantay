/** How old a family point is, in words (D-136, board S22FamilyMap). Pure: `now` is passed in so tests fix the clock. */
export const GREY_AFTER_MS = 6 * 3_600_000 // past 6 h the pin turns grey and the row says it may be out of date
export const LOW_BATTERY = 30 // D-138: fixed at 30 %
const APPROX_OVER_M = 500

export interface PlaceAge { text: string; grey: boolean; approx: string | null }

/** "about ±N km" only when the fix is coarser than 500 m (a 20 m fix needs no caveat); unknown accuracy adds nothing. */
export function approxWords(accuracyM: number | null | undefined): string | null {
  if (typeof accuracyM !== 'number' || !Number.isFinite(accuracyM) || accuracyM <= APPROX_OVER_M) return null
  const km = accuracyM / 1000
  return `about ±${km >= 10 ? Math.round(km) : Math.round(km * 10) / 10} km`
}

export function placeAge(fixedAt: number, now: number, accuracyM?: number | null): PlaceAge {
  const ms = now - fixedAt // a fix a little ahead of this phone's clock counts as just now
  const min = Math.floor(ms / 60_000)
  const h = Math.floor(ms / 3_600_000)
  const text = ms < 60_000 ? 'just now'
    : ms < 3_600_000 ? `${min} min ago`
    : ms < 86_400_000 ? `${h} h ago`
    : new Date(fixedAt).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  return { text, grey: ms > GREY_AFTER_MS, approx: approxWords(accuracyM) }
}

/** The sub line of a person: "12 min ago", "12 min ago · about ±2 km"; a grey one ends "may be out of date". */
export function placeLine(a: PlaceAge): string {
  return [a.text, a.approx, a.grey ? 'may be out of date' : null].filter(Boolean).join(' · ')
}

/** Battery in words, never by colour alone: "82%", "18% · low", "64% · charging". Unknown is "--" (ML-05), not 0. */
export function batteryWords(pct: number | null | undefined, charging?: boolean | null): string {
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) return '--'
  const p = Math.round(pct)
  return charging ? `${p}% · charging` : p < LOW_BATTERY ? `${p}% · low` : `${p}%`
}

/** One sub line for a person on the map list and in People: "12 min ago · Battery 18% · low". The battery part is left out when the phone could not say. */
export function placeSub(p: { fixedAt: number; accuracyM: number | null; batteryPct: number | null; charging: boolean | null }, now: number): string {
  const line = placeLine(placeAge(p.fixedAt, now, p.accuracyM))
  return p.batteryPct === null ? line : `${line} · Battery ${batteryWords(p.batteryPct, p.charging)}`
}
