import { distanceKm, type HomePlace, type LatLon } from './geo'

// S30 L9 (F1): the places a member can pick as "My home place" without any network call (a geocoder would be a new third-party host the privacy screen must list, ML-45).
// City-centre points rounded to 2 decimals (about 1 km), with the IANA zone of the city. Texas first (the family's other home), then the rest of the US, the usual
// destinations abroad, and a few Philippine cities so a member can move back. ponytail: a short list, not every town; "Use my phone's place" covers any other place. Add a city here, never a lookup service.
export const HOME_CITIES: readonly Required<HomePlace>[] = [
  { name: 'Houston, Texas', lat: 29.76, lon: -95.37, tz: 'America/Chicago' },
  { name: 'Dallas, Texas', lat: 32.78, lon: -96.8, tz: 'America/Chicago' },
  { name: 'Austin, Texas', lat: 30.27, lon: -97.74, tz: 'America/Chicago' },
  { name: 'San Antonio, Texas', lat: 29.42, lon: -98.49, tz: 'America/Chicago' },
  { name: 'Fort Worth, Texas', lat: 32.75, lon: -97.33, tz: 'America/Chicago' },
  { name: 'Arlington, Texas', lat: 32.74, lon: -97.11, tz: 'America/Chicago' },
  { name: 'Plano, Texas', lat: 33.02, lon: -96.7, tz: 'America/Chicago' },
  { name: 'Irving, Texas', lat: 32.81, lon: -96.95, tz: 'America/Chicago' },
  { name: 'Katy, Texas', lat: 29.79, lon: -95.82, tz: 'America/Chicago' },
  { name: 'Sugar Land, Texas', lat: 29.62, lon: -95.63, tz: 'America/Chicago' },
  { name: 'Pasadena, Texas', lat: 29.69, lon: -95.21, tz: 'America/Chicago' },
  { name: 'Corpus Christi, Texas', lat: 27.8, lon: -97.4, tz: 'America/Chicago' },
  { name: 'Laredo, Texas', lat: 27.51, lon: -99.51, tz: 'America/Chicago' },
  { name: 'McAllen, Texas', lat: 26.2, lon: -98.23, tz: 'America/Chicago' },
  { name: 'Lubbock, Texas', lat: 33.58, lon: -101.86, tz: 'America/Chicago' },
  { name: 'Amarillo, Texas', lat: 35.22, lon: -101.83, tz: 'America/Chicago' },
  { name: 'El Paso, Texas', lat: 31.76, lon: -106.49, tz: 'America/Denver' },
  { name: 'Los Angeles, California', lat: 34.05, lon: -118.24, tz: 'America/Los_Angeles' },
  { name: 'San Francisco, California', lat: 37.77, lon: -122.42, tz: 'America/Los_Angeles' },
  { name: 'San Diego, California', lat: 32.72, lon: -117.16, tz: 'America/Los_Angeles' },
  { name: 'Seattle, Washington', lat: 47.61, lon: -122.33, tz: 'America/Los_Angeles' },
  { name: 'Las Vegas, Nevada', lat: 36.17, lon: -115.14, tz: 'America/Los_Angeles' },
  { name: 'Phoenix, Arizona', lat: 33.45, lon: -112.07, tz: 'America/Phoenix' },
  { name: 'Denver, Colorado', lat: 39.74, lon: -104.99, tz: 'America/Denver' },
  { name: 'Chicago, Illinois', lat: 41.88, lon: -87.63, tz: 'America/Chicago' },
  { name: 'New Orleans, Louisiana', lat: 29.95, lon: -90.07, tz: 'America/Chicago' },
  { name: 'New York, New York', lat: 40.71, lon: -74.01, tz: 'America/New_York' },
  { name: 'Washington, DC', lat: 38.91, lon: -77.04, tz: 'America/New_York' },
  { name: 'Atlanta, Georgia', lat: 33.75, lon: -84.39, tz: 'America/New_York' },
  { name: 'Miami, Florida', lat: 25.76, lon: -80.19, tz: 'America/New_York' },
  { name: 'Honolulu, Hawaii', lat: 21.31, lon: -157.86, tz: 'Pacific/Honolulu' },
  { name: 'Toronto, Canada', lat: 43.65, lon: -79.38, tz: 'America/Toronto' },
  { name: 'Vancouver, Canada', lat: 49.28, lon: -123.12, tz: 'America/Vancouver' },
  { name: 'London, United Kingdom', lat: 51.51, lon: -0.13, tz: 'Europe/London' },
  { name: 'Dubai, United Arab Emirates', lat: 25.2, lon: 55.27, tz: 'Asia/Dubai' },
  { name: 'Riyadh, Saudi Arabia', lat: 24.71, lon: 46.68, tz: 'Asia/Riyadh' },
  { name: 'Doha, Qatar', lat: 25.29, lon: 51.53, tz: 'Asia/Qatar' },
  { name: 'Singapore', lat: 1.35, lon: 103.82, tz: 'Asia/Singapore' },
  { name: 'Hong Kong', lat: 22.32, lon: 114.17, tz: 'Asia/Hong_Kong' },
  { name: 'Tokyo, Japan', lat: 35.68, lon: 139.69, tz: 'Asia/Tokyo' },
  { name: 'Sydney, Australia', lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' },
  { name: 'Manila, Philippines', lat: 14.6, lon: 120.98, tz: 'Asia/Manila' },
  { name: 'Cebu City, Philippines', lat: 10.32, lon: 123.89, tz: 'Asia/Manila' },
  { name: 'Tagbilaran, Philippines', lat: 9.65, lon: 123.86, tz: 'Asia/Manila' },
  { name: 'General Santos, Philippines', lat: 6.12, lon: 125.17, tz: 'Asia/Manila' },
  { name: 'Davao City, Philippines', lat: 7.07, lon: 125.61, tz: 'Asia/Manila' }
]

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
/** Cities whose name has every typed word (any order, any case). Empty text: the first few (Texas), so the sheet is never blank. */
export function searchCities(text: string, limit = 8): Required<HomePlace>[] {
  const words = norm(text).split(' ').filter(Boolean)
  const hit = HOME_CITIES.filter((c) => words.every((w) => norm(c.name).includes(w)))
  return hit.slice(0, limit)
}

/** The listed city within 60 km of a point, nearest first: names a GPS place ("Houston, Texas"), else null (the sheet then says "My current place"). */
export function nearestCity(p: LatLon, maxKm = 60): Required<HomePlace> | null {
  let best: Required<HomePlace> | null = null, bestKm = maxKm
  for (const c of HOME_CITIES) { const d = distanceKm(p, c); if (d <= bestKm) { best = c; bestKm = d } }
  return best
}
