import { useRef, useState } from 'react'
import type { Map as LMap } from 'leaflet'
import { initialsOf } from '../auth/family'
import LazyMap, { type MapSetup } from '../safety/LazyMap'
import { placeAge } from './placeAge'
import { fitPlan } from './placeFit'
import type { Place } from './placeApi'
import './place.css'

const FALLBACK: [number, number] = [12.88, 121.77] // the Philippines, only for the instant before fitBounds runs

/** Family pins on the shared map (D-136, board S22FamilyMap). Each pin is a round badge with the person's initials; a point older than 6 h is drawn grey (class pm-grey, ring and fill, and the list under the map says "may be out of date").
 *  Uses LazyMap, so the offline basemap and the OSM fallback behave as on the Safety maps. Latest point only; no trail.
 *  S30 L9 (F2): when one member is in another country the map fits the biggest group (the Philippines), not the whole Pacific, and a labelled chip for each far member pans to them on tap. */
export default function PlaceMap({ places, nameOf, height = 300, testId = 'place-map', now = Date.now() }: { places: Place[]; nameOf: (personId: string) => string; height?: number; testId?: string; now?: number }) {
  const key = places.map((p) => `${p.personId}:${p.lat.toFixed(5)},${p.lon.toFixed(5)}:${placeAge(p.fixedAt, now).grey ? 1 : 0}`).join('|')
  const plan = fitPlan(places)
  const mapRef = useRef<LMap | null>(null)
  const [panned, setPanned] = useState(false)
  const fit = (m: LMap) => {
    const pts: [number, number][] = plan.main.map((p) => [p.lat, p.lon])
    if (pts.length > 1) m.fitBounds(pts, { padding: [40, 40], maxZoom: 16 })
    else if (pts.length === 1) m.setView(pts[0]!, 15)
  }
  const setup: MapSetup = (L, map) => {
    mapRef.current = map
    setPanned(false)
    for (const p of places) {
      const name = nameOf(p.personId)
      const el = document.createElement('span')
      el.className = `pm-pin${placeAge(p.fixedAt, now).grey ? ' pm-grey' : ''}`
      const b = document.createElement('b')
      b.textContent = initialsOf(name)
      el.append(b, document.createElement('i'))
      L.marker([p.lat, p.lon], { icon: L.divIcon({ html: el, className: 'pm-icon', iconSize: [36, 46], iconAnchor: [18, 46] }), keyboard: false, title: name }).addTo(map)
    }
    fit(map)
  }
  const overlay = plan.far.length > 0 && (
    <div className="pm-far" role="group" aria-label="Family members far away" data-testid="place-far">
      {plan.far.map(({ place, km }) => (
        <button key={place.personId} type="button" className="pm-chip" onClick={() => { mapRef.current?.setView([place.lat, place.lon], 10); setPanned(true) }}>
          {nameOf(place.personId)} · about {(Math.round(km / 100) * 100).toLocaleString('en-US')} km away
        </button>
      ))}
      {panned && <button type="button" className="pm-chip pm-back" onClick={() => { if (mapRef.current) fit(mapRef.current); setPanned(false) }}>Back to everyone nearby</button>}
    </div>
  )
  const near = plan.main
  const c = near.length ? near.reduce<[number, number]>((a, p) => [a[0] + p.lat / near.length, a[1] + p.lon / near.length], [0, 0]) : FALLBACK
  return <LazyMap height={height} center={c} zoom={places.length ? 13 : 5} depKey={key} setup={setup} label="Where everyone is" testId={testId} overlay={overlay || undefined} />
}
