import data from '../../../data/discover/seasons.json'

export interface Season { id: string; title: string; from: string; to: string; lines: string[]; link: { label: string; href: string }; source: { name: string; url: string } }
export const SEASONS = data.seasons as Season[]

const md = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** The season active on the device's local date, or null (7 Jan to 14 Mar). A window with from > to wraps the new year. The first match wins, so Undas beats the typhoon season. */
export function seasonFor(d: Date): Season | null {
  const k = md(d)
  return SEASONS.find((s) => (s.from <= s.to ? k >= s.from && k <= s.to : k >= s.from || k <= s.to)) ?? null
}
