export type HotlineRow = { id: string; name: string; zone: string; group: string; phone: string | null; status: string; sourceUrl: string; date: string }
export type Line = { id: string; name: string; zone: string; status: string; numbers: string[]; sourceUrl: string; date: string }

/** Verified Philippine mental-health rows from safety/hotlines.json, phones split into single numbers. An UNVERIFIED row is never shown. */
export const crisisLines = (rows: readonly HotlineRow[]): Line[] =>
  rows.filter((r) => r.group === 'Mental health' && r.zone === 'ph' && r.status !== 'UNVERIFIED' && !!r.phone)
    .map((r) => ({ id: r.id, name: r.name, zone: r.zone, status: r.status, numbers: r.phone!.split(' / '), sourceUrl: r.sourceUrl, date: r.date }))

export const telHref = (s: string) => 'tel:' + s.replace(/\D/g, '')
