// Pure parsers for the alerts-ingest function (D-25). No network, no Deno APIs: vitest imports this file.
// Every parser returns null when the payload is not the expected shape (the caller treats that as a failed source and keeps
// the previous rows), and [] when the payload is fine but nothing is relevant. Unknown values are null, never 0.

export interface AlertRow {
  id: string
  kind: 'quake' | 'tsunami' | 'volcano' | 'gdacs' | 'air'
  level: string | null
  title: string
  what: string
  where_text: string
  when_text: string
  do_now: string
  source: string
  source_url: string | null
  issued_at: string
  lat: number | null
  lon: number | null
  bulletin: string
  checklist: null
  timeline: null
  expires_at: string | null
}

// D-27: two home zones are always watched. Twin of HOME_ZONES in src/features/location/geo.ts (a vitest keeps them equal).
export const ZONES = [
  { id: 'dampas', name: 'Dampas, Tagbilaran City', lat: 9.645705, lon: 123.877951 },
  // Conel: OpenStreetMap Nominatim, q="Conel, General Santos City, Philippines" (2026-10-18), node 5333506060, place=village:
  // lat 6.2015121, lon 125.1878084. This is the barangay centre point from OSM, not a street address.
  { id: 'conel', name: 'Conel, General Santos City', lat: 6.2015121, lon: 125.1878084 }
] as const
export type Zone = (typeof ZONES)[number]
const H = 3_600_000

// Quake relevance (shown if any rule matches, measured to the nearest zone): M3.5+ within 100 km of a zone (can be felt), M4.5+ within 300 km (central Visayas),
// M6.5+ within 1000 km (large regional event). Anything with an unknown magnitude or position is skipped, never guessed.
export const QUAKE_RULES = [{ minMag: 3.5, maxKm: 100 }, { minMag: 4.5, maxKm: 300 }, { minMag: 6.5, maxKm: 1000 }]
export const GDACS_MAX_KM = 500
export const AIR_MIN_AQI = 101 // US AQI "unhealthy for sensitive groups" and above

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** The nearest zone to p and the distance to it. */
export function nearest(p: { lat: number; lon: number }): { zone: Zone; km: number } {
  let best = { zone: ZONES[0] as Zone, km: distanceKm(ZONES[0], p) }
  for (const z of ZONES) {
    const km = distanceKm(z, p)
    if (km < best.km) best = { zone: z, km }
  }
  return best
}

/** "2026-10-17 15:05 PH time" for an epoch-ms instant. */
export function phTime(ms: number): string {
  return new Date(ms + 8 * H).toISOString().slice(0, 16).replace('T', ' ') + ' PH time'
}

const QUAKE_DO_NOW = 'If you did not feel it, you do not need to do anything. If you feel shaking: drop, cover and hold on. After strong shaking near the coast, move to high ground now. Do not wait for a message.'

export function parseUsgs(payload: unknown, now: number): AlertRow[] | null {
  const features = (payload as { features?: unknown } | null)?.features
  if (!Array.isArray(features)) return null
  const out: AlertRow[] = []
  for (const f of features as Record<string, any>[]) {
    const p = f?.properties
    const c = f?.geometry?.coordinates
    const mag = num(p?.mag)
    const time = num(p?.time)
    const lon = num(c?.[0])
    const lat = num(c?.[1])
    if (typeof f?.id !== 'string' || p?.type !== 'earthquake' || mag === null || time === null || lat === null || lon === null) continue
    const { zone, km } = nearest({ lat, lon })
    if (!QUAKE_RULES.some((r) => mag >= r.minMag && km <= r.maxKm)) continue
    const expires = time + 24 * H
    if (expires <= now) continue
    const depth = num(c?.[2])
    const place = typeof p.place === 'string' && p.place ? p.place : 'Location not given'
    const url = typeof p.url === 'string' ? p.url : null
    out.push({
      id: `usgs-${f.id}`,
      kind: 'quake',
      level: `Magnitude ${mag.toFixed(1)}`,
      title: typeof p.title === 'string' && p.title ? p.title : `Magnitude ${mag.toFixed(1)} earthquake`,
      what: `Magnitude ${mag.toFixed(1)} earthquake, about ${Math.round(km)} km from ${zone.name}.`,
      where_text: place,
      when_text: phTime(time),
      do_now: QUAKE_DO_NOW,
      source: 'USGS',
      source_url: url,
      issued_at: new Date(time).toISOString(),
      lat,
      lon,
      bulletin: [`Magnitude ${mag.toFixed(1)}, ${place}.`, depth === null ? 'Depth: unknown.' : `Depth: ${depth.toFixed(0)} km.`, `Time: ${phTime(time)}.`, 'Source: USGS.'].join('\n'),
      checklist: null,
      timeline: null,
      expires_at: new Date(expires).toISOString()
    })
  }
  return out
}

// ---- GDACS RSS (no DOM in Deno: plain tag extraction)
const unesc = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&')
const tag = (block: string, name: string): string | null => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))
  const v = m ? unesc(m[1].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()) : null
  return v ? v : null
}

const GDACS_DO_NOW: Record<string, string> = {
  TC: 'Check the PAGASA bulletin for wind signals in your area and follow your local DRRMO. Keep your go-bag and phone charge ready.',
  FL: 'Follow your local DRRMO. Do not walk or drive through floodwater. Move to higher ground if water is rising.',
  VO: 'Stay out of any danger zone set by PHIVOLCS. Follow PHIVOLCS bulletins and your local officials.',
  TS: 'If you feel strong shaking near the coast or see the sea pull back, move to high ground now. Do not wait for a message.'
}
const GDACS_KIND: Record<string, AlertRow['kind']> = { TC: 'gdacs', FL: 'gdacs', VO: 'volcano', TS: 'tsunami' }
const GDACS_TTL_H: Record<string, number> = { TC: 48, FL: 48, VO: 72, TS: 12 }

/** GDACS global feed, filtered to the Philippines (country text) or within GDACS_MAX_KM of any zone. Earthquakes are skipped here (USGS covers them);
 *  drought and wildfire are skipped (no action for a family in our zones). Only events GDACS still marks current. */
export function parseGdacs(xml: unknown, now: number): AlertRow[] | null {
  if (typeof xml !== 'string' || !xml.includes('<rss')) return null
  const out: AlertRow[] = []
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1]
    const type = tag(b, 'gdacs:eventtype')
    const eventId = tag(b, 'gdacs:eventid')
    if (!type || !(type in GDACS_KIND) || !eventId || tag(b, 'gdacs:iscurrent') !== 'true') continue
    const country = tag(b, 'gdacs:country') ?? ''
    const latText = tag(b, 'geo:lat')
    const lonText = tag(b, 'geo:long')
    const lat = latText === null ? null : num(Number(latText))
    const lon = lonText === null ? null : num(Number(lonText))
    const near = lat !== null && lon !== null && nearest({ lat, lon }).km <= GDACS_MAX_KM
    if (!/Philippines/i.test(country) && !near) continue
    const from = Date.parse(tag(b, 'gdacs:fromdate') ?? '')
    const modified = Date.parse(tag(b, 'gdacs:datemodified') ?? '')
    const issued = Number.isFinite(from) ? from : Number.isFinite(modified) ? modified : now
    const expires = (Number.isFinite(modified) ? modified : now) + GDACS_TTL_H[type] * H
    if (expires <= now) continue
    const title = tag(b, 'title') ?? `GDACS ${type} alert`
    const desc = tag(b, 'description') ?? title
    const name = tag(b, 'gdacs:eventname')
    out.push({
      id: `gdacs-${type}-${eventId}`,
      kind: GDACS_KIND[type],
      level: tag(b, 'gdacs:alertlevel'),
      title,
      what: desc,
      where_text: [name, country].filter(Boolean).join(', ') || 'Location not given',
      when_text: phTime(issued),
      do_now: GDACS_DO_NOW[type],
      source: 'GDACS',
      source_url: tag(b, 'link'),
      issued_at: new Date(issued).toISOString(),
      lat,
      lon,
      bulletin: `${title}\n${desc}\nSource: GDACS (EC-JRC and UN). This is global context, not a PAGASA or PHIVOLCS warning.`,
      checklist: null,
      timeline: null,
      expires_at: new Date(expires).toISOString()
    })
  }
  return out
}

// ---- Open-Meteo air quality (model data on an 11 km grid, hourly)
const AQI_BANDS: [number, string, string][] = [
  [301, 'Hazardous', 'Stay indoors with windows closed if you can. Everyone should avoid outdoor activity.'],
  [201, 'Very unhealthy', 'Everyone should limit time outdoors. Sensitive people should stay indoors.'],
  [151, 'Unhealthy', 'Everyone should reduce long or heavy outdoor activity. Sensitive people should stay indoors if they can.'],
  [AIR_MIN_AQI, 'Unhealthy for sensitive groups', 'Children, older adults and people with lung or heart conditions should limit time outdoors.']
]

/** One row per zone, always. Below the threshold the row is written already expired so a previous high reading stops showing. */
export function parseAir(payload: unknown, now: number, zone: Zone = ZONES[0]): AlertRow[] | null {
  const cur = (payload as { current?: { time?: unknown; us_aqi?: unknown; pm2_5?: unknown } } | null)?.current
  const aqi = num(cur?.us_aqi)
  const t = typeof cur?.time === 'string' ? Date.parse(cur.time + 'Z') : NaN // Open-Meteo times are GMT
  if (aqi === null || !Number.isFinite(t)) return null
  const pm = num(cur?.pm2_5)
  const band = AQI_BANDS.find((b) => aqi >= b[0])
  return [{
    id: `air-${zone.id}`,
    kind: 'air',
    level: `US AQI ${Math.round(aqi)}`,
    title: band ? `Air quality: ${band[1]}` : 'Air quality: no warning',
    what: `US AQI ${Math.round(aqi)}${pm === null ? '' : `, fine dust (PM2.5) ${pm.toFixed(0)} micrograms per cubic metre`}. This is a model estimate, not an official warning.`,
    where_text: `${zone.name} area (model grid cell, about 11 km wide)`,
    when_text: phTime(t),
    do_now: band ? band[2] : 'Nothing to do.',
    source: 'Open-Meteo',
    source_url: 'https://open-meteo.com/en/docs/air-quality-api',
    issued_at: new Date(t).toISOString(),
    lat: null,
    lon: null,
    bulletin: `US AQI ${Math.round(aqi)}${pm === null ? '' : `; PM2.5 ${pm.toFixed(1)} ug/m3`}.\nTime: ${phTime(t)}.\nSource: Open-Meteo air quality model (CAMS). Not an official warning.`,
    checklist: null,
    timeline: null,
    expires_at: band ? new Date(now + 3 * H).toISOString() : new Date(now).toISOString()
  }]
}
