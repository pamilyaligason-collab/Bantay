export type HotlineRow = { id: string; name: string; zone: string; group: string; phone: string | null; status: string; sourceUrl: string; date: string }
export type Line = { id: string; name: string; zone: string; status: string; numbers: string[]; network: string; sourceUrl: string; date: string }

/** The carrier in the row name's parentheses, e.g. "Globe/TM"; empty when they only say 24/7. */
const netOf = (name: string) => { const m = /\(([^)]+)\)/.exec(name)?.[1] ?? ''; return /24\/7/.test(m) ? '' : m }

/** Listed or confirmed Philippine mental-health rows from safety/hotlines.json (an allow-list, as safety/entries.ts: UNVERIFIED, UNKNOWN and anything new are never shown), phones split into single numbers. "Listed" is not "verified by Bantay". */
export const crisisLines = (rows: readonly HotlineRow[]): Line[] =>
  rows.filter((r) => r.group === 'Mental health' && r.zone === 'ph' && (r.status === 'CONFIRMED' || r.status === 'LISTED') && !!r.phone)
    .map((r) => ({ id: r.id, name: r.name, zone: r.zone, status: r.status, numbers: r.phone!.split(' / '), network: netOf(r.name), sourceUrl: r.sourceUrl, date: r.date }))

export const telHref = (s: string) => 'tel:' + s.replace(/\D/g, '')
