// Editable safety entries (places and hotlines). Seeds are bundled JSON; family edits live in Dexie kv as per-id overrides,
// so everything works with no signal. Unconfirmed values stay null with status 'UNKNOWN' (B-5): nothing is guessed.
export interface Entry {
  id: string
  zone?: string // home zone this entry is for; left out = every zone
  group: string
  name: string
  note?: string
  phone: string | null
  lat?: number | null
  lon?: number | null
  status: 'CONFIRMED' | 'LISTED' | 'UNKNOWN' | 'FAMILY'
  source: string
  sourceUrl: string | null
  date: string
}
export type Overrides = Record<string, Partial<Entry>>

export const OVERRIDES_KEY = 'safety.overrides'
export const NOT_CONFIRMED = 'Not confirmed yet, tap to add'

export const forZone = (seed: Entry[], zone: string): Entry[] => seed.filter((e) => !e.zone || e.zone === zone)

export const withOverrides = (seed: Entry[], o: Overrides): Entry[] => seed.map((e) => ({ ...e, ...o[e.id] }))

export const googleGo = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`
export const osmUrl = (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`
export const organicUrl = (lat: number, lon: number, name: string) => `om://map?v=1&ll=${lat},${lon}&n=${encodeURIComponent(name)}`
export const telHref = (n: string) => 'tel:' + n.replace(/[^0-9+]/g, '')

export const hasPoint = (e: Entry): e is Entry & { lat: number; lon: number } => typeof e.lat === 'number' && typeof e.lon === 'number'

type Parsed = { ok: true; patch: Partial<Entry> } | { ok: false; error: string }

/** Validate what the family typed. geo entries need both coordinates; others need a phone number. */
export function parseEdit(f: { lat?: string; lon?: string; phone?: string }, geo: boolean, today = new Date().toISOString().slice(0, 10)): Parsed {
  const stamp = { status: 'FAMILY' as const, source: 'Added by the family', sourceUrl: null, date: today }
  if (geo) {
    const lat = Number(f.lat?.trim()), lon = Number(f.lon?.trim())
    if (!f.lat?.trim() || !f.lon?.trim() || !Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, error: 'Enter latitude and longitude as numbers.' }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return { ok: false, error: 'Latitude is -90 to 90 and longitude is -180 to 180.' }
    return { ok: true, patch: { lat, lon, ...stamp } }
  }
  const phone = f.phone?.trim() ?? ''
  if (!/^[0-9+()\s-]{3,20}$/.test(phone)) return { ok: false, error: 'Enter a phone number using digits, spaces, + ( ) or -.' }
  return { ok: true, patch: { phone, ...stamp } }
}
