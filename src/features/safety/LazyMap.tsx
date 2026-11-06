import { useMemo, useRef, type ReactNode } from 'react'
import type { Map as LMap } from 'leaflet'
import { MapCard } from '../look'
import { prefersReducedMotion } from '../look/useReducedMotion'
import { FLAGS } from './flags'
import './lazymap.css'

type Leaflet = typeof import('leaflet')
export type MapSetup = (L: Leaflet, map: LMap) => void

/** A Leaflet map in a MapCard. Leaflet loads only when the card mounts, never in jsdom (tests assert the placeholder), and tiles come from OSM only.
 *  `depKey` changes when the map must be rebuilt; `setup` draws markers and may call map.fitBounds. Colours come from CSS classes in lazymap.css (tokens only). */
export default function LazyMap(p: { height: number; center: [number, number]; zoom: number; depKey: string; setup?: MapSetup; label: string; testId?: string; recentre?: boolean; recentreLabel?: string; overlay?: ReactNode }) {
  const map = useRef<LMap | null>(null)
  const render = useMemo(() => (el: HTMLDivElement) => {
    // shortcut: jsdom has no layout, so Leaflet is skipped there; Playwright covers the real map
    if (/jsdom/i.test(navigator.userAgent)) return () => {}
    let dead = false
    const fail = () => { if (dead) return; const m = document.createElement('p'); m.className = 'lm-fail'; m.setAttribute('role', 'status'); m.textContent = `${navigator.onLine ? 'Map could not load.' : 'Maps need internet.'} The list below still works.`; el.replaceChildren(m) }
    const maps = FLAGS.offlineMaps // off: exactly the OSM-only map below
    if (!navigator.onLine && !maps) { fail(); return () => { dead = true } }
    void Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css'), maps ? import('./basemap') : null]).then(async ([m, , bm]) => {
      if (dead) return
      const L = (m.default ?? m) as Leaflet
      const choice = bm ? await bm.chooseBasemap({ lat: p.center[0], lon: p.center[1], zoom: p.zoom }) : null
      if (dead) return
      if (choice?.kind === 'none') return fail()
      const calm = prefersReducedMotion()
      const lm = L.map(el, { center: p.center, zoom: p.zoom, zoomControl: false, attributionControl: false, zoomAnimation: !calm, fadeAnimation: !calm, markerZoomAnimation: !calm })
      if (bm && choice) bm.basemapLayer(L, choice).addTo(lm)
      else L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(lm)
      map.current = lm
      p.setup?.(L, lm)
    }).catch(fail)
    return () => { dead = true; map.current?.remove(); map.current = null }
  }, [p.depKey]) // eslint-disable-line react-hooks/exhaustive-deps -- rebuild only when depKey changes
  return (
    <div role="region" aria-label={p.label}>
      <MapCard height={p.height} credit="© OpenStreetMap contributors" render={render} testId={p.testId} overlay={p.overlay}
        onRecentre={p.recentre ? () => map.current?.setView(p.center, p.zoom) : undefined} recentreLabel={p.recentreLabel ?? 'Centre map on my place'} />
    </div>
  )
}
