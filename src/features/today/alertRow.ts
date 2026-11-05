import { placeOnly, quakeFeltKm, quakeMag, type Affects, type Alert } from '../safety/alerts'

export const agoShort = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60_000))
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

const STRONG_MAG = 6

/** The compact amber row for a quake beyond its felt radius ("you may not feel it"; people may still have felt it, so the sub never says it is too far); null means the red card shows. Same D-87 threshold as affectsUs. */
export function quakeRow(a: Alert, who: Affects, now: number): { title: string; sub: string } | null {
  if (a.kind !== 'quake' || who.km == null || who.km <= quakeFeltKm(a)) return null
  const mag = quakeMag(a)
  if (mag !== null && mag >= STRONG_MAG) return null // a strong quake keeps the full card (steps, and the tsunami line from 6.5)
  return { title: `Earthquake${mag !== null ? ` M${mag}` : ''} near ${placeOnly(a.where)}`, sub: `${who.km} km away · you may not feel it · ${agoShort(Date.parse(a.issuedAt), now)}` }
}
