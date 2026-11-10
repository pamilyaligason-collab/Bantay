import type { Region } from '../location/region'

export type HotlineRow = { id: string; name: string; zone: string; group: string; phone: string | null; status: string; sourceUrl: string; date: string }
export type Line = { id: string; name: string; zone: string; status: string; numbers: string[]; network: string; sourceUrl: string; date: string }

/** The carrier in the row name's parentheses, e.g. "Globe/TM"; empty when they only say 24/7. */
const netOf = (name: string) => { const m = /\(([^)]+)\)/.exec(name)?.[1] ?? ''; return /24\/7/.test(m) ? '' : m }

/** Which hotlines.json zones carry the crisis lines for where the phone is (S30 L8, D1): Philippines 'ph', the United States 'texas' (988), unknown both. A line is never one that cannot be dialled from here. */
const ZONES: Record<'ph' | 'us' | 'both', string[]> = { ph: ['ph'], us: ['texas'], both: ['ph', 'texas'] }

/** Listed or confirmed mental-health rows from safety/hotlines.json for the region (an allow-list, as safety/entries.ts: UNVERIFIED, UNKNOWN and anything new are never shown), phones split into single numbers. "Listed" is not "verified by Bantay".
 *  region 'ph' is the default (the Philippine lines), 'us' the Texas 988 line, null (unknown) both. */
export const crisisLines = (rows: readonly HotlineRow[], region: Region = 'ph'): Line[] =>
  rows.filter((r) => r.group === 'Mental health' && ZONES[region ?? 'both'].includes(r.zone) && (r.status === 'CONFIRMED' || r.status === 'LISTED') && !!r.phone)
    .map((r) => ({ id: r.id, name: r.name, zone: r.zone, status: r.status, numbers: r.phone!.split(' / '), network: netOf(r.name), sourceUrl: r.sourceUrl, date: r.date }))

export const telHref = (s: string) => 'tel:' + s.replace(/\D/g, '')
