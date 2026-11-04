// PHIVOLCS page parsers. PARSER ONLY: not in SOURCES (ingest.ts), so nothing here runs in production. ALERTS.md says why it was skipped on purpose;
// wiring it is one line in SOURCES once the owner says so. Pure functions, no network: vitest imports this file.
// Shapes seen on 2026-11-04 (read-only fetch, no bot check; fixtures/phivolcs-quakes.html is the first 8 table rows, fixtures/phivolcs-volcano.html one bulletin page):
//  - https://earthquake.phivolcs.dost.gov.ph/ : one table, row = date link "04 November 2026 - 11:34 PM" (PST), latitude, longitude, depth km, magnitude, location text.
//  - https://wovodat.phivolcs.dost.gov.ph/bulletin/activity-<code>?bid=<n>&lang=en : one volcano's 24-hour bulletin with "ALERT LEVEL <n>". The list page
//    (/bulletin/list-of-bulletin) only has titles and links, so a wired source would fetch the list, then each English bulletin.
// Both pages are hand-made HTML and may change without notice: every parser returns null when the page is not the expected shape (the source would fail and keep old rows).
import { type AlertRow, nearest, phTime, QUAKE_RULES, unesc } from './parse.ts'

const H = 3_600_000
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
const QUAKE_DO_NOW = 'If you feel shaking: drop, cover and hold on. When it stops, check for injuries and damage, and move to open ground if you are near the sea and the shaking was strong or long.'
const VOLCANO_DO_NOW = 'Stay out of any danger zone set by PHIVOLCS. Follow PHIVOLCS bulletins and your local officials.'

const text = (s: string) => unesc(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
const num = (s: string): number | null => (s !== '' && Number.isFinite(Number(s)) ? Number(s) : null)

/** "04 November 2026 - 11:34 PM" (Philippine time) to epoch ms, or null. */
export function parsePhivolcsTime(s: string): number | null {
  const m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)$/i.exec(s.trim())
  if (!m) return null
  const mon = MONTHS.indexOf(m[2].toLowerCase())
  let hour = Number(m[4]) % 12
  if (m[6].toUpperCase() === 'PM') hour += 12
  if (mon < 0 || Number(m[4]) < 1 || Number(m[4]) > 12) return null
  return Date.UTC(Number(m[3]), mon, Number(m[1]), hour - 8, Number(m[5]))
}

/** The latest-earthquakes table. Rows older than 24 h, or outside the same relevance rules as USGS (QUAKE_RULES), are left out. null when no table row of the expected shape is found. */
export function parsePhivolcsQuakes(html: unknown, now: number): AlertRow[] | null {
  if (typeof html !== 'string' || !/LATEST EARTHQUAKE INFORMATION/i.test(html)) return null
  const out: AlertRow[] = []
  let seen = 0
  for (const tr of html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/g)) {
    const cells = [...tr[0].matchAll(/<td[\s>][\s\S]*?<\/td>/g)].map((c) => text(c[0]))
    const href = /<a[^>]*href="([^"]+)"/.exec(tr[0])?.[1]
    if (cells.length !== 6 || !href) continue
    const t = parsePhivolcsTime(cells[0])
    const lat = num(cells[1]), lon = num(cells[2]), depth = num(cells[3]), mag = num(cells[4])
    if (t === null || lat === null || lon === null || mag === null) return null // a row of the table's shape with unreadable values: the page changed, fail the source
    seen++
    const stem = href.replace(/\\/g, '/').split('/').pop()!.replace(/\.html?$/i, '')
    const { zone, km } = nearest({ lat, lon })
    if (!QUAKE_RULES.some((r) => mag >= r.minMag && km <= r.maxKm)) continue
    const expires = t + 24 * H
    if (expires <= now) continue
    const place = cells[5]
    out.push({
      id: `phivolcs-quake-${stem}`,
      kind: 'quake',
      level: `Magnitude ${mag.toFixed(1)}`,
      title: `Magnitude ${mag.toFixed(1)} earthquake, ${place}`,
      what: `Magnitude ${mag.toFixed(1)} earthquake, about ${Math.round(km)} km from ${zone.name}.`,
      where_text: place,
      when_text: phTime(t),
      do_now: QUAKE_DO_NOW,
      source: 'PHIVOLCS',
      source_url: 'https://earthquake.phivolcs.dost.gov.ph/',
      issued_at: new Date(t).toISOString(),
      lat,
      lon,
      bulletin: [`Magnitude ${mag.toFixed(1)}, ${place}.`, depth === null ? 'Depth: unknown.' : `Depth: ${depth.toFixed(0)} km.`, `Time: ${phTime(t)}.`, 'Source: PHIVOLCS.'].join('\n'),
      checklist: null,
      timeline: null,
      expires_at: new Date(expires).toISOString()
    })
  }
  return seen === 0 ? null : out
}

/** One volcano bulletin page (English). Alert level 0 is a quiet volcano: the row is written already expired so it shows nothing. A page without a readable name and level is null. */
export function parseVolcanoBulletin(html: unknown, now: number): AlertRow | null {
  if (typeof html !== 'string') return null
  const body = text(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ''))
  const name = /\b([A-Z][A-Z' ]*?) VOLCANO\b/.exec(body)?.[1]?.trim()
  const level = /ALERT LEVEL\s+(\d)\b/.exec(body)?.[1]
  const date = /Date:\s*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/.exec(body)?.[1]
  const issued = date ? Date.parse(`${date} 00:00:00 GMT+0800`) : NaN
  if (!name || level === undefined || !Number.isFinite(issued)) return null
  const n = Number(level)
  const volcano = name.charAt(0) + name.slice(1).toLowerCase()
  const high = n >= 1
  return {
    id: `phivolcs-volcano-${volcano.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    kind: 'volcano',
    level: `Alert Level ${n}`, // the ingest reads "Alert Level <n>" for the volcano tier-1 rule
    title: `${volcano} Volcano: Alert Level ${n}`,
    what: `PHIVOLCS lists ${volcano} Volcano at Alert Level ${n}.`,
    where_text: `${volcano} Volcano`,
    when_text: phTime(issued),
    do_now: VOLCANO_DO_NOW,
    source: 'PHIVOLCS',
    source_url: 'https://wovodat.phivolcs.dost.gov.ph/bulletin/list-of-bulletin',
    issued_at: new Date(issued).toISOString(),
    lat: null,
    lon: null,
    bulletin: `${volcano} Volcano, Alert Level ${n}.\nBulletin date: ${date}.\nSource: PHIVOLCS.`,
    checklist: null,
    timeline: null,
    expires_at: new Date(high ? Math.max(now, issued) + 72 * H : now).toISOString()
  }
}
