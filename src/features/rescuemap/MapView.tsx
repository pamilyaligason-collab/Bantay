import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { LatLon } from '../location/geo'
import type { Pin } from './logic'

const ICON: Record<Pin['kind'], string> = { evac: 'E', health: '+', police: 'P', fire: 'F' }
const dot = (cls: string, text = '') => L.divIcon({ className: '', html: `<span class="rm-pin ${cls}">${text}</span>`, iconSize: [36, 36], iconAnchor: [18, 18] })

/** Leaflet map in its own chunk (dynamic import from RescueMap). Re-centre is a button in the parent via the `focus` counter. */
export default function MapView({ me, pins, onPick, focus }: { me: LatLon; pins: Pin[]; onPick: (p: Pin) => void; focus: number }) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!box.current) return
    const m = L.map(box.current, { center: [me.lat, me.lon], zoom: 15, zoomControl: true })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' }).addTo(m)
    L.marker([me.lat, me.lon], { icon: dot('me'), keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(m)
    layer.current = L.layerGroup().addTo(m)
    map.current = m
    return () => { m.remove(); map.current = null; layer.current = null }
  }, [me.lat, me.lon])

  useEffect(() => {
    const g = layer.current
    if (!g) return
    g.clearLayers()
    for (const p of pins) {
      L.marker([p.lat, p.lon], { icon: dot(p.kind, ICON[p.kind]), title: p.name, alt: p.name }).on('click', () => onPick(p)).addTo(g)
    }
  }, [pins, onPick, me.lat, me.lon])

  useEffect(() => {
    if (focus > 0) map.current?.setView([me.lat, me.lon], 15)
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className="rm-map" role="region" aria-label="Map of nearby help" />
}
