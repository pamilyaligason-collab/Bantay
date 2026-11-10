import { phoneZone } from '../time/zone'

// S30 L8 (Texas): the country the PHONE is set to, and phone numbers made dialable from there. Pure (no database, no React) so the SOS code can import it.
const US_ZONE = /^(America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Indiana\/|Kentucky\/|Menominee|North_Dakota\/|Juneau|Nome|Sitka|Yakutat|Adak)|US\/|Pacific\/Honolulu)/

/** The country the PHONE is set to, from its time zone, then its language. null when neither says. */
export function phoneCountry(tz: string | null = phoneZone(), lang: string | undefined = typeof navigator !== 'undefined' ? navigator.language : undefined): 'PH' | 'US' | null {
  if (tz === 'Asia/Manila') return 'PH'
  if (tz && US_ZONE.test(tz)) return 'US'
  const l = (lang ?? '').toLowerCase()
  if (/-ph$/.test(l) || /^(fil|tl)\b/.test(l)) return 'PH'
  return null
}

/** True when the phone's owner is outside the Philippines by the phone's own country (sync: used where a phone number is dialled or texted). */
export const phoneAbroad = (): boolean => { const c = phoneCountry(); return c === 'US' || (c === null && /^(America|Europe|Asia|Australia|Africa|Pacific|Atlantic|Indian)\//.test(phoneZone() ?? '')) } // a real region zone that is not Manila, no Philippine language; UTC or an Etc zone says nothing, so it is not abroad ("+63" also dials from inside the Philippines)

/** A phone number as typed, made dialable from where the viewer is: a Philippine national number (09xx, 02/8xxx) gets +63 when the viewer is outside the Philippines. Digits and a leading + only.
 *  Never changes a number that already has +, one that is not a Philippine national form (a 10-digit US number stays), or any number when the viewer is in (or may be in) the Philippines. */
export function toE164(number: string, abroad: boolean = phoneAbroad()): string {
  const raw = (number ?? '').trim()
  const s = (raw.startsWith('+') ? '+' : '') + raw.replace(/\D/g, '')
  if (!abroad || s.startsWith('+')) return s
  if (/^0\d{9,10}$/.test(s)) return '+63' + s.slice(1) // 09171234567, 0282345678
  if (/^63\d{10}$/.test(s)) return '+' + s // 639171234567 typed without the plus
  return s
}
