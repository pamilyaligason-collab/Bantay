import type { LatLon } from '../location/geo'
const r2 = (n: number) => Math.round(n * 100) / 100

/** Zoom 5 shows about 1,500 km across a phone: enough to see a storm coming, centred on where the person is (not a fixed 12N 128E). */
export const STORM_ZOOM = 5

export const stormCentre = (loc: LatLon) => ({ lat: r2(loc.lat), lon: r2(loc.lon), zoom: STORM_ZOOM })

/** Zoom Earth satellite view centred on the same place. */
export const zoomEarthUrl = (loc: LatLon) => `https://zoom.earth/maps/satellite/#view=${r2(loc.lat).toFixed(2)},${r2(loc.lon).toFixed(2)},${STORM_ZOOM}z`
