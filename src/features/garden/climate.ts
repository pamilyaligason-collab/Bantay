import { useEffect, useState } from 'react'
import cropCalendar from '../../data/cropCalendar.json'
import { climateTypeFor, type ClimateResult, type ClimateType } from '../../data/provinceClimate'
import { useLocation } from '../location/useLocation'
import { loadUnits, unitAt, type Unit } from '../safety/unitAt'
import { useKv } from '../shell/useKv'

export const CLIMATE_KEY = 'garden.climate'
export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** The four Coronas climate types (PAGASA), one line each. */
export const CLIMATE_TYPES: { type: ClimateType; line: string }[] = [
  { type: 1, line: 'Two seasons: dry from November to April, wet the rest of the year.' },
  { type: 2, line: 'No dry season; the most rain falls from November to January.' },
  { type: 3, line: 'No clear season; fairly dry from November to April, wet the rest of the year.' },
  { type: 4, line: 'Rain is spread fairly evenly through the year.' }
]

/** The province to look up: a city inside a province (General Santos in South Cotabato) uses the province. */
export function provinceNameAt(p: { lat: number; lon: number }, units: readonly Unit[]): string | null {
  const code = unitAt(p, units)
  const u = units.find((x) => x.code === code)
  if (!u) return null
  return units.find((x) => x.code === u.parent)?.name ?? u.name
}

/** A hand-picked type wins. Otherwise the province answers only when it is sure; an unsure answer is offered as a suggestion, never used. */
export function resolveClimate(place: ClimateResult | null, picked: ClimateType | null): { type: ClimateType | null; suggested: ClimateType | null } {
  if (picked) return { type: picked, suggested: null }
  if (place && !place.uncertain) return { type: place.type, suggested: null }
  return { type: null, suggested: place ? place.type : null }
}

/** Crops the bulletin lists for this type and month (1-12). */
export function cropsFor(type: ClimateType, month: number): { name: string; tagalog: string | null }[] {
  const t = (cropCalendar.types as Record<string, { crops: { name: string; tagalog: string | null; months: number[] }[] }>)[String(type)]
  return (t?.crops ?? []).filter((c) => c.months.includes(month)).map(({ name, tagalog }) => ({ name, tagalog }))
}

/** The climate type for Today: picked by hand (saved), else from the province of the current place (home when there is no fix). null type = ask the person. */
export function useClimate() {
  const [picked, setPicked, loaded] = useKv<ClimateType | null>(CLIMATE_KEY, null)
  const loc = useLocation()
  const [place, setPlace] = useState<ClimateResult | null>(null)
  const [settled, setSettled] = useState(false) // the province lookup finished (found or not): until then an unknown type is not yet 'ask the person'
  const { lat, lon } = loc
  useEffect(() => {
    if (lat == null || lon == null) return
    let live = true
    void loadUnits().then((units) => { if (live) setPlace(climateTypeFor(provinceNameAt({ lat, lon }, units))) }, () => undefined).finally(() => { if (live) setSettled(true) })
    return () => { live = false }
  }, [lat, lon])
  const r = resolveClimate(place, picked)
  return { ...r, pick: (t: ClimateType) => setPicked(t), ready: loaded && (picked != null || settled) }
}
