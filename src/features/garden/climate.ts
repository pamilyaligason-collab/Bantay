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

/** A hand-picked type, tied to the province it was made in (null = made where no province was known; old saves were a bare number). */
export type Pick = { type: ClimateType; province: string | null }
const asPick = (v: Pick | ClimateType | null | undefined): Pick | null => (v == null ? null : typeof v === 'number' ? { type: v, province: null } : v)

/** The province decides, uncertain ones too (guess = the type is a best guess). A pick is used only where no province answers, or in the province it was made in. */
export function resolveClimate(place: ClimateResult | null, picked: Pick | ClimateType | null, province: string | null = null): { type: ClimateType | null; suggested: null; guess: boolean } {
  const pick = asPick(picked)
  if (place && !(pick && pick.province != null && pick.province === province)) return { type: place.type, suggested: null, guess: place.uncertain }
  return { type: pick ? pick.type : null, suggested: null, guess: false }
}

/** The current month (1-12), kept true by a minute tick and by the app coming back to the foreground. */
export function useMonth(): number {
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  useEffect(() => {
    const sync = () => setMonth(new Date().getMonth() + 1)
    const t = setInterval(sync, 60_000)
    const onVis = () => { if (document.visibilityState === 'visible') sync() }
    document.addEventListener('visibilitychange', onVis)
    sync()
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return month
}

/** Crops the bulletin lists for this type and month (1-12). */
export function cropsFor(type: ClimateType, month: number): { name: string; tagalog: string | null }[] {
  const t = (cropCalendar.types as Record<string, { crops: { name: string; tagalog: string | null; months: number[] }[] }>)[String(type)]
  return (t?.crops ?? []).filter((c) => c.months.includes(month)).map(({ name, tagalog }) => ({ name, tagalog }))
}

/** The climate type for Today: from the province of the current place (home when there is no fix); a hand pick only where no province answers or in the province it was made in. null type = ask the person. */
export function useClimate() {
  const [picked, setPicked, loaded] = useKv<Pick | ClimateType | null>(CLIMATE_KEY, null)
  const loc = useLocation()
  const [found, setFound] = useState<{ name: string | null; place: ClimateResult | null }>({ name: null, place: null })
  const [settled, setSettled] = useState(false) // the province lookup finished (found or not): until then an unknown type is not yet 'ask the person'
  const { lat, lon } = loc
  useEffect(() => {
    if (lat == null || lon == null) return
    let live = true
    void loadUnits().then((units) => { if (live) { const name = provinceNameAt({ lat, lon }, units); setFound({ name, place: climateTypeFor(name) }) } }, () => undefined).finally(() => { if (live) setSettled(true) })
    return () => { live = false }
  }, [lat, lon])
  const r = resolveClimate(found.place, picked, found.name)
  return { ...r, pick: (t: ClimateType) => setPicked({ type: t, province: found.name }), ready: loaded && settled }
}
