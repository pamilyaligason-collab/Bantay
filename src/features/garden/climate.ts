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
const isType = (n: unknown): n is ClimateType => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 4
/** kv is a trust boundary: only a whole 1-4 (old save) or {type 1-4, province string|null} counts; anything else is no pick. */
export const asPick = (v: unknown): Pick | null => {
  if (isType(v)) return { type: v, province: null }
  const o = v as { type?: unknown; province?: unknown } | null
  if (o && typeof o === 'object' && isType(o.type)) return { type: o.type, province: typeof o.province === 'string' ? o.province : null }
  return null
}

/** The province decides, uncertain ones too (guess = the type is a best guess). A pick is used only where no province answers, or in the province it was made in. */
export function resolveClimate(place: ClimateResult | null, picked: unknown, province: string | null = null): { type: ClimateType | null; guess: boolean } {
  const pick = asPick(picked)
  if (place && !(pick && pick.province != null && pick.province === province)) return { type: place.type, guess: place.uncertain }
  return { type: pick ? pick.type : null, guess: false }
}

/** The month (1-12) in Manila time, so a phone set to another zone still shows the Philippine month. */
export const manilaMonth = (now: Date = new Date()): number => Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Manila', month: 'numeric' }).format(now))

/** The current month, kept true by a minute tick and by the app coming back to the foreground. */
export function useMonth(): number {
  const [month, setMonth] = useState(() => manilaMonth())
  useEffect(() => {
    const sync = () => setMonth(manilaMonth())
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
  const [picked, setPicked, loaded] = useKv<unknown>(CLIMATE_KEY, null)
  const loc = useLocation()
  const [found, setFound] = useState<{ name: string | null; place: ClimateResult | null }>({ name: null, place: null })
  const [settled, setSettled] = useState(false) // the province lookup finished (found or not): until then an unknown type is not yet 'ask the person'
  const { lat, lon } = loc
  useEffect(() => {
    if (lat == null || lon == null) return
    let live = true
    void loadUnits().then((units) => { if (live) { const name = provinceNameAt({ lat, lon }, units); setFound((f) => (f.name === name ? f : { name, place: climateTypeFor(name) })) } }, () => undefined).finally(() => { if (live) setSettled(true) })
    return () => { live = false }
  }, [lat, lon])
  const r = resolveClimate(found.place, picked, found.name)
  return { ...r, province: found.name, pick: (t: ClimateType) => setPicked({ type: t, province: found.name }), ready: loaded && settled }
}
