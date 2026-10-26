// PAGASA public alert feed (Atom index + CAP 1.2 documents), https://publicalert.pagasa.dost.gov.ph/feeds/ . Rights element: CC BY 4.0, so every row
// says "PAGASA, CC BY 4.0". Pure functions, no network: vitest imports this file.
// The feed carries tropical cyclone wind signals (wcp), tropical cyclone alerts (acp) and general flood advisories (gfa). It has no thunderstorm product.
// Only rows that concern a home zone are kept (an area-wide row would rank first for every family member). Unknown stays null.
import { type AlertRow, type Zone, ZONES, phTime, tag, unesc } from './parse.ts'

export const FEED_URL = 'https://publicalert.pagasa.dost.gov.ph/feeds/'
export const ATTRIBUTION = 'PAGASA, CC BY 4.0'
const TC_URL = 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin'
const FLOOD_URL = 'https://www.pagasa.dost.gov.ph/flood'
const H = 3_600_000
/** Only CAP files the index updated within this window are fetched (a wind signal lives 12 h; the window also shows a lifted signal). */
export const WINDOW_H = 30
export const MAX_CAPS = 40

// shortcut: PAGASA names provinces and cities, the app knows two points. Aliases are lower-case substrings of an areaDesc token; add one when a bulletin names the zone differently.
export const ZONE_AREAS: Record<string, string[]> = {
  dampas: ['bohol', 'tagbilaran'],
  conel: ['general santos', 'south cotabato', 'sarangani']
}

export interface FeedEntry { type: 'wcp' | 'acp' | 'gfa'; title: string; updated: number; url: string }

/** Atom index -> CAP entries we understand, newest first. null when the payload is not the expected feed. */
export function parseFeed(xml: unknown): FeedEntry[] | null {
  if (typeof xml !== 'string' || !xml.includes('<feed') || !xml.includes('Atom')) return null
  const out: FeedEntry[] = []
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const href = /<link[^>]*href="([^"]+\.cap)"/.exec(m[1])?.[1]
    const type = href ? /\/output\/(wcp|acp|gfa)\//.exec(href)?.[1] : undefined
    const updated = Date.parse(tag(m[1], 'updated') ?? '')
    if (!href || !type || !Number.isFinite(updated)) continue
    out.push({ type: type as FeedEntry['type'], title: tag(m[1], 'title') ?? '', updated, url: href.startsWith('//') ? 'https:' + href : href })
  }
  return out.sort((a, b) => b.updated - a.updated)
}

/** The CAP urls worth fetching this run. */
export const capUrls = (entries: FeedEntry[], now: number): string[] =>
  // a future-dated entry is a clock error: ignored
  entries.filter((e) => e.updated >= now - WINDOW_H * H && e.updated <= now + H).slice(0, MAX_CAPS).map((e) => e.url)

export interface Cap {
  id: string
  type: 'wcp' | 'acp' | 'gfa'
  sent: number
  expires: number
  msgType: string
  responseType: string
  severity: string
  headline: string
  description: string
  signal: number | null
  refs: string[]
  areas: { name: string; poly: [number, number][] | null }[]
}

const num = (v: string | null): number | null => (v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** One CAP document. null when it is not a PAGASA CAP we understand (the caller drops it, never guesses). */
export function parseCap(xml: unknown): Cap | null {
  if (typeof xml !== 'string' || !xml.includes('<alert')) return null
  const body = xml.replace(/<Signature[\s\S]*?<\/Signature>/, '')
  const id = tag(body, 'identifier')
  const sent = Date.parse(tag(body, 'sent') ?? '')
  const expires = Date.parse(tag(body, 'expires') ?? '')
  const event = tag(body, 'event') ?? ''
  const type = /Tropical Cyclone Warning/i.test(event) ? 'wcp' : /Tropical Cyclone Alert/i.test(event) ? 'acp' : /Flood Advisory/i.test(event) ? 'gfa' : null
  if (!id || !type || !Number.isFinite(sent) || !Number.isFinite(expires)) return null
  const headline = tag(body, 'headline') ?? event
  const sig = /Public Storm Warning Signal Level<\/valueName><value>(\d)/.exec(body)?.[1] ?? /Signal #(\d)/.exec(headline)?.[1] ?? null
  const refs = (tag(body, 'references') ?? '').split(/\s+/).map((r) => r.split(',')[1]).filter((r): r is string => !!r)
  const areas = [...body.matchAll(/<area>([\s\S]*?)<\/area>/g)].map((a) => {
    const poly = tag(a[1], 'polygon')
    const pts = poly ? poly.split(/\s+/).map((p) => p.split(',').map(Number) as [number, number]) : null
    return { name: tag(a[1], 'areaDesc') ?? '', poly: pts && pts.length >= 3 && pts.every((p) => p.length === 2 && p.every(Number.isFinite)) ? pts : null }
  })
  return {
    id, type, sent, expires, headline,
    msgType: tag(body, 'msgType') ?? '', responseType: tag(body, 'responseType') ?? '', severity: tag(body, 'severity') ?? '',
    description: (tag(body, 'description') ?? '').replace(/\r/g, ''), signal: num(sig), refs, areas
  }
}

function inPoly(p: { lat: number; lon: number }, poly: [number, number][]): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j]
    if (yi > p.lat !== yj > p.lat && p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** The area names of `cap` that concern `zone` (polygon first, then the alias list). [] = not this zone. */
export function areasFor(cap: Cap, zone: Zone): string[] {
  const alias = ZONE_AREAS[zone.id] ?? []
  const names = cap.areas.filter((a) => (a.poly ? inPoly(zone, a.poly) : false) || a.name.split(',').some((t) => alias.some((x) => t.toLowerCase().includes(x)))).map((a) => a.name)
  return [...new Set(names.flatMap((n) => n.split(',').map((t) => t.trim()).filter(Boolean)))]
}

/** "Typhoon Rosal (CHAMPI)" from "Tropical Cyclone Warning : Typhoon Rosal (CHAMPI) Signal #1". */
export const stormOf = (headline: string): string => (/:\s*(.*?)\s*(?:Signal\s*#\d)?$/.exec(headline)?.[1] ?? headline).trim()
const stormKey = (headline: string): string =>
  stormOf(headline).replace(/^(super\s+|severe\s+)?(tropical\s+)?(typhoon|storm|depression|cyclone)\s+/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const SIGNAL_DO_NOW =
  'Follow your local DRRMO. Charge your phone and power bank, and keep medicines and your go-bag ready. If you are told to evacuate, go early.'
const doNowFor = (n: number) => (n >= 3 ? `Stay indoors once the wind starts and keep away from windows. Do not go to sea. ${SIGNAL_DO_NOW}` : `Strong winds are possible. Tie down loose things outside. ${SIGNAL_DO_NOW}`)
const FLOOD_DO_NOW = 'Follow your local DRRMO. Do not walk or drive through floodwater. Move to higher ground if water is rising.'

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const plain = (s: string) => unesc(s).replace(/\*\*/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
const firstBlock = (s: string) => plain(s).split(/\n\s*\n/)[0].replace(/\s*\n\s*/g, ' ')

const ended = (now: number): string => new Date(now).toISOString()

function tcRow(zone: Zone, storm: string, key: string, cap: Cap, signal: number, names: string[], expires: string, now: number, active: boolean): AlertRow {
  const where = `${names.join(', ')} (near ${zone.name})`
  return {
    id: `pagasa-tcws-${key}-${zone.id}`,
    kind: 'tcws',
    level: active ? `Signal No. ${signal}` : null,
    title: active ? `Wind Signal No. ${signal} for ${zone.name}: ${storm}` : `Wind signal lifted for ${zone.name}: ${storm}`,
    what: active ? firstBlock(cap.description) || cap.headline : `PAGASA no longer lists ${names.join(', ')} under a wind signal for ${storm}.`,
    where_text: where,
    when_text: phTime(cap.sent),
    do_now: active ? doNowFor(signal) : 'Follow your local DRRMO and the PAGASA bulletin.',
    source: 'PAGASA',
    source_url: TC_URL,
    issued_at: new Date(cap.sent).toISOString(),
    lat: zone.lat,
    lon: zone.lon,
    bulletin: `${plain(cap.description)}\nIssued: ${phTime(cap.sent)}.\nSource: ${ATTRIBUTION}.`,
    checklist: null,
    timeline: null,
    expires_at: active ? expires : ended(now)
  }
}

/** Wind signals: per storm, the newest bulletin decides. A later Tropical Cyclone Alert (acp) means every signal is lifted. One row per storm and zone;
 *  a row for a zone that was listed earlier in the window but is not any more is written already expired so it stops showing. */
export function tcwsRows(caps: Cap[], now: number): AlertRow[] {
  const rows: AlertRow[] = []
  const storms = new Map<string, Cap[]>()
  for (const c of caps) if (c.type !== 'gfa') storms.set(stormKey(c.headline), [...(storms.get(stormKey(c.headline)) ?? []), c])
  for (const [key, list] of storms) {
    const wcp = list.filter((c) => c.type === 'wcp')
    if (!wcp.length || !key) continue
    const newest = Math.max(...wcp.map((c) => c.sent))
    const lifted = list.some((c) => c.type === 'acp' && c.sent > newest)
    for (const zone of ZONES) {
      const cover = wcp.filter((c) => areasFor(c, zone).length).sort((a, b) => b.sent - a.sent)
      if (!cover.length) continue
      const cur = lifted ? [] : cover.filter((c) => c.sent === newest)
      const top = cur.sort((a, b) => (b.signal ?? 0) - (a.signal ?? 0))[0]
      const storm = stormOf(cover[0].headline)
      if (top && top.signal !== null && top.expires > now) {
        rows.push(tcRow(zone, stormOf(top.headline), key, top, top.signal, areasFor(top, zone), new Date(Math.max(...cur.map((c) => c.expires))).toISOString(), now, true))
      } else if (cover[0].expires > now) { // had a live signal before: expire it now
        rows.push(tcRow(zone, storm, key, cover[0], cover[0].signal ?? 0, areasFor(cover[0], zone), '', now, false))
      }
    }
  }
  return rows
}

/** General flood advisories (tier 2): per zone, the newest advisory that nothing replaced. A Final (AllClear) or a Cancel ends it. */
export function gfaRows(caps: Cap[], now: number): AlertRow[] {
  const gfa = caps.filter((c) => c.type === 'gfa')
  const replaced = new Set(gfa.flatMap((c) => c.refs))
  const rows: AlertRow[] = []
  for (const zone of ZONES) {
    const cover = gfa.filter((c) => c.msgType !== 'Cancel' && areasFor(c, zone).length).sort((a, b) => b.sent - a.sent)
    const live = cover.find((c) => !replaced.has(c.id))
    const last = live ?? cover[0]
    if (!last) continue
    // replaced or cancelled with nothing left for this zone, or a Final advisory: write the row already expired so the old one stops showing
    const over = !live || live.responseType === 'AllClear'
    const final = live?.responseType === 'AllClear' // else a newer advisory just dropped the zone
    if (live && !over && live.expires <= now) continue // lapsed on its own: the stored row has expired already
    if (!live && last.expires <= now) continue
    const names = areasFor(last, zone)
    const head = firstBlock(last.description.split(/WATERCOURSES/i)[0])
    rows.push({
      id: `pagasa-rain-${zone.id}`,
      kind: 'rainfall',
      level: over ? null : last.severity || null,
      title: over ? `Flood advisory ended for ${zone.name}` : `General Flood Advisory for ${zone.name}`,
      what: over ? `PAGASA's ${final ? 'final' : 'latest'} flood advisory no longer lists ${names.join(', ')}.` : clip(head, 400) || last.headline,
      where_text: `${names.join(', ')} (near ${zone.name})`,
      when_text: phTime(last.sent),
      do_now: over ? 'Follow your local DRRMO and the PAGASA bulletin.' : FLOOD_DO_NOW,
      source: 'PAGASA',
      source_url: FLOOD_URL,
      issued_at: new Date(last.sent).toISOString(),
      lat: zone.lat,
      lon: zone.lon,
      bulletin: `${clip(plain(last.description), 3000)}\nIssued: ${phTime(last.sent)}.\nSource: ${ATTRIBUTION}.`,
      checklist: null,
      timeline: null,
      expires_at: over ? ended(now) : new Date(last.expires).toISOString()
    })
  }
  return rows
}

/** Parse the index plus its CAP texts (index first). null = the source fails this run (stale, old rows kept): the index is not the feed, any fetched CAP
 *  cannot be read, or a wind CAP has no readable signal. Unknown is never "lifted": a lift needs a parsed newer bulletin that no longer lists the zone. */
export function parsePagasa(payloads: unknown[], now: number): AlertRow[] | null {
  if (parseFeed(payloads[0]) === null) return null
  const caps = payloads.slice(1).map(parseCap).filter((c): c is Cap => c !== null)
  if (caps.length !== payloads.length - 1 || caps.some((c) => c.type === 'wcp' && c.signal === null)) return null
  return [...tcwsRows(caps, now), ...gfaRows(caps, now)]
}

export const signalOf = (level: string | null): number | null => {
  const n = /Signal No\. (\d)/.exec(level ?? '')?.[1]
  return n ? Number(n) : null
}
