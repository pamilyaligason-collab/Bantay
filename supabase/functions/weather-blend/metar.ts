// METAR bias check (lane Q, optional): compare the blended "now" with the nearest airport's last observation and keep the offset per station.
// It is shown ("checked against Mactan-Cebu airport, 1.2 °C warmer"), never applied: one reading is not enough to correct a forecast.
// Source: aviationweather.gov Data API, no key, 100 requests/minute; at most one request per station per hour here.
import { distanceKm } from '../alerts-ingest/parse.ts'
import type { Cell, Check } from './blend.ts'

// RPVT Tagbilaran is listed (WMO 98644) but sent no METAR in the 48 h before 2026-10-31; the check is then simply absent.
export const STATIONS = [
  { id: 'RPVT', name: 'Tagbilaran airport', lat: 9.664, lon: 123.853 },
  { id: 'RPMR', name: 'General Santos airport', lat: 6.058, lon: 125.096 },
  { id: 'RPVM', name: 'Mactan-Cebu airport', lat: 10.308, lon: 123.978 }
]
const NEAR_KM = 20 // farther than this the airport's weather is not the cell's weather
const REFRESH_MS = 3600_000
const MAX_AGE_MS = 3 * 3600_000 // an observation or stored check older than this is not shown

export const metarUrl = (id: string) => `https://aviationweather.gov/api/data/metar?ids=${id}&format=json`
export const nearestStation = (c: Cell) => STATIONS.map((s) => ({ s, km: distanceKm(c, s) })).filter((x) => x.km <= NEAR_KM).sort((a, b) => a.km - b.km)[0]?.s ?? null

/** Latest observation: temperature (°C) and when, or null when there is none recent. */
export function parseMetar(j: unknown, nowMs: number): { temp: number; at: string } | null {
  const o = (Array.isArray(j) ? j[0] : null) as { temp?: unknown; obsTime?: unknown } | null
  const t = typeof o?.temp === 'number' ? o.temp : null
  const ms = typeof o?.obsTime === 'number' ? o.obsTime * 1000 : NaN
  return t == null || Number.isNaN(ms) || nowMs - ms > MAX_AGE_MS ? null : { temp: t, at: new Date(ms).toISOString() }
}

export interface StationRow { station: string; name: string; observed_at: string; temp_c: number; updated_at: string } // the observation only
export interface StationPort { read(id: string): Promise<StationRow | null>; write(r: StationRow): Promise<void>; fetchJson(url: string): Promise<unknown> }

/** The check for this cell: the station's last observation (refreshed at most hourly) against this cell's own forecast. Null when no station is near or nothing recent is known. */
export async function stationCheck(port: StationPort, cell: Cell, forecastTemp: number | null, nowMs: number): Promise<Check | null> {
  const st = nearestStation(cell)
  if (!st || forecastTemp == null) return null
  let row = await port.read(st.id)
  if (!row || nowMs - Date.parse(row.updated_at) >= REFRESH_MS) {
    const obs = parseMetar(await port.fetchJson(metarUrl(st.id)).catch(() => null), nowMs)
    if (obs) { row = { station: st.id, name: st.name, observed_at: obs.at, temp_c: obs.temp, updated_at: new Date(nowMs).toISOString() }; await port.write(row) }
  }
  if (!row || nowMs - Date.parse(row.observed_at) > MAX_AGE_MS) return null
  const t = Number(row.temp_c)
  return { station: row.station, name: row.name, observedAt: row.observed_at, observedTemp: t, forecastTemp, bias: Math.round((t - forecastTemp) * 10) / 10 }
}
