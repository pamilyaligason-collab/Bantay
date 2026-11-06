import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { LatLon } from '../location/geo'
import { FLAGS } from '../safety/flags'
import type { Pin } from './logic'

const dot = (cls: string, text = '') => L.divIcon({ className: '', html: `<span class="rm-pin ${cls}">${text}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] })

/** Leaflet map in its own chunk (dynamic import from RescueMap). Re-centre is a button in the parent via the `focus` counter. */
export default function MapView({ me, pins, onPick, focus }: { me: LatLon; pins: Pin[]; onPick: (p: Pin) => void; focus: number }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { center: [me.lat, me.lon], zoom: 15, zoomControl: false, attributionControl: false })
    let dead = false
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
    if (FLAGS.offlineMaps) {
      // the shared basemap: a stored file, the streamed file inside a zone, else OSM pictures as before
      void import('../safety/basemap').then(async (bm) => {
        const choice = await bm.chooseBasemap({ lat: me.lat, lon: me.lon, zoom: 15 })
        if (!dead) bm.basemapLayer(L, choice.kind === 'none' ? { kind: 'osm' } : choice).addTo(m)
      }).catch(() => { if (!dead) osm.addTo(m) })
    } else osm.addTo(m)
    L.marker([me.lat, me.lon], { icon: dot('me'), keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => { dead = true; m.remove(); map.current = null; layer.current = null }
  }, [me.lat, me.lon])

  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    pins.forEach((p, i) => {
      L.marker([p.lat, p.lon], { icon: dot(p.kind, String(i + 1)), title: p.name, alt: p.name }).on('click', () => onPick(p)).addTo(g)
    })
  }, [pins, onPick, me.lat, me.lon])

  useEffect(() => {
    if (focus > 0) map.current?.setView([me.lat, me.lon], 15)
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className="rm-map" role="region" aria-label="Map of nearby help" />
}
