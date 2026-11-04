// NASA EONET v3 open events (https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=3). Pure function, no network: vitest imports this file.
// Shape verified with one read-only fetch (fixtures/eonet.json): { title, description, link, events: [{ id, title, link, closed, categories[{id,title}], sources[{id,url}], geometry[{date, type, coordinates, magnitudeValue, magnitudeUnit}] }] }.
// The Polygon geometry type is in the EONET docs but was not in the sample: it is read as the mean of its first ring (unverified).
// EONET is awareness data, not an official warning: it never notifies (tier 2, digest and the World list only), and every row says so.
import { type AlertRow, phTime } from './parse.ts'

const H = 3_600_000
export const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=3'
export const EONET_TTL_H = 72
/** Philippines and the western Pacific around it, wide enough for a typhoon that may come. The feed is global; a wildfire elsewhere is not our business. */
export const EONET_BOX = { minLat: -5, maxLat: 30, minLon: 100, maxLon: 155 }
/** Categories with no action for a family here. */
const SKIP = new Set(['seaLakeIce', 'snow', 'waterColor', 'manmade'])

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)

function point(coords: unknown, type: unknown): { lat: number; lon: number } | null {
  if (type === 'Point' && Array.isArray(coords)) {
    const lon = num(coords[0]), lat = num(coords[1])
    return lat !== null && lon !== null ? { lat, lon } : null
  }
  if (type === 'Polygon' && Array.isArray(coords) && Array.isArray(coords[0]) && coords[0].length) {
    const ring = (coords[0] as unknown[]).map((p) => (Array.isArray(p) ? [num(p[0]), num(p[1])] : [null, null]))
    if (ring.some((p) => p[0] === null || p[1] === null)) return null
    return { lon: ring.reduce((s, p) => s + p[0]!, 0) / ring.length, lat: ring.reduce((s, p) => s + p[1]!, 0) / ring.length }
  }
  return null
}

const DO_NOW = 'Nothing to do now. This is for awareness. Follow PAGASA and PHIVOLCS for official warnings and your local DRRMO for instructions.'

/** One row per open event whose newest position is inside EONET_BOX and newer than the expiry. null when the payload is not the EONET shape (the source fails, old rows stay, marked stale). */
export function parseEonet(payload: unknown, now: number): AlertRow[] | null {
  const events = (payload as { events?: unknown } | null)?.events
  if (!Array.isArray(events)) return null
  const out: AlertRow[] = []
  for (const e of events as Record<string, any>[]) {
    if (typeof e?.id !== 'string' || !/^EONET_\d{1,12}$/.test(e.id) || typeof e.title !== 'string' || !e.title || e.closed != null || !Array.isArray(e.geometry) || !e.geometry.length) continue
    const cat = Array.isArray(e.categories) ? e.categories[0] : null
    if (typeof cat?.id === 'string' && SKIP.has(cat.id)) continue
    // newest geometry by date; an unreadable date never wins
    const geos = (e.geometry as Record<string, any>[]).map((g) => ({ t: Date.parse(g?.date), p: point(g?.coordinates, g?.type), g })).filter((x) => Number.isFinite(x.t) && x.t <= now + H && x.p) // a future-dated point is a forecast or a clock error: never the "latest point"
    if (!geos.length) continue
    const last = geos.reduce((a, b) => (b.t >= a.t ? b : a))
    const { lat, lon } = last.p!
    if (lat < EONET_BOX.minLat || lat > EONET_BOX.maxLat || lon < EONET_BOX.minLon || lon > EONET_BOX.maxLon) continue
    const expires = last.t + EONET_TTL_H * H
    if (expires <= now) continue
    const mv = num(last.g.magnitudeValue)
    const unit = typeof last.g.magnitudeUnit === 'string' && /^[A-Za-z%/ ]{1,12}$/.test(last.g.magnitudeUnit) ? last.g.magnitudeUnit : '' // short plain words only: it reaches a title
    const level = mv === null ? null : `${mv}${unit ? ' ' + unit : ''}`
    const catTitle = typeof cat?.title === 'string' && cat.title ? cat.title : 'Event'
    const title = clip(e.title, 160)
    const srcs = Array.isArray(e.sources) ? (e.sources as Record<string, unknown>[]).map((s) => s?.id).filter((s): s is string => typeof s === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(s)).slice(0, 5) : []
    out.push({
      id: `eonet-${e.id}`,
      kind: 'eonet',
      level,
      title,
      what: `${catTitle}: ${title}${level ? `, latest reading ${level}` : ''}. Seen from satellite and agency reports. This is not an official warning.`,
      where_text: `Near ${lat.toFixed(1)}, ${lon.toFixed(1)} (latest point)`,
      when_text: phTime(last.t),
      do_now: DO_NOW,
      source: 'EONET',
      source_url: typeof e.link === 'string' && e.link.length <= 300 && e.link.startsWith('https://eonet.gsfc.nasa.gov/') ? e.link : null,
      issued_at: new Date(last.t).toISOString(),
      lat,
      lon,
      bulletin: [`${catTitle}: ${title}.`, level ? `Latest reading: ${level}.` : 'Latest reading: not given.', `Latest point: ${phTime(last.t)}.`, srcs.length ? `Reported by: ${srcs.join(', ')}.` : 'Reporter: not given.', 'Source: NASA EONET. Awareness only, not an official warning.'].join('\n'),
      checklist: null,
      timeline: null,
      expires_at: new Date(expires).toISOString()
    })
  }
  return out
}
