import type { Alert, LatLon } from '../safety/alerts'
import { stormCentre } from '../safety/stormView'
import { pickStorm } from '../today/stormView'

/** The Storms near you frame in CSS px (wxs7w.css: 240 tall; 324 wide is a 390 px phone). shortcut: a narrower phone shows a smaller frame than this, so a storm at the edge of the fit can sit near its border; measure the frame if that matters. */
export const FRAME = { w: 324, h: 240 }
/** Clear space kept at the top and sides so neither marker sits on the frame edge. */
export const MARGIN = 24
/** Clear space at the bottom: on the real embed at 324 x 240 Windy's time bubble (y 176-194), play button (y 186-216) and time bar (y 200-240) cover about 64 px there, so the pin gets 70. */
export const MARGIN_BOTTOM = 70
export const MIN_ZOOM = 3
export const MAX_ZOOM = 8

const merc = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) // Web Mercator y (radians), as Windy draws
const unmerc = (y: number) => (2 * Math.atan(Math.exp(y)) * 180) / Math.PI - 90
const wrap = (lon: number) => ((((lon + 180) % 360) + 360) % 360) - 180

/** Centre and zoom for the Storms near you map (D-128 rule 6): the place and the nearest listed storm together. Windy is Web Mercator with 256 px tiles (measured 12.4 px per degree of latitude at zoom 4, 20N), so the map is 256 * 2^zoom px round: the zoom is the highest from 3 to 8 where both points sit inside the frame less the margins (276 px wide, 146 px tall), across the antimeridian by the short way. The free band runs from y 24 to y 170, so its middle is 23 px above the frame's middle: the map is centred 23 px south of the two points' midpoint.
 *  `alone` is true when a storm has a position but even zoom 3 cannot hold it with the place: the map then keeps the place at the storm zoom (5) and the sentence above it carries the distance. */
export function stormFrame(alerts: Alert[], from: LatLon): { lat: number; lon: number; zoom: number; alone: boolean } {
  const s = pickStorm(alerts, from)
  const home = { ...stormCentre(from), alone: false }
  if (!s) return home
  const dLon = wrap(s.lon - from.lon) // -180..180: the short way round
  const dMerc = merc(s.lat) - merc(from.lat)
  let zoom = MAX_ZOOM
  while (zoom >= MIN_ZOOM) {
    const px = 256 * 2 ** zoom
    if (Math.abs(dLon) * px / 360 <= FRAME.w - 2 * MARGIN && Math.abs(dMerc) * px / (2 * Math.PI) <= FRAME.h - MARGIN - MARGIN_BOTTOM) {
      const r = (n: number) => Math.round(n * 100) / 100
      return { lat: r(unmerc((merc(s.lat) + merc(from.lat)) / 2 - ((MARGIN_BOTTOM - MARGIN) / 2) * 2 * Math.PI / px)), lon: r(wrap(from.lon + dLon / 2)), zoom, alone: false }
    }
    zoom--
  }
  return { ...home, alone: true }
}
