import { useEffect, useMemo, useState } from 'react'
import { db } from '../../db'
import { supabase } from '../auth/client'
import { provinceNameAt } from '../garden/climate'
import type { PlaceLike } from '../location/placeWords'
import { loadUnits, unitAt, type Unit } from './unitAt'

/** A public.pagasa_warnings row (migration 0059), filled every 30 min by the pagasa-warnings function. */
export interface PagasaRow {
  dedupe_key: string; kind: 'tropical_cyclone' | 'rainfall' | 'advisory'; title: string; issued_at: string | null; areas: string
  signals: { level: number; areas: string }[]; source_url: string; fetched_at: string
}
/** saved: the read failed and this is the copy kept on the phone; readAt: when the rows were last read (ms). */
export interface PagasaData { rows: PagasaRow[]; saved: boolean; readAt: number }
const CACHE = 'safety.pagasa'
export const PAGASA_HOME = 'https://www.pagasa.dost.gov.ph/'
export const CURRENT_MS = 2 * 3_600_000
export const SAVED_MS = 24 * 3_600_000

const KINDS = ['tropical_cyclone', 'rainfall', 'advisory']
const valid = (r: unknown): r is PagasaRow => {
  const o = (r ?? {}) as Record<string, unknown>
  return typeof o.title === 'string' && o.title !== '' && KINDS.includes(o.kind as string) && typeof o.source_url === 'string' && o.source_url.startsWith(PAGASA_HOME) &&
    typeof o.fetched_at === 'string' && Number.isFinite(Date.parse(o.fetched_at)) && (o.issued_at == null || typeof o.issued_at === 'string')
}
const clean = (r: PagasaRow): PagasaRow => ({
  ...r, areas: typeof r.areas === 'string' ? r.areas : '',
  signals: (Array.isArray(r.signals) ? r.signals : []).filter((s) => s && Number.isInteger(Number(s.level)) && Number(s.level) >= 1 && Number(s.level) <= 5).map((s) => ({ level: Number(s.level), areas: String(s.areas ?? '') }))
})

let memo: { at: number; p: Promise<PagasaData | null> } | null = null
export const resetPagasa = () => { memo = null } // tests

/** The newest rows of pagasa_warnings (signed-in read), saved on the phone; the saved copy stands in when the read fails. null = nothing known (a missing table reads as null, never an error). */
export function loadPagasa(now: number = Date.now()): Promise<PagasaData | null> {
  if (memo && now - memo.at < 30_000) return memo.p
  const p = (async (): Promise<PagasaData | null> => {
    try {
      if (!supabase) throw new Error('not_connected')
      const { data, error } = await supabase.from('pagasa_warnings').select('dedupe_key,kind,title,issued_at,areas,signals,source_url,fetched_at').gte('fetched_at', new Date(now - 14 * 86_400_000).toISOString()).order('issued_at', { ascending: false, nullsFirst: false }).limit(30)
      if (error) {
        if (/does not exist|schema cache|42P01|PGRST205/i.test(`${error.message} ${error.code ?? ''}`)) return null
        throw new Error('read')
      }
      const out: PagasaData = { rows: ((data ?? []) as unknown[]).filter(valid).map(clean), saved: false, readAt: now }
      // only rows that were current when read may be kept: a saved copy never shows a row that was already stale
      await db.kv.put({ key: CACHE, value: { ...out, rows: out.rows.filter((r) => now - Date.parse(r.fetched_at) <= CURRENT_MS) } }).catch(() => undefined)
      return out
    } catch {
      const s = (await db.kv.get(CACHE).catch(() => undefined))?.value as PagasaData | undefined
      return s && Array.isArray(s.rows) && Number.isFinite(s.readAt) ? { rows: s.rows, saved: true, readAt: s.readAt } : null
    }
  })()
  memo = { at: now, p }
  return p
}

/** undefined until the first read settles; null when nothing is known. */
export function usePagasa(): PagasaData | null | undefined {
  const [d, setD] = useState<PagasaData | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    const read = () => { void loadPagasa().then((r) => { if (live) setD(r && { ...r }) }, () => { if (live) setD(null) }) }
    const vis = () => { if (document.visibilityState === 'visible') read() }
    read()
    window.addEventListener('online', read)
    document.addEventListener('visibilitychange', vis)
    return () => { live = false; window.removeEventListener('online', read); document.removeEventListener('visibilitychange', vis) }
  }, [])
  return d
}

const cyclone = (t: string) => t.replace(/\s*[-–]?\s*(Tropical Cyclone )?Bulletin\s*#?\d+.*$/i, '').trim().toLowerCase()

/** Rows to show: a live read keeps rows fetched in the last 2 h; a saved copy shows as saved (nothing once older than 24 h). At most 3, cyclones first, then newest bulletin. */
export function shownRows(d: PagasaData | null, now: number = Date.now()): PagasaRow[] {
  if (!d) return []
  if (d.saved && now - d.readAt > SAVED_MS) return []
  const t = (r: PagasaRow) => (r.issued_at ? Date.parse(r.issued_at) || 0 : 0)
  return d.rows
    .filter((r) => (d.saved ? d.readAt : now) - Date.parse(r.fetched_at) <= CURRENT_MS)
    .filter((r, _i, all) => r.kind !== 'tropical_cyclone' || !all.some((o) => o !== r && o.kind === r.kind && cyclone(o.title) === cyclone(r.title) && t(o) > t(r))) // newest bulletin per cyclone only
    .sort((a, b) => Number(b.kind === 'tropical_cyclone') - Number(a.kind === 'tropical_cyclone') || t(b) - t(a))
    .slice(0, 3)
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const hasWord = (text: string, name: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(name)}(?![\\p{L}\\p{N}])`, 'iu').test(text)

export type PagasaPlace = Pick<PlaceLike, 'source' | 'zone' | 'weather'>
/** The place names a bulletin may list for a home zone (the app knows zones, not provinces). */
export const PLACE_NAMES: Record<string, string[]> = { dampas: ['Bohol'], conel: ['South Cotabato', 'General Santos'] }

/** Cyclone signal lines. Never says a place is safe: a name that is not listed adds nothing. */
export function signalLines(r: PagasaRow, names: readonly string[] = []): string[] {
  if (r.kind !== 'tropical_cyclone') return []
  if (!r.signals.length) return ['No wind signal in this bulletin.']
  const out = [`Signal #${Math.max(...r.signals.map((s) => s.level))} raised. Check if your place is listed.`]
  let best: { level: number; name: string } | null = null
  for (const s of r.signals) for (const n of names) if (hasWord(s.areas, n) && (!best || s.level > best.level)) best = { level: s.level, name: n }
  if (best) out.push(`Signal #${best.level} lists ${best.name}.`)
  return out
}

export const tone = (rows: readonly PagasaRow[]): 'red' | 'amber' | undefined => {
  const top = Math.max(0, ...rows.flatMap((r) => (r.kind === 'tropical_cyclone' ? r.signals.map((s) => s.level) : [])))
  return top >= 3 ? 'red' : top >= 1 ? 'amber' : undefined
}
export const cut = (s: string, n = 160): string => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s)
export const manilaTime = (iso: string | number): string => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })

/** Names a bulletin may use for the place. A phone fix: the province there plus the city unit's own name; the saved zone: the zone map (only the home fallback); abroad: none. */
export function placeNames(place: PagasaPlace | null, units: readonly Unit[] | null): string[] {
  if (!place) return []
  if (place.source === 'zone') return PLACE_NAMES[place.zone] ?? []
  if ((place.source !== 'gps' && place.source !== 'last') || !place.weather || !units) return []
  const u = units.find((x) => x.code === unitAt(place.weather!, units))
  const prov = provinceNameAt(place.weather, units)
  return [...new Set([prov, u?.name].filter((n): n is string => !!n))]
}

/** placeNames, with the province units loaded for a phone fix (none until they are, so nothing is claimed early). */
export function usePlaceNames(place: PagasaPlace | null): string[] {
  const [units, setUnits] = useState<Unit[] | null>(null)
  const fix = place?.source === 'gps' || place?.source === 'last'
  useEffect(() => {
    if (!fix) return
    let live = true
    void loadUnits().then((u) => { if (live) setUnits(u) }, () => undefined)
    return () => { live = false }
  }, [fix])
  const source = place?.source, zone = place?.zone, lat = place?.weather?.lat, lon = place?.weather?.lon
  return useMemo(() => placeNames(source ? { source, zone: zone ?? '', weather: lat != null && lon != null ? { lat, lon } : undefined } : null, units), [source, zone, lat, lon, units])
}
