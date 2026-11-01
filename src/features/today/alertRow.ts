import { quakeFeltKm, quakeMag, TSUNAMI_MAG, type Affects, type Alert } from '../safety/alerts'

export const agoShort = (at: number, now: number) => {
  const m = Math.max(0, Math.round((now - at) / 60_000))
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/** The compact amber row for a quake beyond its felt radius ("too far to feel here"); null means the red card shows. Same D-87 threshold as affectsUs. */
export function quakeRow(a: Alert, who: Affects, now: number): { title: string; sub: string } | null {
  if (a.kind !== 'quake' || who.km == null || who.km <= quakeFeltKm(a)) return null
  const mag = quakeMag(a)
  if (mag !== null && mag >= TSUNAMI_MAG) return null // a tsunami-size quake keeps the red card and its tsunami line
  return { title: `Earthquake${mag !== null ? ` M${mag}` : ''} near ${a.where}`, sub: `${who.km} km away · too far to feel here · ${agoShort(Date.parse(a.issuedAt), now)}` }
}
