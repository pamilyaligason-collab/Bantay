import climate from '../../data/provinceClimate.json'
import { loadUnits, unitAt, type Unit } from '../safety/unitAt'
import type { LatLon } from './geo'

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
/** PAGASA's 83 province names (the keys of provinceClimate.json; supabase/functions/pagasa-drought/provinces.ts is the same list, province.test.ts checks it). */
const PAGASA = new Map(Object.keys(climate.provinces).map((n) => [norm(n), n] as const))

// The offline map's "City of Manila" outline covers all of Metro Manila (checked on units.json: Quezon City, Makati, Pasig, Taguig, Caloocan, Muntinlupa all fall in it).
const NCR = ['manila', 'city of manila', 'ncr', 'national capital region', 'metropolitan manila', 'metro manila', 'quezon city', 'makati', 'pasig', 'taguig', 'caloocan', 'mandaluyong', 'marikina', 'muntinlupa', 'las pinas', 'las piñas', 'malabon', 'navotas', 'paranaque', 'parañaque', 'pasay', 'san juan', 'valenzuela', 'pateros']
const ALIASES: Record<string, string> = {
  ...Object.fromEntries(NCR.map((n) => [n, 'Metro Manila'])),
  'city of isabela': 'Basilan', // the Basilan city, not Isabela province
  'isabela city': 'Basilan',
  'cotabato city': 'Maguindanao del Norte',
  'city of cotabato': 'Maguindanao del Norte',
  'city of zamboanga': 'Zamboanga del Sur',
  'zamboanga city': 'Zamboanga del Sur',
  'city of davao': 'Davao del Sur',
  'davao city': 'Davao del Sur',
  'city of general santos': 'South Cotabato',
  'general santos city': 'South Cotabato',
  'city of cebu': 'Cebu',
  'cebu city': 'Cebu',
  'city of lapu-lapu': 'Cebu',
  'city of mandaue': 'Cebu',
  'city of tacloban': 'Leyte',
  'city of bacolod': 'Negros Occidental',
  'city of iloilo': 'Iloilo',
  'city of lucena': 'Quezon',
  'city of cagayan de oro': 'Misamis Oriental',
  'city of butuan': 'Agusan del Norte',
  'city of iligan': 'Lanao del Norte',
  'city of olongapo': 'Zambales',
  'city of puerto princesa': 'Palawan',
  'city of baguio': 'Benguet',
  'city of angeles': 'Pampanga',
  'city of tagbilaran': 'Bohol',
  'tagbilaran city': 'Bohol',
  maguindanao: 'Maguindanao del Norte', // old name, two new provinces: the first stands in
  'compostela valley': 'Davao de Oro',
  'western samar': 'Samar'
}

/** The PAGASA province name for a place name (a province, a city, an NCR name, an old name), or null when it is none of them. */
export function provinceFromName(name: string | null | undefined): string | null {
  if (!name) return null
  const k = norm(name)
  return PAGASA.get(k) ?? ALIASES[k] ?? null
}

/** The PAGASA province for a point from the offline map units: a city inside a province uses the province; names PAGASA spells differently are mapped (City of Manila = Metro Manila). A unit with no PAGASA name keeps its own name. */
export function provinceFromUnits(p: LatLon, units: readonly Unit[]): string | null {
  const code = unitAt(p, units)
  const u = units.find((x) => x.code === code)
  if (!u) return null
  const name = units.find((x) => x.code === u.parent)?.name ?? u.name
  return provinceFromName(name) ?? provinceFromName(u.name) ?? name
}

/** The PAGASA province name for a point (null at sea, abroad, or while the offline map is unavailable). */
export async function placeProvince(p: LatLon): Promise<string | null> {
  return provinceFromUnits(p, await loadUnits())
}
