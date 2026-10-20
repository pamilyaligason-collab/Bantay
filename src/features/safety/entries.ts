// Editable safety entries (places and hotlines). Seeds are bundled JSON; family edits live in Dexie kv as per-id overrides,
// so everything works with no signal. Unconfirmed values stay null with status 'UNKNOWN' (B-5): nothing is guessed.
export interface Entry {
  id: string
  zone?: string // places: home zone id (dampas, conel). Hotlines: set id (gensan, tagbilaran, davao, cebu, manila, texas, ph, ofw, tele). Left out = every zone
  group: string
  name: string
  note?: string
  phone: string | null
  lat?: number | null
  lon?: number | null
  link?: true // no number: an app or web service, opened from sourceUrl
  status: 'CONFIRMED' | 'LISTED' | 'UNVERIFIED' | 'UNKNOWN' | 'FAMILY'
  source: string
  sourceUrl: string | null
  date: string
}
export type Overrides = Record<string, Partial<Entry>>

export const OVERRIDES_KEY = 'safety.overrides'
export const NOT_CONFIRMED = 'Not confirmed yet, tap to add'

/** The hotline set that older home-zone ids map to (the first hotline file tagged entries dampas and conel). */
export const ZONE_SET: Record<string, string> = { dampas: 'tagbilaran', conel: 'gensan' }

export const forZone = (seed: Entry[], zone: string): Entry[] => seed.filter((e) => !e.zone || e.zone === zone || e.zone === ZONE_SET[zone])

export const withOverrides = (seed: Entry[], o: Overrides): Entry[] => seed.map((e) => ({ ...e, ...o[e.id] }))

export const googleGo = (lat: number, lon: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}&travelmode=walking`
export const osmUrl = (lat: number, lon: number) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`
export const organicUrl = (lat: number, lon: number, name: string) => `om://map?v=1&ll=${lat},${lon}&n=${encodeURIComponent(name)}`
/** The first number in a text such as "1553 / 1800-1888-1553", "1348 (abroad: +63 2 1348)" or "(02) 8426-1468 to 79". */
export const firstNumber = (n: string) => n.split(/\s\/\s|\sto\s/)[0]!.replace(/\s*\([^)]*[A-Za-z][^)]*\)/g, '').trim()
export const telHref = (n: string) => 'tel:' + firstNumber(n).replace(/[^0-9+]/g, '')

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
