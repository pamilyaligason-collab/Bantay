import type { SosContact } from './contacts'

export const MAPS = 'https://maps.google.com/?q='
export const mapLink = (lat: number, lon: number) => `${MAPS}${lat},${lon}`

/** Digits and a leading + only: spaces and dashes in a stored number would break the sms: link. */
export const smsNumber = (p: string): string => {
  const s = p.trim()
  return (s.startsWith('+') ? '+' : '') + s.replace(/\D/g, '')
}

/** The text the contacts get. `gps` false = the phone could not find itself, so this is the home zone (say so, never pretend). */
export function sosBody(o: { name: string; lat: number; lon: number; time: string; gps: boolean }): string {
  const who = o.name.trim() || 'a Bantay family member'
  const where = o.gps ? 'My location' : 'My phone could not find my location. My home area'
  return `SOS from ${who}. I need help. ${where}: ${mapLink(o.lat, o.lon)} (${o.time})`
}

export const SAFE_BODY = 'I am safe now.'

/** Android sms: link, numbers comma-separated. Null when nobody has a usable number. */
export function smsUri(contacts: SosContact[], body: string): string | null {
  const nums = contacts.map((c) => smsNumber(c.phone)).filter((n) => n.replace(/\D/g, '').length >= 10)
  return nums.length ? `sms:${nums.join(',')}?body=${encodeURIComponent(body)}` : null
}
