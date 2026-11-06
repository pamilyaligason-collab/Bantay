import { initialsOf } from '../auth/family'
import LazyMap, { type MapSetup } from '../safety/LazyMap'
import { placeAge } from './placeAge'
import type { Place } from './placeApi'
import './place.css'

const FALLBACK: [number, number] = [12.88, 121.77] // the Philippines, only for the instant before fitBounds runs

/** Family pins on the shared map (D-136, board S22FamilyMap). Each pin is a round badge with the person's initials; a point older than 6 h is drawn grey (class pm-grey, ring and fill, and the list under the map says "may be out of date").
 *  Uses LazyMap, so the offline basemap and the OSM fallback behave as on the Safety maps. Latest point only; no trail. */
export default function PlaceMap({ places, nameOf, height = 300, testId = 'place-map', now = Date.now() }: { places: Place[]; nameOf: (personId: string) => string; height?: number; testId?: string; now?: number }) {
  const key = places.map((p) => `${p.personId}:${p.lat.toFixed(5)},${p.lon.toFixed(5)}:${placeAge(p.fixedAt, now).grey ? 1 : 0}`).join('|')
  const setup: MapSetup = (L, map) => {
    const pts: [number, number][] = []
    for (const p of places) {
      const name = nameOf(p.personId)
      const el = document.createElement('span')
      el.className = `pm-pin${placeAge(p.fixedAt, now).grey ? ' pm-grey' : ''}`
      const b = document.createElement('b')
      b.textContent = initialsOf(name)
      el.append(b, document.createElement('i'))
      L.marker([p.lat, p.lon], { icon: L.divIcon({ html: el, className: 'pm-icon', iconSize: [36, 46], iconAnchor: [18, 46] }), keyboard: false, title: name }).addTo(map)
      pts.push([p.lat, p.lon])
    }
    if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 })
    else if (pts.length === 1) map.setView(pts[0]!, 15)
  }
  const c = places.length ? places.reduce<[number, number]>((a, p) => [a[0] + p.lat / places.length, a[1] + p.lon / places.length], [0, 0]) : FALLBACK
  return <LazyMap height={height} center={c} zoom={places.length ? 13 : 5} depKey={key} setup={setup} label="Where everyone is" testId={testId} />
}
