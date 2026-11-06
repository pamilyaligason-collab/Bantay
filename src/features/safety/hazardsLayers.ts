import { useEffect, useState } from 'react'
import { db } from '../../db'
import type { HazardView, Tone } from './hazardCards'
import type { HazardLevels } from './hazardLookup'

const NOAH_WORD = ['Low', 'Medium', 'High'] as const

export const NOAH_URL = 'https://noah.up.edu.ph/'
export const LAYERS = [{ id: 'flood', label: 'Flood' }, { id: 'landslide', label: 'Landslide' }, { id: 'surge', label: 'Storm surge' }] as const
export type LayerId = (typeof LAYERS)[number]['id']
export interface LayerState { label: string; reading: string | null; tone: Tone; text: string }

/** What the layer switch says. The map has no hazard tiles, so the caption says so; the reading is the one HazardHunterPH value we hold. */
export function layerState(id: LayerId, v: HazardView | null, hz?: HazardLevels | null): LayerState {
  const label = LAYERS.find((l) => l.id === id)!.label
  // NOAH level from the phone's hazard file (flag localPacks). Null = no file or outside its bounds: fall through to what we had.
  const lv = hz?.[id]
  if (lv !== undefined && lv !== null) {
    if (lv === 0) return { label, reading: null, tone: 'none', text: `No mapped ${label.toLowerCase()} hazard here in NOAH's maps (100-year scenario). That is not a promise of safety: the maps may not cover every place, and a phone's position can be off by tens of metres.` }
    const reading = NOAH_WORD[lv - 1]!
    return { label, reading, tone: lv === 1 ? 'good' : 'warn', text: `${label} level from NOAH: ${reading} (about 10 m accuracy).` }
  }
  if (!v) return { label, reading: null, tone: 'none', text: 'Not checked for this place yet.' }
  const card = v.cards.find((c) => c.id === id)
  const reading = card?.readings[0]?.value ?? null
  if (reading === null) return { label, reading: null, tone: 'none', text: `No ${label.toLowerCase()} map for this place yet. Hazard maps arrive with the local data pack.` }
  return { label, reading, tone: card!.tone, text: `${label} reading from HazardHunterPH: ${reading}. The map shows your place only; hazard layers arrive with the local data pack.` }
}

/** "17 Oct 2026" from the "read 2026-10-17" tail of the hazards source line, else null. */
export function readDate(source: string): string | null {
  const m = /read (\d{4})-(\d{2})-(\d{2})/.exec(source)
  if (!m) return null
  return new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

/* ---- The six rings (flag localPacks) ---- */
export type RingId = 'quake' | 'flood' | 'landslide' | 'surge' | 'tsunami' | 'liquefaction'
/** filled = a reading; none = NOAH maps no hazard here (empty solid ring); dashed = nothing on this phone, or only on HazardHunterPH. */
export interface RingData { id: RingId; label: string; state: 'filled' | 'none' | 'dashed'; /** text inside the ring */ word: string; /** 1 green, 2 amber, 3 red; 0 when not filled */ level: 0 | 1 | 2 | 3; /** 0..1 */ fill: number }
const ROMAN: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 }
const dashed = (id: RingId, label: string): RingData => ({ id, label, state: 'dashed', word: '--', level: 0, fill: 0 })

/** Earthquake from the HazardHunterPH reading (the intensity as printed, e.g. "VIII"); flood, landslide and storm surge from NOAH levels on the phone; tsunami and liquefaction are not in NOAH, so they stay dashed. Levels and their wording are never changed here. */
export function ringsFor(v: HazardView | null, hz?: HazardLevels | null): RingData[] {
  const m = /intensity\s+(X|IX|VIII|VII|VI|V|IV|III|II|I)\b/i.exec(v?.cards.find((c) => c.id === 'quake')?.readings[0]?.value ?? '')
  const n = m ? ROMAN[m[1]!.toUpperCase()]! : 0
  const quake: RingData = n ? { id: 'quake', label: 'Earthquake', state: 'filled', word: m![1]!.toUpperCase(), level: n >= 7 ? 3 : n >= 5 ? 2 : 1, fill: n / 10 } : dashed('quake', 'Earthquake')
  const noah = LAYERS.map((l): RingData => {
    const lv = hz?.[l.id]
    if (lv === undefined || lv === null) return dashed(l.id, l.label)
    if (lv === 0) return { id: l.id, label: l.label, state: 'none', word: 'No hazard mapped', level: 0, fill: 0 }
    return { id: l.id, label: l.label, state: 'filled', word: NOAH_WORD[lv - 1]!, level: lv, fill: lv / 3 }
  })
  return [quake, ...noah, dashed('tsunami', 'Tsunami'), dashed('liquefaction', 'Liquefaction')]
}

/* ---- The NOAH layer over the map ---- */
type Leaflet = typeof import('leaflet')
/** Same rule as hazardsAt: a file with per-layer bounds covers a layer only inside that layer's box (no box = not in the file); an older row with no bounds at all is judged by the levels gate. */
const covers = (all: Record<string, number[]> | undefined, id: string, lat: number, lon: number) => {
  if (!all || Array.isArray(all)) return true
  const b = all[id]
  return !!b && b.length === 4 && lon >= b[0]! && lon <= b[2]! && lat >= b[1]! && lat <= b[3]!
}

/** The unit's stored hazard file when it covers this point for this layer, or null. Null while off, no unit, nothing is stored, or the point is outside the layer's bounds. */
export function useHazardBlob(lat: number, lon: number, id: LayerId, on: boolean, unit: string | null): Blob | null {
  const [blob, setBlob] = useState<Blob | null>(null)
  useEffect(() => {
    if (!on || !unit) { setBlob(null); return }
    let live = true
    // Same file the levels came from (useHazards): the unit's owner row, not the first row that happens to cover the point.
    void (async () => {
      const row = await db.packs.get(unit)
      const owner = row?.hazardsFrom ? await db.packs.get(row.hazardsFrom) : row
      if (live) setBlob(owner?.hazards && covers(owner.hazards.bounds, id, lat, lon) ? owner.hazards.blob : null)
    })().catch(() => { if (live) setBlob(null) })
    return () => { live = false }
  }, [on, lat, lon, id, unit])
  return blob
}

/** The text a level-0 ring says to a screen reader: the layerState wording, never "safe". */
export const noneRingText = (label: string) => `${label}: no mapped hazard in NOAH's maps (100-year scenario). Not a promise of safety.`

let warned = false
/** One report per session when the hazard overlay fails; the map stays usable without it. */
function warnOnce(e: unknown) {
  if (warned) return
  warned = true
  import('../monitor/errors').then((m) => m.reportError('unhandledrejection', e instanceof Error ? `${e.name}: ${e.message}` : 'hazard overlay', e)).catch(() => console.warn('hazard overlay failed, showing the map without it'))
}

/** Token names for the three levels; the canvas needs real colours, so they are read from the page when the layer is added. */
export const LEVEL_INK = { 1: '--tint-green-ink', 2: '--tint-amber-ink', 3: '--tint-red-ink' } as const

/** One paint rule per level: each matches only its own level and paints that level's token colour. */
export function hazardPaintRules<S>(Sym: new (o: { fill: string; opacity: number }) => S, read: (token: string) => string, id: LayerId) {
  return ([1, 2, 3] as const).map((n) => ({ dataLayer: id, filter: (_z: number, f: { props: Record<string, unknown> }) => f.props.level === n, symbolizer: new Sym({ fill: read(LEVEL_INK[n]) || 'gray', opacity: 0.5 }) }))
}

/** A Leaflet layer painting one NOAH layer from a stored hazard file: a polygon per level, token colours, translucent so the street map shows through.
 *  The files stop at their own max zoom; protomaps-leaflet scales those tiles up past it (blocky, not missing). Libraries load when the layer is added. */
export function hazardOverlay(L: Leaflet, blob: Blob, id: LayerId) {
  const group = L.layerGroup()
  let run = 0, inner: import('leaflet').Layer | null = null
  group.on('add', () => {
    const mine = ++run
    void (async () => {
      const [{ leafletLayer, PolygonSymbolizer }, { PMTiles }, { blobSource }, { parseHeader }] = await Promise.all([import('protomaps-leaflet'), import('pmtiles'), import('./basemap'), import('./hazardLookup')])
      if (mine !== run) return
      const head = parseHeader(new Uint8Array(await blob.slice(0, 127).arrayBuffer()))
      const css = getComputedStyle(document.documentElement)
      const paintRules = hazardPaintRules(PolygonSymbolizer, (t) => css.getPropertyValue(t).trim(), id)
      inner = leafletLayer({ url: new PMTiles(blobSource(blob, `hazard:${id}:${blob.size}`)), paintRules, labelRules: [], maxDataZoom: head.maxZoom, maxZoom: 19, pane: 'overlayPane', attribution: '' }) as unknown as import('leaflet').Layer
      group.addLayer(inner)
    })().catch(warnOnce)
  })
  group.on('remove', () => { run++; if (inner) { group.removeLayer(inner); inner = null } })
  return group
}
