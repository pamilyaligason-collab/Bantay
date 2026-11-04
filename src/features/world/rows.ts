import { type Alert, affectsUs, type LatLon, rankAlerts } from '../safety/alerts'
import { inPar } from '../safety/stormPar'

export const NEAR = 100 // km: "near family" is closer than affectsUs's wide radius
export type PinKind = 'flood' | 'quake' | 'storm' | 'volcano' | 'other'
export interface WorldRow { id: string; title: string; sub: string; badge: string; href: string; kind: PinKind }
export interface Pin { id: string; title: string; lat: number; lon: number; kind: PinKind }

export const isEonet = (a: Alert) => a.kind === 'eonet'

export const kindOf = (a: Alert): PinKind => {
  if (a.kind === 'quake') return 'quake'
  if (a.kind === 'volcano') return 'volcano'
  if (a.kind === 'rainfall') return 'flood'
  if (a.kind === 'tcws') return 'storm'
  if (isEonet(a)) { // the EONET category is in the title or text; a wildfire has no pin colour of its own
    const head = a.what.includes(':') ? a.what.split(':')[0]! : `${a.title}` // lane A starts `what` with the EONET category, e.g. "Wildfires: ..."
    const t = head
    return /volcan|eruption/i.test(t) ? 'volcano' : /storm|cyclone|typhoon|hurricane/i.test(t) ? 'storm' : /flood/i.test(t) ? 'flood' : 'other'
  }
  if (a.kind === 'gdacs') {
    const t = `${a.title} ${a.what}`
    return /cyclone|typhoon|storm/i.test(t) ? 'storm' : /flood/i.test(t) ? 'flood' : /volcan/i.test(t) ? 'volcano' : /earthquake|quake/i.test(t) ? 'quake' : 'other'
  }
  return 'other'
}

function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000))
  return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

const rowOf = (a: Alert, now: number): WorldRow => {
  const kind = kindOf(a)
  return { id: a.id, title: a.title, sub: `${a.source} · ${ago(a.issuedAt, now)}`, badge: isEonet(a) ? 'On the radar' : a.level ?? 'Advisory', href: a.kind === 'gdacs' && kind === 'storm' ? '#safety/storms' : '#safety/warnings', kind }
}

const hasPoint = (a: Alert): a is Alert & { lat: number; lon: number } => typeof a.lat === 'number' && typeof a.lon === 'number'
const inPhilippines = (a: Alert) => isEonet(a) ? false : a.kind !== 'gdacs' || (hasPoint(a) && inPar({ lat: a.lat, lon: a.lon }))

/** Three lists for the World view. A row can sit in both Near family and Philippines; the filter above them picks which to show. */
export function worldRows(alerts: Alert[], here: LatLon | null, now = Date.now()) {
  const nearFamily = alerts.filter((a) => !isEonet(a)).filter((a) => { const f = affectsUs(a, here); return f.affects && (f.km === null || f.km <= NEAR) })
  const philippines = rankAlerts(alerts.filter(inPhilippines), here)
  const world = alerts.filter((a) => !inPhilippines(a)).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
  const rows = (l: Alert[]) => l.map((a) => rowOf(a, now))
  return { nearFamily: rows(nearFamily), philippines: rows(philippines), world: rows(world) }
}

export const pinsOf = (alerts: Alert[]): Pin[] => alerts.filter(hasPoint).map((a) => ({ id: a.id, title: a.title, lat: a.lat, lon: a.lon, kind: kindOf(a) }))

/** Flag off = main: EONET rows do not exist for the World lists, the pins or the panels. */
export const visible = (alerts: Alert[], eonetOn: boolean) => (eonetOn ? alerts : alerts.filter((a) => !isEonet(a)))

/** "Forecasts to watch": open EONET events and GDACS storm rows, newest first. Nothing here is a prediction Bantay makes. */
export function forecastRows(alerts: Alert[], now = Date.now()): WorldRow[] {
  return alerts.filter((a) => isEonet(a) || (a.kind === 'gdacs' && kindOf(a) === 'storm')).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map((a) => rowOf(a, now))
}

/** "Volcanoes": volcano bulletins and EONET volcano events. */
export function volcanoRows(alerts: Alert[], now = Date.now()): WorldRow[] {
  return alerts.filter((a) => kindOf(a) === 'volcano').sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).map((a) => rowOf(a, now))
}
