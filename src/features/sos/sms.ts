import type { SosContact } from './contacts'

export { SOS_ACTIVE_KEY, SOS_CONTACTS_KEY, type SosActive } from './active'

export const MAPS = 'https://maps.google.com/?q='
export const mapLink = (lat: number, lon: number) => `${MAPS}${lat},${lon}`

/** Digits and a leading + only: spaces and dashes in a stored number would break the sms: link. */
export const smsNumber = (p: string): string => {
  const s = p.trim()
  return (s.startsWith('+') ? '+' : '') + s.replace(/\D/g, '')
}
export const usableNumber = (p: string) => smsNumber(p).replace(/\D/g, '').length >= 10

/** The text the contacts get. `gps` false = the phone could not find itself, so any place is the home zone (say so, never pretend);
 *  null lat/lon = no place at all, and the text says that instead of a map link (unknown is never 0). */
export function sosBody(o: { name: string; lat: number | null; lon: number | null; time: string; gps: boolean }): string {
  const who = o.name.trim() || 'A Bantay family member'
  const head = `${who} needs help. ${o.time}.`
  if (o.lat == null || o.lon == null) return `${head} My phone could not find my location. Sent from Bantay.`
  const at = `${mapLink(o.lat, o.lon)} (${o.lat.toFixed(5)}, ${o.lon.toFixed(5)})`
  return o.gps ? `${head} Location: ${at}. Sent from Bantay.` : `${head} My phone could not find my location. My home area: ${at}. Sent from Bantay.`
}

export const SAFE_BODY = 'I am safe now.'

/** One sms: composer per contact (Q38): a two-recipient sms: URI becomes a group MMS on many Android phones. Contacts with no usable number are left out. */
export function smsUris(contacts: SosContact[], body: string): { name: string; uri: string }[] {
  return contacts.filter((c) => usableNumber(c.phone)).map((c) => ({ name: c.name.trim() || c.phone.trim(), uri: `sms:${smsNumber(c.phone)}?body=${encodeURIComponent(body)}` }))
}
